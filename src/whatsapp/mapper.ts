import { createHash } from 'node:crypto';
import type { proto, WACallEvent, WAMessage, WAMessageKey, WASocket } from 'baileys';
import { getContentType, normalizeMessageContent } from 'baileys';
import type {
  CallOutcome,
  InboundCall,
  InboundMessage,
  InboundPoll,
  InboundPresence,
  InboundReaction,
  MediaDescriptor,
  MessageType,
  PresenceState,
  ReceiptStatus,
} from '../core/message.js';
import { slugify } from '../storage/paths.js';
import { buildMediaDescriptor } from './media.js';

/** True se o JID é uma conversa 1:1 (contato), não um grupo. */
export function isDirectJid(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
}

/**
 * Slug estável de um DM, derivado do JID do contato (não do pushName, que pode
 * colidir/mudar). Prefixo `dm-` evita colisão com slug de grupo de mesmo nome.
 */
export function directSlug(contactJid: string): string {
  const handle = contactJid.split('@')[0] ?? contactJid;
  return `dm-${slugify(handle)}`;
}

/**
 * Identidade da conversa (slug da pasta + nome legível) a partir do remoteJid.
 * Em grupo: usa o nome conhecido (subject). Em DM: slug pelo JID, nome = pushName.
 */
export function resolveConversation(
  remoteJid: string,
  knownGroupName: string,
  pushName: string | null | undefined,
): { isDirect: boolean; conversationSlug: string; groupName: string } {
  if (isDirectJid(remoteJid)) {
    const handle = remoteJid.split('@')[0] ?? remoteJid;
    return {
      isDirect: true,
      conversationSlug: directSlug(remoteJid),
      groupName: pushName?.trim() || handle,
    };
  }
  return { isDirect: false, conversationSlug: slugify(knownGroupName), groupName: knownGroupName };
}

/**
 * Converte uma mensagem do Baileys em InboundMessage de domínio.
 * Retorna null para tipos que não interessam (reações, polls, protocolo...).
 */
export function mapMessage(
  wa: WAMessage,
  sock: WASocket,
  groupName: string,
): InboundMessage | null {
  const { key } = wa;
  if (!key.remoteJid || !key.id) return null;

  let content = normalizeMessageContent(wa.message);
  if (!content) return null;

  // Documento com legenda vem embrulhado num wrapper.
  if (getContentType(content) === 'documentWithCaptionMessage') {
    content = content.documentWithCaptionMessage?.message ?? content;
  }

  const ctype = getContentType(content);
  if (!ctype) return null;

  let type: MessageType = 'text';
  let text = '';
  let media: MediaDescriptor | null = null;

  switch (ctype) {
    case 'conversation':
      text = content.conversation ?? '';
      break;
    case 'extendedTextMessage':
      text = content.extendedTextMessage?.text ?? '';
      break;
    case 'imageMessage':
      type = 'image';
      text = content.imageMessage?.caption ?? '';
      media = buildMediaDescriptor('image', content.imageMessage?.mimetype, null, wa, sock);
      break;
    case 'videoMessage': {
      // GIF do WhatsApp = vídeo mp4 com gifPlayback (sem áudio) → tipo próprio.
      const isGif = content.videoMessage?.gifPlayback === true;
      type = isGif ? 'gif' : 'video';
      text = content.videoMessage?.caption ?? '';
      media = buildMediaDescriptor(type, content.videoMessage?.mimetype, null, wa, sock);
      break;
    }
    case 'audioMessage':
      type = 'audio';
      media = buildMediaDescriptor('audio', content.audioMessage?.mimetype, null, wa, sock);
      break;
    case 'documentMessage':
      type = 'document';
      text = content.documentMessage?.caption ?? '';
      media = buildMediaDescriptor(
        'document',
        content.documentMessage?.mimetype,
        content.documentMessage?.fileName,
        wa,
        sock,
      );
      break;
    case 'stickerMessage':
      type = 'sticker';
      media = buildMediaDescriptor('sticker', content.stickerMessage?.mimetype, null, wa, sock);
      break;
    case 'locationMessage':
      type = 'location';
      text = describeLocation(content.locationMessage);
      break;
    case 'liveLocationMessage':
      type = 'location';
      text = describeLiveLocation(content.liveLocationMessage);
      break;
    case 'contactMessage':
      type = 'contact';
      text = describeContact(content.contactMessage);
      break;
    case 'contactsArrayMessage':
      type = 'contact';
      text = describeContactsArray(content.contactsArrayMessage);
      break;
    case 'pollCreationMessage':
    case 'pollCreationMessageV2':
    case 'pollCreationMessageV3':
      type = 'poll';
      text = describePoll(content[ctype]);
      break;
    case 'eventMessage':
      type = 'event';
      text = describeEvent(content.eventMessage);
      break;
    default:
      return null;
  }

  const fromMe = key.fromMe ?? false;
  const quoted = extractQuoted(content, ctype);
  // pushName só nomeia a conversa de DM quando é do OUTRO lado (em fromMe é o meu nome).
  const conv = resolveConversation(key.remoteJid, groupName, fromMe ? null : wa.pushName);
  // Em DM, `key.participant` costuma ser nulo: o "outro lado" é o `remoteJid`.
  // Para MINHAS mensagens (fromMe) em DM, o remetente é a PRÓPRIA conta — usar
  // `remoteJid` (= o parceiro) poluiria a noção de "quem sou eu". Bug #23.
  const meId = sock.user?.id;
  const sender = fromMe
    ? (meId ?? key.participant ?? key.remoteJid)
    : (key.participant ?? key.remoteJid);
  return {
    id: key.id,
    groupJid: key.remoteJid,
    groupName: conv.groupName,
    isDirect: conv.isDirect,
    conversationSlug: conv.conversationSlug,
    sender,
    senderName: fromMe ? 'Você' : (wa.pushName ?? key.participant?.split('@')[0] ?? 'desconhecido'),
    fromMe,
    timestamp: toDate(wa.messageTimestamp),
    type,
    text,
    quotedText: quoted.text,
    quotedSender: quoted.sender,
    media,
  };
}

/** Converte uma reação do Baileys (messages.reaction) em InboundReaction. */
export function mapReaction(
  item: { key: WAMessageKey; reaction: proto.IReaction },
  groupName: string,
): InboundReaction | null {
  const targetId = item.key?.id;
  const groupJid = item.key?.remoteJid;
  if (!targetId || !groupJid) return null;

  const conv = resolveConversation(groupJid, groupName, null);

  const reactorKey = item.reaction?.key;
  const reactor = reactorKey?.participant ?? reactorKey?.remoteJid ?? '';
  const fromMe = reactorKey?.fromMe ?? false;
  const ts = item.reaction?.senderTimestampMs;
  const millis =
    typeof ts === 'number'
      ? ts
      : ts && typeof (ts as { toNumber?: () => number }).toNumber === 'function'
        ? (ts as { toNumber: () => number }).toNumber()
        : Date.now();

  return {
    groupJid,
    groupName: conv.groupName,
    isDirect: conv.isDirect,
    conversationSlug: conv.conversationSlug,
    targetId,
    emoji: item.reaction?.text ?? '',
    reactor,
    reactorName: fromMe ? 'Você' : (reactor.split('@')[0] ?? ''),
    fromMe,
    timestamp: new Date(millis),
  };
}

/** Estados de presença válidos do Baileys (WAPresence). */
const PRESENCE_STATES = new Set<PresenceState>([
  'available',
  'unavailable',
  'composing',
  'recording',
  'paused',
]);

/**
 * Reduz o mapa `presences` de um `presence.update` (presença POR participante)
 * a UM estado representativo da conversa. Prioriza atividade visível (digitando/
 * gravando > online > offline) — em grupo, "alguém digitando" é o sinal útil.
 * Retorna null se o evento não trouxer presença interpretável.
 */
export function mapPresence(
  chatJid: string,
  knownGroupName: string,
  presences: Record<string, { lastKnownPresence?: string; lastSeen?: number | null }>,
): InboundPresence | null {
  const conv = resolveConversation(chatJid, knownGroupName, null);
  // Rank de "interesse": atividade ativa vence online, que vence offline.
  const RANK: Record<PresenceState, number> = {
    composing: 4,
    recording: 4,
    available: 2,
    paused: 1,
    unavailable: 0,
  };
  let best: { participant: string; state: PresenceState; lastSeen: number | null } | null = null;
  for (const [participant, data] of Object.entries(presences ?? {})) {
    const raw = data?.lastKnownPresence;
    if (!raw || !PRESENCE_STATES.has(raw as PresenceState)) continue;
    const state = raw as PresenceState;
    const lastSeen = typeof data?.lastSeen === 'number' ? data.lastSeen : null;
    if (!best || RANK[state] > RANK[best.state]) {
      best = { participant, state, lastSeen };
    }
  }
  if (!best) return null;
  return {
    chatJid,
    isDirect: conv.isDirect,
    conversationSlug: conv.conversationSlug,
    participant: best.participant,
    state: best.state,
    lastSeen: best.lastSeen,
    timestamp: new Date(),
  };
}

/**
 * Deriva o desfecho (`CallOutcome`) a partir do status cru do Baileys. A
 * chamada evolui (offer/ringing → accept/reject/timeout/terminate); reduzimos
 * a perdida/atendida/recusada/em andamento. `timeout` e um `terminate` que
 * nunca foi aceito = perdida (sinal de triagem mais valioso).
 */
function callOutcome(status: string): CallOutcome {
  switch (status) {
    case 'accept':
      return 'accepted';
    case 'reject':
      return 'rejected';
    case 'timeout':
    case 'terminate':
      // terminate sem accept anterior = perdida; o leitor reconcilia (último vence),
      // então um accept que chegue antes mantém 'accepted'.
      return 'missed';
    default:
      return 'ongoing';
  }
}

/**
 * Converte um evento de chamada do Baileys (`WACallEvent`) em InboundCall de
 * domínio. Filtra só por presença de id/from; o gateway decide o que persistir.
 * O nome de quem ligou é best-effort (user-part do JID) — o painel resolve melhor.
 */
export function mapCall(c: WACallEvent): InboundCall | null {
  if (!c.id || !c.from) return null;
  // A chamada "pertence" à conversa: em grupo, ao jid do grupo; em DM, a quem ligou.
  const chatJid = c.isGroup && c.groupJid ? c.groupJid : c.from;
  const conv = resolveConversation(chatJid, chatJid, null);
  const fromName = (c.from.split('@')[0] ?? '').split(':')[0] || 'desconhecido';
  return {
    callId: c.id,
    chatJid,
    isDirect: conv.isDirect,
    conversationSlug: conv.conversationSlug,
    from: c.from,
    fromName,
    isVideo: c.isVideo ?? false,
    isGroup: c.isGroup ?? false,
    status: c.status,
    outcome: callOutcome(c.status),
    timestamp: c.date instanceof Date ? c.date : new Date(),
  };
}

/**
 * Extrai o texto novo de uma edição de mensagem. O Baileys entrega a edição via
 * `messages.update` com `update.message = { editedMessage: { message: <novo> } }`.
 * `normalizeMessageContent` desembrulha `editedMessage` automaticamente, então
 * pegamos o texto do conteúdo já normalizado (conversation/extendedText/legenda).
 * Retorna null se não houver texto interpretável.
 */
export function editedTextFrom(message: proto.IMessage | null | undefined): string | null {
  if (!message) return null;
  const content = normalizeMessageContent(message);
  if (!content) return null;
  const ctype = getContentType(content);
  if (!ctype) return null;
  switch (ctype) {
    case 'conversation':
      return content.conversation ?? '';
    case 'extendedTextMessage':
      return content.extendedTextMessage?.text ?? '';
    case 'imageMessage':
      return content.imageMessage?.caption ?? '';
    case 'videoMessage':
      return content.videoMessage?.caption ?? '';
    case 'documentMessage':
      return content.documentMessage?.caption ?? '';
    default:
      return null;
  }
}

/**
 * Traduz o `status` numérico do Baileys (enum WebMessageInfo.Status) no nosso
 * ReceiptStatus. PLAYED (áudio ouvido) é tratado como 'read'. Retorna null para
 * estados que não interessam (ERROR/PENDING) ou desconhecidos.
 */
export function mapStatusCode(status: number | null | undefined): ReceiptStatus | null {
  switch (status) {
    case 2: // SERVER_ACK
      return 'sent';
    case 3: // DELIVERY_ACK
      return 'delivered';
    case 4: // READ
    case 5: // PLAYED
      return 'read';
    default:
      return null;
  }
}

/** Normaliza um timestamp protobuf (number | Long) em milissegundos, ou 0. */
export function toMillis(ts: number | { toNumber?: () => number } | null | undefined): number {
  if (typeof ts === 'number') return ts;
  if (ts && typeof ts.toNumber === 'function') return ts.toNumber();
  return 0;
}

function toDate(ts: WAMessage['messageTimestamp']): Date {
  let seconds = 0;
  if (typeof ts === 'number') {
    seconds = ts;
  } else if (ts && typeof (ts as { toNumber?: () => number }).toNumber === 'function') {
    seconds = (ts as { toNumber: () => number }).toNumber();
  }
  return new Date(seconds * 1000);
}

/** "📍 -23.5,-46.6 · Nome · Endereço" — campos ausentes são omitidos. */
function describeLocation(loc: proto.Message.ILocationMessage | null | undefined): string {
  if (!loc) return '📍 localização';
  const lat = typeof loc.degreesLatitude === 'number' ? loc.degreesLatitude : null;
  const lng = typeof loc.degreesLongitude === 'number' ? loc.degreesLongitude : null;
  const coords = lat !== null && lng !== null ? `${lat},${lng}` : null;
  const parts = [coords, loc.name?.trim() || null, loc.address?.trim() || null].filter(Boolean);
  return `📍 ${parts.length ? parts.join(' · ') : 'localização'}`;
}

function describeLiveLocation(loc: proto.Message.ILiveLocationMessage | null | undefined): string {
  if (!loc) return '📍 localização ao vivo';
  const lat = typeof loc.degreesLatitude === 'number' ? loc.degreesLatitude : null;
  const lng = typeof loc.degreesLongitude === 'number' ? loc.degreesLongitude : null;
  const coords = lat !== null && lng !== null ? ` ${lat},${lng}` : '';
  const caption = loc.caption?.trim() ? ` · ${loc.caption.trim()}` : '';
  return `📍 localização ao vivo${coords}${caption}`;
}

/** "👤 Nome · +5511999998888" — extrai o telefone do vCard quando possível. */
function describeContact(c: proto.Message.IContactMessage | null | undefined): string {
  if (!c) return '👤 contato';
  const name = c.displayName?.trim() || null;
  const phone = extractPhoneFromVcard(c.vcard);
  const parts = [name, phone].filter(Boolean);
  return `👤 ${parts.length ? parts.join(' · ') : 'contato'}`;
}

function describeContactsArray(c: proto.Message.IContactsArrayMessage | null | undefined): string {
  const list = c?.contacts ?? [];
  if (!list.length) return c?.displayName?.trim() ? `👤 ${c.displayName.trim()}` : '👤 contatos';
  const lines = list.map((item) => describeContact(item).replace(/^👤 /, ''));
  return `👤 ${lines.join('; ')}`;
}

/** Telefone do vCard (linha TEL) — best-effort, retorna null se não achar. */
function extractPhoneFromVcard(vcard: string | null | undefined): string | null {
  if (!vcard) return null;
  const match = vcard.match(/TEL[^:]*:([+0-9()\s-]{4,})/i);
  return match?.[1] ? match[1].trim() : null;
}

/** "📊 Pergunta? — opção A / opção B / opção C" */
function describePoll(p: proto.Message.IPollCreationMessage | null | undefined): string {
  if (!p) return '📊 enquete';
  const name = p.name?.trim() || 'enquete';
  const options = (p.options ?? [])
    .map((o) => o.optionName?.trim())
    .filter((o): o is string => Boolean(o));
  return options.length ? `📊 ${name} — ${options.join(' / ')}` : `📊 ${name}`;
}

/** Hash sha256(optionName) que o WhatsApp usa pra casar voto↔opção. */
function pollOptionHash(optionName: string): string {
  return createHash('sha256').update(optionName).digest().toString();
}

/** Opções (nome + hash) de uma enquete, na ordem original. */
function pollOptions(p: proto.Message.IPollCreationMessage): { name: string; hash: string }[] {
  return (p.options ?? [])
    .map((o) => o.optionName?.trim())
    .filter((n): n is string => Boolean(n))
    .map((name) => ({ name, hash: pollOptionHash(name) }));
}

/**
 * Extrai a enquete estruturada de uma criação (`pollCreationMessage*`) +
 * o `messageSecret` (server-side, base64) necessário pra decifrar os votos.
 * Retorna null se não for enquete ou faltar o essencial. O secret vem do
 * `messageContextInfo` da mensagem ORIGINAL (não do conteúdo normalizado).
 */
export function mapPoll(
  wa: WAMessage,
  groupName: string,
): { poll: InboundPoll; secretB64: string; creatorJid: string } | null {
  const { key } = wa;
  if (!key.remoteJid || !key.id) return null;
  const content = normalizeMessageContent(wa.message);
  const ctype = content ? getContentType(content) : undefined;
  if (
    !content ||
    (ctype !== 'pollCreationMessage' &&
      ctype !== 'pollCreationMessageV2' &&
      ctype !== 'pollCreationMessageV3')
  ) {
    return null;
  }
  const p = content[ctype];
  if (!p) return null;
  const secret = wa.message?.messageContextInfo?.messageSecret ?? p.encKey ?? null;
  if (!secret) return null;
  const options = pollOptions(p);
  if (!options.length) return null;
  const conv = resolveConversation(key.remoteJid, groupName, null);
  // Autor da enquete: em grupo é o participant; em DM/própria, o remoteJid/me.
  const creatorJid = key.fromMe
    ? (key.participant ?? key.remoteJid)
    : (key.participant ?? key.remoteJid);
  return {
    poll: {
      pollMsgId: key.id,
      groupJid: key.remoteJid,
      isDirect: conv.isDirect,
      conversationSlug: conv.conversationSlug,
      question: p.name?.trim() || 'enquete',
      options,
      selectableCount: typeof p.selectableOptionsCount === 'number' ? p.selectableOptionsCount : 0,
      timestamp: toDate(wa.messageTimestamp),
    },
    secretB64: Buffer.from(secret).toString('base64'),
    creatorJid,
  };
}

/** "📅 Nome · 22/06 14:00 · local" — campos ausentes são omitidos. */
function describeEvent(e: proto.Message.IEventMessage | null | undefined): string {
  if (!e) return '📅 evento';
  const name = e.name?.trim() || 'evento';
  const start = toMillis(e.startTime as number | { toNumber?: () => number } | null | undefined);
  const when = start > 0 ? new Date(start * 1000).toISOString() : null;
  const where =
    e.location?.name?.trim() || e.location?.address?.trim() || (e.joinLink?.trim() ?? null);
  const parts = [name, when, where].filter(Boolean);
  return `📅 ${parts.join(' · ')}`;
}

function extractQuoted(
  content: proto.IMessage,
  ctype: keyof proto.IMessage,
): { text: string | null; sender: string | null } {
  const node = (content as Record<string, unknown>)[ctype] as
    | { contextInfo?: { quotedMessage?: proto.IMessage; participant?: string | null } }
    | undefined;
  const ctx = node?.contextInfo;
  const quoted = ctx?.quotedMessage;
  if (!quoted) return { text: null, sender: null };
  const text =
    quoted.conversation ??
    quoted.extendedTextMessage?.text ??
    quoted.imageMessage?.caption ??
    quoted.videoMessage?.caption ??
    '[mídia citada]';
  return { text, sender: ctx?.participant ?? null };
}
