import { readdir, readFile } from "node:fs/promises";
import { readTeam } from "./config";
import { CONTACTS_FILE, DATA_DIR, safeDataPath } from "./paths";

export type Role = "me" | "team" | "client";

export interface Contacts {
  /** id (LID/número) -> nome. */
  names: Map<string, string>;
  /** ids que são "você" (detectados pelas mensagens fromMe). */
  ownIds: Set<string>;
  /** ids marcados como time. */
  teamIds: Set<string>;
  /**
   * user-part (LID OU telefone) -> telefone real (só dígitos), do sidecar
   * `.contacts.json` do coletor. Vazio se o sidecar não existir (coletor antigo).
   */
  phones: Map<string, string>;
  /** user-parts que o sidecar conhece como LID (id de privacidade, não telefone). */
  lids: Set<string>;
  /** True se o sidecar `.contacts.json` foi carregado (coletor novo). */
  hasSidecar: boolean;
}

/** Entrada do sidecar de contatos escrito pelo coletor. */
interface SidecarEntry {
  phone?: string;
  lid?: string;
  name?: string;
}
interface ContactSidecar {
  version?: number;
  contacts?: Record<string, SidecarEntry>;
}

/**
 * Lê o sidecar `.contacts.json` (mapa LID↔telefone↔nome). Retorna mapas vazios
 * se o arquivo não existir/estiver corrompido — o painel segue funcionando.
 */
async function readContactSidecar(): Promise<{
  phones: Map<string, string>;
  names: Map<string, string>;
  lids: Set<string>;
  hasSidecar: boolean;
}> {
  const phones = new Map<string, string>();
  const names = new Map<string, string>();
  const lids = new Set<string>();
  try {
    const raw = await readFile(CONTACTS_FILE, "utf8");
    const data = JSON.parse(raw) as ContactSidecar;
    for (const [key, entry] of Object.entries(data.contacts ?? {})) {
      if (entry.phone) phones.set(key, entry.phone);
      if (entry.name) names.set(key, entry.name);
      // A chave é um LID quando o coletor a registrou como tal (entry.lid === key).
      if (entry.lid && entry.lid === key) lids.add(key);
    }
    return { phones, names, lids, hasSidecar: true };
  } catch {
    /* sem sidecar (coletor antigo) ou JSON inválido — fallback silencioso */
    return { phones, names, lids, hasSidecar: false };
  }
}

/** Telefone real (user-part) de um id, ou null se desconhecido. */
export function phoneOf(c: Contacts, id: string): string | null {
  return c.phones.get(id) ?? null;
}

/**
 * JID de DM pronto para envio (`<telefone>@s.whatsapp.net`), ou null quando o
 * telefone real não é conhecido (id é só um LID sem mapeamento). Nunca devolve
 * um jid com LID embutido — isso geraria um destino inválido.
 */
export function dmJidOf(c: Contacts, id: string): string | null {
  // 1) Telefone real conhecido pelo sidecar (cobre id=LID e id=telefone).
  const mapped = c.phones.get(id);
  if (mapped) return `${mapped}@s.whatsapp.net`;
  // 2) Sidecar diz que esse id é um LID sem telefone resolvido → sem DM.
  if (c.lids.has(id)) return null;
  // 3) Sem sidecar (coletor antigo): mantém o comportamento anterior (id = número).
  //    Com sidecar mas id desconhecido: assume telefone só se parecer número.
  if (!c.hasSidecar) return /^\d{6,}$/.test(id) ? `${id}@s.whatsapp.net` : null;
  return /^\d{6,}$/.test(id) ? `${id}@s.whatsapp.net` : null;
}

/** user-part de um jid: 250...@lid -> 250..., 55..:12@s.. -> 55.. */
export function numberFromJid(jid: string): string {
  return (jid.split("@")[0] ?? "").split(":")[0] ?? "";
}

/**
 * jid para ENVIAR uma DM, resolvendo o user-part pelo sidecar — usado pelo
 * `responder` do MCP. Crítico: um LID (ex.: `100000000000001`) NÃO é telefone;
 * montar `<lid>@s.whatsapp.net` gera destino inexistente (a mensagem some sem erro).
 *  - telefone real conhecido (LID mapeado ou já-telefone) → `<phone>@s.whatsapp.net`;
 *  - LID conhecido sem telefone                            → `<lid>@lid` (destino válido);
 *  - só dígitos, sem nada no sidecar                       → `<num>@s.whatsapp.net`;
 *  - senão                                                 → null (não envia às cegas).
 * Difere de `dmJidOf` (conservador, nunca devolve `@lid`); aqui o `@lid` é um
 * destino de envio válido e comprovado.
 */
export function sendableDmJid(c: Contacts, userPart: string): string | null {
  const phone = c.phones.get(userPart);
  if (phone) return `${phone}@s.whatsapp.net`;
  if (c.lids.has(userPart)) return `${userPart}@lid`;
  if (/^\d{8,}$/.test(userPart)) return `${userPart}@s.whatsapp.net`;
  return null;
}

export function roleOf(c: Contacts, id: string): Role {
  if (c.ownIds.has(id)) return "me";
  if (c.teamIds.has(id)) return "team";
  return "client";
}

export function nameOf(c: Contacts, id: string): string {
  return c.names.get(id) ?? id;
}

/** Troca @id -> @você / @nome no texto (para o que a IA lê). */
export function resolveMentions(text: string, c: Contacts): string {
  return text.replace(/@(\d{6,})/g, (_full, num: string) =>
    c.ownIds.has(num) ? "@você" : `@${c.names.get(num) ?? num}`,
  );
}

/**
 * Varre todos os grupos e monta o mapa de contatos: id->nome, quem é você
 * (fromMe) e quem está no time (config). Base para papel (me/team/client).
 */
export async function buildContacts(): Promise<Contacts> {
  const names = new Map<string, string>();
  const ownIds = new Set<string>();

  let slugs: string[] = [];
  try {
    slugs = (await readdir(DATA_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    /* sem dados ainda */
  }

  for (const slug of slugs) {
    let raw = "";
    try {
      raw = await readFile(safeDataPath(slug, "messages.jsonl"), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const m = JSON.parse(trimmed) as {
          sender?: string;
          senderName?: string;
          fromMe?: boolean;
        };
        const jid = m.sender ?? "";
        // Ignora remetentes que caíram no jid do grupo (não são pessoas).
        if (jid.endsWith("@g.us")) continue;
        const num = numberFromJid(jid);
        if (!num) continue;
        // Nome real tem prioridade sobre "Você"/número.
        if (m.senderName && m.senderName !== "Você") names.set(num, m.senderName);
        else if (!names.has(num)) names.set(num, m.senderName ?? num);
        if (m.fromMe) ownIds.add(num);
      } catch {
        /* linha corrompida */
      }
    }
  }

  // Enriquece com o sidecar do coletor (telefone real + nome melhor).
  const sidecar = await readContactSidecar();
  // Nomes do sidecar têm prioridade (vêm de name/notify/verifiedName do WhatsApp).
  for (const [id, name] of sidecar.names) {
    if (name && name !== "Você") names.set(id, name);
    else if (!names.has(id)) names.set(id, name);
  }

  const teamIds = new Set(await readTeam());
  return {
    names,
    ownIds,
    teamIds,
    phones: sidecar.phones,
    lids: sidecar.lids,
    hasSidecar: sidecar.hasSidecar,
  };
}
