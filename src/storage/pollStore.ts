import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Registro server-side de enquetes, persistido como sidecar JSON em
 * `<DATA_DIR>/.polls.json`. É a ÚNICA cópia do `messageSecret` da enquete — sem
 * ele, `decryptPollVote` não decifra os votos. Por isso o secret fica AQUI e
 * nunca no `polls.jsonl` por grupo (que o painel lê/expõe): este dotfile não é
 * servido pela API do painel.
 *
 * Indexado pelo id da mensagem de criação (`pollMsgId`), que o voto referencia
 * via `pollCreationMessageKey.id`. Sobrevive a restart: votos que chegam depois
 * de reconectar ainda acham o secret aqui.
 */

/** Uma enquete conhecida (o que a apuração de votos precisa). */
export interface PollEntry {
  /** JID de quem criou a enquete (autor da key de criação). */
  creatorJid: string;
  /** `messageSecret` (32 bytes) em base64 — chave de decifragem dos votos. */
  secretB64: string;
  /** hash sha256(optionName) -> nome da opção (para mapear o voto decifrado). */
  options: Record<string, string>;
}

interface PollSidecar {
  version: 1;
  updatedAt: string;
  polls: Record<string, PollEntry>;
}

const SIDECAR_NAME = '.polls.json';

/**
 * Acumula em memória o mapa de enquetes e persiste atomicamente. Tolerante a
 * falhas: nada aqui pode derrubar o coletor (fire-and-forget no chamador).
 */
export class PollStore {
  private readonly path: string;
  private readonly polls = new Map<string, PollEntry>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, SIDECAR_NAME);
  }

  /** Carrega o sidecar existente (se houver) — enquetes de execuções anteriores. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const data = JSON.parse(raw) as PollSidecar;
      for (const [id, entry] of Object.entries(data?.polls ?? {})) {
        if (entry?.secretB64 && entry?.creatorJid) this.polls.set(id, entry);
      }
    } catch {
      // Sem sidecar ainda — começa vazio.
    }
  }

  /** Registra (ou atualiza) uma enquete conhecida. Idempotente por pollMsgId. */
  set(pollMsgId: string, entry: PollEntry): void {
    if (!pollMsgId || !entry.secretB64 || !entry.creatorJid) return;
    this.polls.set(pollMsgId, entry);
    this.scheduleFlush();
  }

  /** Recupera o que a apuração precisa para um voto, ou undefined se desconhecida. */
  get(pollMsgId: string): PollEntry | undefined {
    return this.polls.get(pollMsgId);
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
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
      const polls: Record<string, PollEntry> = {};
      for (const [id, entry] of this.polls) polls[id] = entry;
      const snapshot: PollSidecar = { version: 1, updatedAt: new Date().toISOString(), polls };
      const tmp = `${this.path}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
      await rename(tmp, this.path);
    } catch {
      this.dirty = true;
    }
  }
}
