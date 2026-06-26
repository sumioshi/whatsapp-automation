import { access, readdir, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { buildContacts, numberFromJid } from './contacts';
import { CHATS_FILE, DATA_DIR, safeDataPath } from './paths';
import { readTriage } from './triage';

/** Espelha o MessageRecord gravado pelo coletor no messages.jsonl. */
export interface MessageRecord {
  id: string;
  timestamp: string;
  group: string;
  groupJid: string;
  sender: string;
  senderName: string;
  /** true se enviada pela própria conta (mensagens antigas podem não ter). */
  fromMe?: boolean;
  type:
    | 'text'
    | 'audio'
    | 'video'
    | 'image'
    | 'document'
    | 'sticker'
    | 'gif'
    | 'location'
    | 'contact'
    | 'poll'
    | 'event';
  text: string;
  quotedText: string | null;
  /** JID de quem escreveu a mensagem citada (reply), se houver. */
  quotedSender?: string | null;
  mediaPath: string | null;
}

interface ReactionRecord {
  targetId: string;
  emoji: string;
  reactor: string;
  reactorName: string;
  fromMe: boolean;
  timestamp: string;
}

export interface ReactionView {
  emoji: string;
  reactor: string;
  by: string;
  fromMe: boolean;
}

interface ReceiptRecord {
  targetId: string;
  status: 'sent' | 'delivered' | 'read';
  readBy: number;
  deliveredBy: number;
  /** JIDs de quem leu — ausente em registros antigos. */
  readByJids?: string[];
  /** JIDs de quem recebeu — ausente em registros antigos. */
  deliveredByJids?: string[];
  timestamp: string;
}

/** Entrega/leitura de uma mensagem própria (anexada só em fromMe). */
export interface ReceiptView {
  status: 'sent' | 'delivered' | 'read';
  /** Participantes que já leram (em grupo). 0 quando não disponível. */
  readBy: number;
  /** Participantes que já receberam. 0 quando não disponível. */
  deliveredBy: number;
  /**
   * Nomes resolvidos de quem leu. Array vazio quando não disponível (registros
   * antigos sem readByJids) — nesse caso o fallback é a contagem numérica.
   */
  readByNames: string[];
}

/** Definição de enquete persistida pelo coletor (polls.jsonl). Sem secret. */
interface PollRecord {
  pollMsgId: string;
  question: string;
  options: { name: string; hash: string }[];
  selectableCount: number;
  timestamp: string;
}

/** Voto de enquete persistido (poll-votes.jsonl). Dedup por (pollMsgId, voter). */
interface PollVoteRecord {
  pollMsgId: string;
  voter: string;
  voterName: string;
  selectedHashes: string[];
  timestamp: string;
}

/** Uma opção da enquete já apurada (contagem + nomes de quem votou). */
export interface PollOptionView {
  text: string;
  votes: number;
  /** Nomes resolvidos de quem votou nesta opção (best-effort). */
  voters: string[];
}

/** Enquete apurada, anexada à mensagem `type:'poll'` correspondente. */
export interface PollView {
  question: string;
  options: PollOptionView[];
  totalVotes: number;
  /** true se a enquete aceita marcar mais de uma opção (selectableCount != 1). */
  multiSelect: boolean;
  /** true se a própria conta votou (algum voto de fromMe). */
  youVoted: boolean;
}

/** Chamada apurada (calls.jsonl), virada item de timeline. */
interface CallRecord {
  callId: string;
  from: string;
  fromName: string;
  isVideo: boolean;
  isGroup: boolean;
  status: string;
  outcome: 'missed' | 'accepted' | 'rejected' | 'ongoing';
  timestamp: string;
}

/** Edição persistida (edits.jsonl) — última por targetId vence. */
interface EditRecord {
  targetId: string;
  newText: string;
  timestamp: string;
}

/** Revogação persistida (deletes.jsonl) — qualquer linha marca como apagada. */
interface DeleteRecord {
  targetId: string;
  by: string | null;
  timestamp: string;
}

/** Chamada virada item de timeline (anexada a `MessageView` quando type==='call'). */
export interface CallView {
  /** Desfecho derivado para a UI. */
  outcome: 'missed' | 'accepted' | 'rejected' | 'ongoing';
  isVideo: boolean;
  isGroup: boolean;
  /** Nome de quem ligou (best-effort, resolvido pelo mapa de contatos). */
  fromName: string;
}

/**
 * Mensagem enriquecida com transcrição, reações e (se fromMe) receipt.
 * `type` estende o do registro com `'call'` — um item sintético de sistema
 * (não vem do messages.jsonl, é montado a partir do calls.jsonl na leitura).
 */
export interface MessageView extends Omit<MessageRecord, 'type'> {
  type: MessageRecord['type'] | 'call';
  transcript: string | null;
  reactions: ReactionView[];
  /** Status de entrega/leitura; presente só em mensagens fromMe com receipt. */
  receipt: ReceiptView | null;
  /** Apuração da enquete; presente só em mensagens `type:'poll'`. */
  poll: PollView | null;
  /** Dados da chamada; presente só em itens sintéticos `type:'call'`. */
  call?: CallView | null;
  /** true se a mensagem foi editada pelo autor (texto já é o novo). */
  edited?: boolean;
  /** true se a mensagem foi apagada ("para todos") — conteúdo escondido na UI. */
  deleted?: boolean;
}

export interface GroupSummary {
  slug: string;
  name: string;
  messageCount: number;
  lastTimestamp: string | null;
  /** Caminho relativo (p/ /api/media/...) da foto do grupo, se houver. */
  avatarPath: string | null;
  /** Prévia da última mensagem ("Fulano: texto" / "Você: [áudio]"). */
  lastPreview: string | null;
  /** Mensagens não-lidas (de terceiros) desde a última visita (lastSeen). */
  unread: number;
  /** true se o chat está fixado no topo pelo usuário. */
  pinned?: boolean;
  /** Timestamp unix de quando foi fixado (para ordenar fixados entre si). */
  pinnedAt?: number | null;
  /** true se notificações estão silenciadas. */
  muted?: boolean;
  /** true se o chat está arquivado. */
  archived?: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  audio: "áudio",
  image: "imagem",
  video: "vídeo",
  gif: "GIF",
  document: "documento",
  sticker: "figurinha",
  location: "localização",
  contact: "contato",
  poll: "enquete",
  event: "evento",
};

/** Monta a prévia "Quem: texto" da última mensagem pra sidebar. */
function previewOf(r: MessageRecord): string {
  const who = r.fromMe ? "Você" : r.senderName;
  const body = r.text?.trim() || (r.type !== "text" ? `[${TYPE_LABEL[r.type] ?? r.type}]` : "");
  return body ? `${who}: ${body}` : who;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseJsonl(raw: string): MessageRecord[] {
  const out: MessageRecord[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as MessageRecord);
    } catch {
      // linha corrompida (ex.: escrita parcial concorrente) — ignora
    }
  }
  return out;
}

/** Caminho do sidecar de transcrição para uma mídia. */
export function transcriptPathFor(slug: string, mediaPath: string): string {
  return safeDataPath(slug, 'transcripts', `${basename(mediaPath)}.txt`);
}

async function readTranscript(slug: string, mediaPath: string | null): Promise<string | null> {
  if (!mediaPath) return null;
  try {
    const path = transcriptPathFor(slug, mediaPath);
    if (!(await exists(path))) return null;
    return (await readFile(path, 'utf8')).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Nome de exibição da conversa. Para DMs (slug `dm-<id>`), o `group`/título do parceiro
 * só vem certo nas mensagens RECEBIDAS (as minhas gravam o id cru); então pega o
 * `senderName` da última mensagem recebida ("Maria Clara"). Senão usa o fallback.
 */
export function conversationName(
  slug: string,
  fallback: string,
  msgs: ReadonlyArray<{ fromMe?: boolean; senderName?: string }>,
): string {
  if (!slug.startsWith('dm-')) return fallback;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m.fromMe && m.senderName && m.senderName !== 'Você') return m.senderName;
  }
  return fallback;
}

/** Formato do sidecar `.chats.json` escrito pelo coletor. */
interface ChatStateEntry {
  pinned: boolean;
  pinnedAt: number | null;
  muted: boolean;
  archived: boolean;
  markedAsUnread: boolean;
}

interface ChatStateSidecar {
  version: 1;
  updatedAt: string;
  chats: Record<string, ChatStateEntry>;
}

/**
 * Lê o sidecar `.chats.json` escrito pelo coletor. Tolerante a ausência:
 * retorna um mapa vazio se o arquivo não existir ou for inválido.
 */
async function readChatStates(): Promise<Record<string, ChatStateEntry>> {
  try {
    const raw = await readFile(CHATS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as ChatStateSidecar;
    return parsed?.chats ?? {};
  } catch {
    // Arquivo ausente (coletor antigo) ou corrompido — tolera silenciosamente.
    return {};
  }
}

/** Lista os grupos coletados (uma pasta por grupo em DATA_DIR). */
export async function listGroups(): Promise<GroupSummary[]> {
  if (!(await exists(DATA_DIR))) return [];
  const entries = await readdir(DATA_DIR, { withFileTypes: true });
  const groups: GroupSummary[] = [];
  const [{ lastSeen }, chatStates] = await Promise.all([readTriage(), readChatStates()]);

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const jsonlPath = safeDataPath(slug, 'messages.jsonl');
    if (!(await exists(jsonlPath))) continue;

    const records = parseJsonl(await readFile(jsonlPath, 'utf8'));
    const last = records.at(-1);
    const hasAvatar = await exists(safeDataPath(slug, 'avatar.jpg'));
    const seen = lastSeen[slug];
    const unread = seen
      ? records.filter((r) => !r.fromMe && r.timestamp > seen).length
      : 0;

    const state = chatStates[slug];
    groups.push({
      slug,
      name: conversationName(slug, last?.group ?? slug, records),
      messageCount: records.length,
      lastTimestamp: last?.timestamp ?? null,
      avatarPath: hasAvatar ? `${slug}/avatar.jpg` : null,
      lastPreview: last ? previewOf(last) : null,
      unread,
      pinned: state?.pinned ?? false,
      pinnedAt: state?.pinnedAt ?? null,
      muted: state?.muted ?? false,
      archived: state?.archived ?? false,
    });
  }

  // Ordenação: fixados no topo (por pinnedAt desc, depois por recência), depois
  // ativos por recência, arquivados por último.
  groups.sort((a, b) => {
    const aPin = a.pinned ? 1 : 0;
    const bPin = b.pinned ? 1 : 0;
    const aArc = a.archived ? 1 : 0;
    const bArc = b.archived ? 1 : 0;

    // Arquivados sempre depois dos não-arquivados.
    if (aArc !== bArc) return aArc - bArc;

    // Dentro dos fixados: por pinnedAt descrescente (mais recentemente fixado primeiro).
    if (aPin !== bPin) return bPin - aPin;
    if (aPin && bPin) {
      const pa = a.pinnedAt ?? 0;
      const pb = b.pinnedAt ?? 0;
      if (pa !== pb) return pb - pa;
    }

    // Demais: mais recentes primeiro.
    return (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? '');
  });
  return groups;
}

/** Lê reações do grupo e agrupa por mensagem-alvo (última por reagente vence). */
async function readReactions(slug: string): Promise<Map<string, ReactionView[]>> {
  const path = safeDataPath(slug, 'reactions.jsonl');
  const byTarget = new Map<string, ReactionView[]>();
  if (!(await exists(path))) return byTarget;

  // dedup por (alvo, reagente): a última linha vence (cobre troca/remoção).
  const latest = new Map<string, ReactionRecord>();
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const r = JSON.parse(trimmed) as ReactionRecord;
      latest.set(`${r.targetId}|${r.reactor}`, r);
    } catch {
      // linha corrompida
    }
  }
  for (const r of latest.values()) {
    if (!r.emoji) continue; // reação removida
    const list = byTarget.get(r.targetId) ?? [];
    list.push({ emoji: r.emoji, reactor: r.reactor, by: r.reactorName, fromMe: r.fromMe });
    byTarget.set(r.targetId, list);
  }
  return byTarget;
}

/** Lê receipts do grupo, dedup por targetId (última linha vence — status só avança). */
async function readReceipts(
  slug: string,
  contacts: Awaited<ReturnType<typeof buildContacts>>,
): Promise<Map<string, ReceiptView>> {
  const path = safeDataPath(slug, 'receipts.jsonl');
  const byTarget = new Map<string, ReceiptView>();
  if (!(await exists(path))) return byTarget;

  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const r = JSON.parse(trimmed) as ReceiptRecord;

      // Resolve JIDs (que costumam ser LIDs em grupo) para nomes via o mapa
      // enriquecido pelo sidecar, filtrando a própria conta ("você"). Cobre quem
      // só leu (não postou): o sidecar mapeia o LID -> nome/telefone.
      const jids: string[] = r.readByJids ?? [];
      const readByNames = jids
        .map((id) => {
          const num = numberFromJid(id);
          if (contacts.ownIds.has(num)) return null; // filtra "você"
          const name = contacts.names.get(num);
          if (name && name !== num) return name;
          // Sem nome conhecido: mostra o telefone real se o sidecar souber,
          // senão o id cru (LID) como último recurso.
          const phone = contacts.phones.get(num);
          return phone ? `+${phone}` : num;
        })
        .filter((n): n is string => n !== null);

      byTarget.set(r.targetId, {
        status: r.status,
        readBy: r.readBy ?? 0,
        deliveredBy: r.deliveredBy ?? 0,
        readByNames,
      });
    } catch {
      // linha corrompida
    }
  }
  return byTarget;
}

/**
 * Lê enquetes (polls.jsonl) e votos (poll-votes.jsonl) de um grupo e apura por
 * opção. A apuração é IDEMPOTENTE/re-voto: para cada (enquete, eleitor) só o
 * ÚLTIMO voto conta (append-only no disco, last-wins aqui). Mapeia o hash da
 * opção -> contagem + nomes. Retorna um Map por pollMsgId pronto p/ anexar.
 */
async function readPolls(
  slug: string,
  contacts: Awaited<ReturnType<typeof buildContacts>>,
): Promise<Map<string, PollView>> {
  const out = new Map<string, PollView>();
  const pollsPath = safeDataPath(slug, 'polls.jsonl');
  if (!(await exists(pollsPath))) return out;

  // Definições (última por id vence — re-registro é inofensivo).
  const defs = new Map<string, PollRecord>();
  for (const line of (await readFile(pollsPath, 'utf8')).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const p = JSON.parse(trimmed) as PollRecord;
      if (p.pollMsgId) defs.set(p.pollMsgId, p);
    } catch {
      // linha corrompida
    }
  }
  if (defs.size === 0) return out;

  // Votos: último voto por (enquete, eleitor) vence — cobre re-voto/troca.
  const latestVote = new Map<string, PollVoteRecord>();
  const votesPath = safeDataPath(slug, 'poll-votes.jsonl');
  if (await exists(votesPath)) {
    for (const line of (await readFile(votesPath, 'utf8')).split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const v = JSON.parse(trimmed) as PollVoteRecord;
        if (v.pollMsgId && v.voter) latestVote.set(`${v.pollMsgId}|${v.voter}`, v);
      } catch {
        // linha corrompida
      }
    }
  }

  for (const [pollMsgId, def] of defs) {
    // Acumulador por hash de opção (mantém a ordem original das opções).
    const byHash = new Map<string, { text: string; voters: string[] }>();
    for (const o of def.options) byHash.set(o.hash, { text: o.name, voters: [] });
    let total = 0;
    let youVoted = false;

    for (const v of latestVote.values()) {
      if (v.pollMsgId !== pollMsgId) continue;
      if (v.selectedHashes.length === 0) continue; // voto retirado (re-voto vazio)
      const num = numberFromJid(v.voter);
      const isMine = contacts.ownIds.has(num);
      if (isMine) youVoted = true;
      const name = isMine
        ? 'Você'
        : contacts.names.get(num) && contacts.names.get(num) !== num
          ? (contacts.names.get(num) as string)
          : v.voterName || num;
      let counted = false;
      for (const hash of v.selectedHashes) {
        const slot = byHash.get(hash);
        if (!slot) continue; // hash desconhecido (opção fora da definição)
        slot.voters.push(name);
        counted = true;
      }
      if (counted) total += 1; // total = eleitores, não somatório de marcações
    }

    out.set(pollMsgId, {
      question: def.question,
      options: [...byHash.values()].map((o) => ({
        text: o.text,
        votes: o.voters.length,
        voters: o.voters,
      })),
      totalVotes: total,
      multiSelect: def.selectableCount !== 1,
      youVoted,
    });
  }
  return out;
}

/**
 * Lê edições (edits.jsonl) — última por targetId vence (uma msg pode ser
 * editada várias vezes). Aplicado na LEITURA: o messages.jsonl é append-only,
 * então a edição vive no sidecar e troca o texto + marca "editada" aqui.
 */
async function readEdits(slug: string): Promise<Map<string, EditRecord>> {
  const path = safeDataPath(slug, 'edits.jsonl');
  const byTarget = new Map<string, EditRecord>();
  if (!(await exists(path))) return byTarget;
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const e = JSON.parse(trimmed) as EditRecord;
      if (e.targetId) byTarget.set(e.targetId, e); // última linha vence
    } catch {
      // linha corrompida
    }
  }
  return byTarget;
}

/** Lê revogações (deletes.jsonl) — presença do targetId basta p/ marcar apagada. */
async function readDeletes(slug: string): Promise<Set<string>> {
  const path = safeDataPath(slug, 'deletes.jsonl');
  const ids = new Set<string>();
  if (!(await exists(path))) return ids;
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const d = JSON.parse(trimmed) as DeleteRecord;
      if (d.targetId) ids.add(d.targetId);
    } catch {
      // linha corrompida
    }
  }
  return ids;
}

/**
 * Lê chamadas (calls.jsonl) e dedup por callId — o status evolui ao longo da
 * chamada (append-only), então a ÚLTIMA linha de cada callId vence. Vira um
 * item sintético de timeline (`type:'call'`) ordenável junto das mensagens.
 */
async function readCalls(
  slug: string,
  contacts: Awaited<ReturnType<typeof buildContacts>>,
): Promise<MessageView[]> {
  const path = safeDataPath(slug, 'calls.jsonl');
  if (!(await exists(path))) return [];
  const byId = new Map<string, CallRecord>();
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const c = JSON.parse(trimmed) as CallRecord;
      if (c.callId) byId.set(c.callId, c); // última linha vence (status evolui)
    } catch {
      // linha corrompida
    }
  }

  const out: MessageView[] = [];
  for (const c of byId.values()) {
    const num = numberFromJid(c.from);
    const name =
      (contacts.names.get(num) && contacts.names.get(num) !== num
        ? (contacts.names.get(num) as string)
        : null) ?? c.fromName;
    out.push({
      id: `call:${c.callId}`,
      timestamp: c.timestamp,
      group: '',
      groupJid: '',
      sender: c.from,
      senderName: name,
      fromMe: false,
      type: 'call',
      text: '',
      quotedText: null,
      quotedSender: null,
      mediaPath: null,
      transcript: null,
      reactions: [],
      receipt: null,
      poll: null,
      call: { outcome: c.outcome, isVideo: c.isVideo, isGroup: c.isGroup, fromName: name },
    });
  }
  return out;
}

/** Lê as mensagens de um grupo já com transcrição, reações, receipts e enquetes. */
export async function readGroupMessages(slug: string): Promise<MessageView[]> {
  const jsonlPath = safeDataPath(slug, 'messages.jsonl');
  if (!(await exists(jsonlPath))) return [];
  const records = parseJsonl(await readFile(jsonlPath, 'utf8'));
  const [reactions, contacts] = await Promise.all([
    readReactions(slug),
    buildContacts(),
  ]);
  const [receipts, polls, edits, deletes, calls] = await Promise.all([
    readReceipts(slug, contacts),
    readPolls(slug, contacts),
    readEdits(slug),
    readDeletes(slug),
    readCalls(slug, contacts),
  ]);
  const views = await Promise.all(
    records.map(async (r) => {
      const deleted = deletes.has(r.id);
      const edit = edits.get(r.id);
      // Apagada: esconde conteúdo/mídia/transcrição, preserva autor+timestamp.
      // Editada: troca o texto pelo novo e marca o selo (não toca mídia).
      const text = deleted ? '' : (edit ? edit.newText : r.text);
      return {
        ...r,
        text,
        mediaPath: deleted ? null : r.mediaPath,
        transcript: deleted ? null : await readTranscript(slug, r.mediaPath),
        reactions: reactions.get(r.id) ?? [],
        receipt: r.fromMe ? (receipts.get(r.id) ?? null) : null,
        poll: r.type === 'poll' ? (polls.get(r.id) ?? null) : null,
        edited: Boolean(edit) && !deleted,
        deleted,
      } satisfies MessageView;
    }),
  );

  // Interleava as chamadas (itens de sistema) por timestamp com as mensagens.
  if (calls.length === 0) return views;
  return [...views, ...calls].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
