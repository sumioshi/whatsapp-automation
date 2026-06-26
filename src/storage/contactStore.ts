import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Mapa de contatos LID↔telefone↔nome, persistido como sidecar JSON em
 * `<DATA_DIR>/.contacts.json`. Resolve o problema de contatos derivados de
 * grupo cujo `id` é um LID (`<num>@lid`, ID de privacidade) e não o telefone.
 *
 * O mapa é indexado pela "user-part" do JID (o pedaço antes do `@`, sem o
 * sufixo de device `:NN`), porque é assim que o painel chaveia contatos
 * (ver `web/lib/contacts.ts#numberFromJid`). Tanto a user-part do LID quanto a
 * do telefone apontam para a MESMA entrada enriquecida, então o painel resolve
 * nome+telefone a partir de qualquer um dos dois.
 */

/** Uma entrada de contato resolvida. Campos opcionais = ainda não conhecidos. */
export interface ContactEntry {
  /** user-part do telefone real (só dígitos), quando conhecido. */
  phone?: string;
  /** user-part do LID (`<num>` de `<num>@lid`), quando conhecido. */
  lid?: string;
  /** Melhor nome conhecido (name salvo > notify/pushName). */
  name?: string;
}

/** Formato do arquivo `.contacts.json`. */
export interface ContactSidecar {
  version: 1;
  updatedAt: string;
  /** user-part (LID ou telefone) -> entrada. Chaves duplicadas apontam p/ a mesma info. */
  contacts: Record<string, ContactEntry>;
}

const SIDECAR_NAME = '.contacts.json';

/** user-part de um jid: `250...@lid` -> `250...`, `55..:12@s..` -> `55..`. */
function userPart(jid: string): string {
  return (jid.split('@')[0] ?? '').split(':')[0] ?? '';
}

/** True se o jid é um LID (`@lid`). */
function isLid(jid: string): boolean {
  return jid.endsWith('@lid');
}

/** True se o jid é um telefone real (`@s.whatsapp.net`). */
function isPhone(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net');
}

/**
 * Acumula em memória o mapa de contatos e persiste atomicamente em disco.
 * Tolerante a falhas: nada aqui pode derrubar o coletor — erros são engolidos
 * pelo chamador (fire-and-forget). O sidecar é 100% opcional para o painel.
 */
export class ContactStore {
  private readonly path: string;
  /** Chave canônica de uma pessoa (preferimos o telefone; senão o LID). */
  private readonly people = new Map<string, ContactEntry>();
  /** Alias user-part (lid OU phone) -> chave canônica. */
  private readonly aliasToKey = new Map<string, string>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, SIDECAR_NAME);
  }

  /** Carrega o sidecar existente (se houver) para não perder o que já se sabia. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const data = JSON.parse(raw) as ContactSidecar;
      if (data?.contacts) {
        for (const [, entry] of Object.entries(data.contacts)) {
          this.merge({ phone: entry.phone, lid: entry.lid, name: entry.name });
        }
      }
    } catch {
      // Sem sidecar ainda (coletor novo) — começa vazio.
    }
  }

  /**
   * Mescla uma observação de contato. Aceita qualquer combinação de
   * lid/phone/name; vincula os aliases e funde com o que já se sabe.
   */
  merge(obs: { lid?: string; phone?: string; name?: string }): void {
    const lid = obs.lid?.trim() || undefined;
    const phone = obs.phone?.trim() || undefined;
    const name = obs.name?.trim() || undefined;
    if (!lid && !phone) return;

    // Acha uma chave canônica já existente por qualquer alias.
    const existingKey =
      (phone && this.aliasToKey.get(phone)) || (lid && this.aliasToKey.get(lid)) || undefined;
    // Preferimos o telefone como chave canônica; senão o LID.
    const key = existingKey ?? phone ?? (lid as string);

    const entry: ContactEntry = this.people.get(key) ?? {};
    if (phone) entry.phone = phone;
    if (lid) entry.lid = lid;
    // Nome adota quando não havia nenhum, ou quando o novo é "significativo"
    // (pushName/notify real) e o atual era só um número/placeholder.
    if (name && (!entry.name || (isMeaningfulName(name) && !isMeaningfulName(entry.name)))) {
      entry.name = name;
    }
    this.people.set(key, entry);

    // (Re)vincula aliases para a chave canônica.
    if (phone) this.aliasToKey.set(phone, key);
    if (lid) this.aliasToKey.set(lid, key);
    // Se a chave canônica migrou (ex.: descobrimos o telefone de um LID antes só-LID),
    // reaponta a entrada antiga.
    if (existingKey && existingKey !== key) {
      const old = this.people.get(existingKey);
      if (old) {
        if (old.phone && !entry.phone) entry.phone = old.phone;
        if (old.lid && !entry.lid) entry.lid = old.lid;
        if (old.name && !entry.name) entry.name = old.name;
        this.people.delete(existingKey);
      }
    }
    this.scheduleFlush();
  }

  /**
   * Aceita um Contact do Baileys (que pode trazer id, lid, phoneNumber, name,
   * notify, verifiedName) e o normaliza para uma observação.
   */
  mergeContact(c: {
    id?: string;
    lid?: string;
    phoneNumber?: string;
    name?: string;
    notify?: string;
    verifiedName?: string;
  }): void {
    let lid = c.lid && isLid(c.lid) ? userPart(c.lid) : undefined;
    let phone = c.phoneNumber && isPhone(c.phoneNumber) ? userPart(c.phoneNumber) : undefined;
    // O `id` pode ser LID ou telefone — classifica pelo sufixo.
    if (c.id) {
      if (isLid(c.id) && !lid) lid = userPart(c.id);
      else if (isPhone(c.id) && !phone) phone = userPart(c.id);
    }
    const name = c.name?.trim() || c.verifiedName?.trim() || c.notify?.trim() || undefined;
    this.merge({ lid, phone, name });
  }

  /** Vincula explicitamente um LID a um telefone (vindo do lid-mapping). */
  mergeLidPn(lidJidOrNum: string, pnJidOrNum: string): void {
    const lid = userPart(lidJidOrNum);
    const phone = userPart(pnJidOrNum);
    if (!lid || !phone) return;
    this.merge({ lid, phone });
  }

  /** user-parts de LID dos contatos cujo telefone ainda não foi resolvido. */
  lidsWithoutPhone(): string[] {
    const out: string[] = [];
    for (const entry of this.people.values()) {
      if (entry.lid && !entry.phone) out.push(entry.lid);
    }
    return out;
  }

  /** Snapshot serializável (com chaves duplicadas por alias p/ o painel). */
  snapshot(): ContactSidecar {
    const contacts: Record<string, ContactEntry> = {};
    for (const entry of this.people.values()) {
      const out: ContactEntry = {};
      if (entry.phone) out.phone = entry.phone;
      if (entry.lid) out.lid = entry.lid;
      if (entry.name) out.name = entry.name;
      // Indexa por telefone E por LID (ambas user-parts resolvem a mesma info).
      if (entry.phone) contacts[entry.phone] = out;
      if (entry.lid) contacts[entry.lid] = out;
    }
    return { version: 1, updatedAt: new Date().toISOString(), contacts };
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    // Debounce: agrupa rajadas de updates (ex.: contacts.upsert em massa).
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 500);
  }

  /** Grava o sidecar atomicamente (tmp + rename) se houver mudanças. */
  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(this.snapshot(), null, 2)}\n`, 'utf8');
      await rename(tmp, this.path);
    } catch {
      // Falha de escrita não pode derrubar o coletor; tenta de novo no próximo flush.
      this.dirty = true;
    }
  }
}

/** Um nome é "significativo" se não for só dígitos/JID (ex.: pushName real). */
function isMeaningfulName(name: string): boolean {
  return !/^\d+$/.test(name) && name !== 'Você';
}
