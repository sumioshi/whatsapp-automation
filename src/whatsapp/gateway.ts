import { EventEmitter } from 'node:events';
import { extname } from 'node:path';
import type {
  AnyMessageContent,
  BaileysEventMap,
  WACallEvent,
  WAMessage,
  WAMessageKey,
  WASocket,
} from 'baileys';
import makeWASocket, {
  DisconnectReason,
  decryptPollVote,
  fetchLatestBaileysVersion,
  getContentType,
  getKeyAuthor,
  jidNormalizedUser,
  normalizeMessageContent,
  type proto,
  useMultiFileAuthState,
  WAMessageStubType,
} from 'baileys';
import qrcode from 'qrcode-terminal';
import type {
  GatewayStatus,
  GroupInfo,
  InboundCall,
  InboundDelete,
  InboundEdit,
  InboundMessage,
  InboundPoll,
  InboundPollVote,
  InboundPresence,
  InboundReaction,
  InboundReceipt,
  OutboundMedia,
  ReceiptStatus,
} from '../core/message.js';
import type { WhatsAppGateway } from '../core/ports.js';
import { baileysLogger, logger } from '../logger.js';
import { ChatStateStore } from '../storage/chatStateStore.js';
import { ContactStore } from '../storage/contactStore.js';
import { PollStore } from '../storage/pollStore.js';
import {
  editedTextFrom,
  isDirectJid,
  mapCall,
  mapMessage,
  mapPoll,
  mapPresence,
  mapReaction,
  mapStatusCode,
  resolveConversation,
  toMillis,
} from './mapper.js';

type ConnectionUpdate = BaileysEventMap['connection.update'];
type MessagesUpsert = BaileysEventMap['messages.upsert'];
type MessagesReaction = BaileysEventMap['messages.reaction'];
type MessagesUpdate = BaileysEventMap['messages.update'];
type MessageReceiptUpdate = BaileysEventMap['message-receipt.update'];
type HistorySet = BaileysEventMap['messaging-history.set'];
type PresenceUpdate = BaileysEventMap['presence.update'];
type ChatsUpsert = BaileysEventMap['chats.upsert'];
type ChatsUpdate = BaileysEventMap['chats.update'];

/** Estado agregado de entrega/leitura de uma mensagem própria em grupo. */
interface ReceiptState {
  groupJid: string;
  status: ReceiptStatus;
  /** userJids que já entregaram (delivered). */
  delivered: Set<string>;
  /** userJids que já leram. */
  read: Set<string>;
}

/** Ordem dos status para "o mais avançado vence". */
const STATUS_RANK: Record<ReceiptStatus, number> = { sent: 0, delivered: 1, read: 2 };

/** Teto de receipts em memória (serviço 24/7) — evita crescimento ilimitado. */
const MAX_RECEIPTS = 1000;
/**
 * Teto de ids de mensagem lembrados para dedup (history sync vs upsert). O
 * history pode despejar meses de conversa; sem dedup, reprocessar duplicaria.
 */
const MAX_SEEN_IDS = 50_000;
/** Reconexão: backoff exponencial com teto. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/** Mimetypes inferidos pela extensão quando o cliente não informa. */
const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
};

function inferDocumentMimetype(path: string): string {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** Traduz uma OutboundMedia de domínio no content que o Baileys espera. */
function toMessageContent(media: OutboundMedia): AnyMessageContent {
  switch (media.kind) {
    case 'image':
      return { image: { url: media.path }, caption: media.caption };
    case 'document':
      return {
        document: { url: media.path },
        fileName: media.fileName,
        mimetype: media.mimetype ?? inferDocumentMimetype(media.path),
        caption: media.caption,
      };
    case 'audio':
      return { audio: { url: media.path }, ptt: true, mimetype: 'audio/ogg; codecs=opus' };
    case 'video':
      return { video: { url: media.path }, caption: media.caption };
    case 'gif':
      return { video: { url: media.path }, gifPlayback: true, caption: media.caption };
  }
}

/**
 * Adapter do Baileys. É o ÚNICO arquivo que conhece a lib — conexão, QR,
 * reconexão, descoberta de grupos e tradução de eventos para o domínio.
 */
export class BaileysGateway implements WhatsAppGateway {
  private sock: WASocket | null = null;
  private readonly emitter = new EventEmitter();
  /** jid do grupo -> nome (subject). */
  private readonly groups = new Map<string, string>();
  /** targetId da minha mensagem -> estado agregado de entrega/leitura (LRU limitado). */
  private readonly receipts = new Map<string, ReceiptState>();
  /**
   * Ids de mensagem já emitidos (dedup entre `messages.upsert` e history sync).
   * O collector grava append-only sem dedup na escrita, então a barreira fica
   * aqui: id já visto = não re-emite. Map (não Set) para evict FIFO por teto.
   */
  private readonly seenIds = new Map<string, true>();
  private stopping = false;
  /** Tentativas de reconexão seguidas (reset ao abrir) — alimenta o backoff. */
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Mapa LID↔telefone↔nome persistido em `<DATA_DIR>/.contacts.json`. */
  private readonly contacts: ContactStore;
  /**
   * Registro server-side de enquetes (secret + opções) em `<DATA_DIR>/.polls.json`.
   * Guarda o `messageSecret` necessário pra decifrar votos; nunca exposto ao painel.
   */
  private readonly polls: PollStore;
  /**
   * Estado de chats (pinned/muted/archived/markedAsUnread) em `<DATA_DIR>/.chats.json`.
   * Reflete o que o operador marca no celular — SÓ LEITURA, nunca chamamos chatModify.
   */
  private readonly chatStates: ChatStateStore;
  /**
   * JIDs já inscritos em `presenceSubscribe` (só inscrevemos UMA vez por jid por
   * conexão — re-inscrever floda o servidor). Limpo a cada (re)conexão.
   */
  private readonly presenceSubscribed = new Set<string>();
  /**
   * Resolve quando o 1º `refreshGroups()` (carregamento dos nomes de grupo)
   * completa. As mensagens só são processadas depois disso: na janela inicial do
   * boot o `groups` ainda está vazio e, como o slug da pasta deriva do NOME do
   * grupo, uma mensagem sem nome resolvido grava com o JID cru e FRAGMENTA o
   * histórico do grupo numa pasta separada (slug `<jid>-g-us`). Depois do 1º
   * carregamento o await é instantâneo.
   */
  private groupsReady: Promise<void>;
  private markGroupsReady: () => void = () => {};

  constructor(
    private readonly authDir: string,
    dataDir: string,
    private readonly pairNumber?: string,
  ) {
    this.contacts = new ContactStore(dataDir);
    this.polls = new PollStore(dataDir);
    this.chatStates = new ChatStateStore(dataDir);
    this.groupsReady = new Promise<void>((resolve) => {
      this.markGroupsReady = resolve;
    });
  }

  onMessage(handler: (message: InboundMessage) => void): void {
    this.emitter.on('message', handler);
  }

  onGroups(handler: (groups: GroupInfo[]) => void): void {
    this.emitter.on('groups', handler);
  }

  onStatus(handler: (status: GatewayStatus) => void): void {
    this.emitter.on('status', handler);
  }

  onReaction(handler: (reaction: InboundReaction) => void): void {
    this.emitter.on('reaction', handler);
  }

  onReceipt(handler: (receipt: InboundReceipt) => void): void {
    this.emitter.on('receipt', handler);
  }

  onPresence(handler: (presence: InboundPresence) => void): void {
    this.emitter.on('presence', handler);
  }

  onPoll(handler: (poll: InboundPoll) => void): void {
    this.emitter.on('poll', handler);
  }

  onPollVote(handler: (vote: InboundPollVote) => void): void {
    this.emitter.on('pollVote', handler);
  }

  onCall(handler: (call: InboundCall) => void): void {
    this.emitter.on('call', handler);
  }

  onEdit(handler: (edit: InboundEdit) => void): void {
    this.emitter.on('edit', handler);
  }

  onDelete(handler: (del: InboundDelete) => void): void {
    this.emitter.on('delete', handler);
  }

  async getAvatarUrl(jid: string): Promise<string | null> {
    if (!this.sock) return null;
    try {
      return (await this.sock.profilePictureUrl(jid, 'image')) ?? null;
    } catch {
      // Grupo sem foto ou sem permissão → ignora silenciosamente.
      return null;
    }
  }

  async start(): Promise<void> {
    // Recupera o mapa de contatos já conhecido (sidecar de execuções anteriores).
    await this.contacts.load();
    // Recupera enquetes conhecidas (secret) — votos antigos ainda decifram.
    await this.polls.load();
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.contacts.flush(); // garante o último estado do mapa em disco
    await this.polls.flush(); // garante o registro de enquetes em disco
    await this.chatStates.flush(); // garante o estado de chats em disco
    this.sock?.end(undefined);
  }

  async sendText(jid: string, text: string, mentions?: string[]): Promise<void> {
    if (!this.sock) throw new Error('Coletor não está conectado ao WhatsApp.');
    const content = mentions?.length ? { text, mentions } : { text };
    const sent = await this.sock.sendMessage(jid, content);
    this.echoSent(jid, sent);
  }

  async sendMedia(jid: string, media: OutboundMedia): Promise<void> {
    if (!this.sock) throw new Error('Coletor não está conectado ao WhatsApp.');
    const sent = await this.sock.sendMessage(jid, toMessageContent(media));
    this.echoSent(jid, sent);
  }

  async sendReaction(
    jid: string,
    key: { id: string; participant?: string; fromMe?: boolean },
    emoji: string,
  ): Promise<void> {
    if (!this.sock) throw new Error('Coletor não está conectado ao WhatsApp.');
    const targetKey: WAMessageKey = {
      remoteJid: jid,
      id: key.id,
      participant: key.participant,
      fromMe: key.fromMe ?? false,
    };
    await this.sock.sendMessage(jid, { react: { text: emoji, key: targetKey } });
    this.echoReaction(jid, targetKey, emoji);
  }

  /**
   * O `messages.reaction` não reflete a reação que EU mesmo envio, então a
   * emitimos pelo fluxo normal (igual o echoSent) para cair no reactions.jsonl.
   */
  private echoReaction(jid: string, targetKey: WAMessageKey, emoji: string): void {
    const groupName = this.groups.get(jid) ?? jid;
    const mapped = mapReaction(
      {
        key: targetKey,
        reaction: {
          text: emoji,
          key: { remoteJid: jid, fromMe: true },
          senderTimestampMs: Date.now(),
        },
      },
      groupName,
    );
    if (mapped) this.emitter.emit('reaction', mapped);
  }

  /**
   * O Baileys ecoa a mensagem enviada como type 'append' (que ignoramos no
   * upsert). Então mapeamos e emitimos nós mesmos, pelo fluxo normal, para o
   * balão "Você" aparecer no painel.
   */
  private echoSent(jid: string, sent: WAMessage | undefined): void {
    if (!sent || !this.sock) return;
    const groupName = this.groups.get(jid) ?? jid;
    const mapped = mapMessage(sent, this.sock, groupName);
    if (mapped) this.emitMessageDeduped(mapped);
  }

  /**
   * Emite uma mensagem normalizada uma única vez por `id`. Barreira de dedup
   * compartilhada por upsert/history/echo — o collector grava append-only sem
   * dedup na escrita, então não re-emitir é o que evita linhas duplicadas.
   */
  private emitMessageDeduped(msg: InboundMessage): void {
    if (this.seenIds.has(msg.id)) return;
    this.seenIds.set(msg.id, true);
    if (this.seenIds.size > MAX_SEEN_IDS) {
      const oldest = this.seenIds.keys().next().value;
      if (oldest !== undefined) this.seenIds.delete(oldest);
    }
    this.emitter.emit('message', msg);
  }

  private async connect(): Promise<void> {
    // Desliga o socket anterior (evita listeners/conexões órfãos a cada reconexão).
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        this.sock.ev.removeAllListeners('messages.reaction');
        this.sock.ev.removeAllListeners('messages.update');
        this.sock.ev.removeAllListeners('message-receipt.update');
        this.sock.ev.removeAllListeners('contacts.upsert');
        this.sock.ev.removeAllListeners('contacts.update');
        this.sock.ev.removeAllListeners('lid-mapping.update');
        this.sock.ev.removeAllListeners('messaging-history.set');
        // Listeners de fundação adicionados em connect() — par obrigatório no
        // teardown, senão vaza um listener a cada reconexão.
        this.sock.ev.removeAllListeners('call');
        this.sock.ev.removeAllListeners('groups.update');
        this.sock.ev.removeAllListeners('group-participants.update');
        this.sock.ev.removeAllListeners('chats.upsert');
        this.sock.ev.removeAllListeners('chats.update');
        this.sock.ev.removeAllListeners('chats.delete');
        this.sock.ev.removeAllListeners('presence.update');
        this.sock.ev.removeAllListeners('blocklist.set');
        this.sock.ev.removeAllListeners('blocklist.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.end(undefined);
      } catch {
        // socket já morto — segue
      }
    }
    // Nova conexão = novas subscriptions de presença (o servidor não lembra as antigas).
    this.presenceSubscribed.clear();
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      version,
      auth: state,
      logger: baileysLogger,
      markOnlineOnConnect: false,
    });
    this.sock = sock;

    // Pareamento headless por código (servidor sem tela, ex.: nuvem): se PAIR_NUMBER
    // estiver setado e a sessão ainda não registrada, pede o código de 8 dígitos e
    // loga. O usuário digita em WhatsApp › Aparelhos conectados › Conectar com
    // número de telefone. Sem PAIR_NUMBER, segue o fluxo normal de QR.
    if (this.pairNumber && !state.creds.registered) {
      setTimeout(() => {
        sock
          .requestPairingCode(this.pairNumber as string)
          .then((code) =>
            logger.info(
              { code },
              '🔗 Código de pareamento — WhatsApp › Aparelhos conectados › Conectar com número de telefone',
            ),
          )
          .catch((err) => logger.error({ err }, 'Falha ao gerar código de pareamento (use o QR).'));
      }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => this.onConnectionUpdate(update));
    sock.ev.on('messages.upsert', (upsert) => {
      void this.onMessagesUpsert(upsert).catch((err) =>
        logger.error({ err }, 'Falha ao processar messages.upsert.'),
      );
    });
    sock.ev.on('messages.reaction', (reactions) => this.onMessagesReaction(reactions));
    sock.ev.on('messages.update', (updates) => this.onMessagesUpdate(updates));
    sock.ev.on('message-receipt.update', (updates) => this.onMessageReceiptUpdate(updates));

    // --- Captura de contatos (mapa LID↔telefone↔nome) ---
    sock.ev.on('contacts.upsert', (contacts) => {
      for (const c of contacts) this.contacts.mergeContact(c);
    });
    sock.ev.on('contacts.update', (updates) => {
      for (const c of updates) this.contacts.mergeContact(c);
    });
    // Vínculo direto LID↔telefone publicado pela lib.
    sock.ev.on('lid-mapping.update', (m) => {
      if (m?.lid && m?.pn) this.contacts.mergeLidPn(m.lid, m.pn);
    });
    // History sync também traz contatos e mapeamentos LID/PN — e o acervo de
    // mensagens, que agora indexamos pelo mesmo caminho do upsert (dedup por id).
    sock.ev.on(
      'messaging-history.set',
      ({ contacts, lidPnMappings, messages, progress, isLatest, syncType }) => {
        for (const c of contacts ?? []) this.contacts.mergeContact(c);
        for (const m of lidPnMappings ?? []) {
          if (m?.lid && m?.pn) this.contacts.mergeLidPn(m.lid, m.pn);
        }
        logger.info(
          {
            count: messages?.length ?? 0,
            progress: progress ?? null,
            isLatest: isLatest ?? null,
            syncType: syncType ?? null,
          },
          '📜 History sync recebido.',
        );
        void this.onHistorySet(messages).catch((err) =>
          logger.error({ err }, 'Falha ao processar history sync.'),
        );
      },
    );

    // --- Listeners de fundação (ondas seguintes) — por ora só logam/persistem o mínimo ---
    sock.ev.on('call', (calls) => this.onCallEvent(calls));
    sock.ev.on('groups.update', (updates) => {
      for (const g of updates) logger.debug({ id: g.id, subject: g.subject }, '👥 groups.update');
    });
    sock.ev.on('group-participants.update', (ev) => {
      logger.debug(
        { id: ev.id, action: ev.action, count: ev.participants?.length ?? 0 },
        '👥 group-participants.update',
      );
    });
    sock.ev.on('chats.upsert', (chats) => this.onChatsUpsert(chats));
    sock.ev.on('chats.update', (updates) => this.onChatsUpdate(updates));
    sock.ev.on('chats.delete', (ids) => {
      logger.debug({ count: ids.length }, '💬 chats.delete');
      for (const id of ids) {
        // Tenta resolver o slug como grupo (subject) ou DM — usa o nome do grupo
        // se conhecido; senão deriva o slug do jid diretamente.
        const slug = this.groups.has(id)
          ? this.slugFromJid(id)
          : isDirectJid(id)
            ? resolveConversation(id, id, null).conversationSlug
            : this.slugFromJid(id);
        this.chatStates.delete(slug);
      }
    });
    sock.ev.on('presence.update', (p) => this.onPresenceUpdate(p));
    sock.ev.on('blocklist.set', (b) =>
      logger.debug({ count: b.blocklist?.length ?? 0 }, '🚫 blocklist.set'),
    );
    sock.ev.on('blocklist.update', (b) =>
      logger.debug({ type: b.type, count: b.blocklist?.length ?? 0 }, '🚫 blocklist.update'),
    );
  }

  /**
   * Deriva o conversationSlug de um JID de grupo usando o nome conhecido (subject).
   * Para grupos sem nome em memória, slug do próprio jid como fallback.
   */
  private slugFromJid(jid: string): string {
    const name = this.groups.get(jid);
    if (name) {
      const { conversationSlug } = resolveConversation(jid, name, null);
      return conversationSlug;
    }
    // Fallback — usa jid cru (raro: grupo sem subject ainda carregado).
    const { conversationSlug } = resolveConversation(jid, jid, null);
    return conversationSlug;
  }

  /**
   * Extrai as flags de estado de um objeto de chat do Baileys e grava no sidecar.
   * Só LEITURA — nunca chama chatModify nem altera nada no WhatsApp.
   *
   * Campos relevantes (proto.IConversation, herdado por Chat):
   *   pinned: number|null  — timestamp de pino (truthy = fixado)
   *   archived: boolean|null
   *   muteEndTime: number|Long|null  — epoch em segundos (0 ou no passado = não silenciado)
   *   markedAsUnread: boolean|null
   */
  private applyChatState(
    jid: string,
    chat: {
      pinned?: number | null;
      archived?: boolean | null;
      muteEndTime?: number | { toNumber(): number } | null;
      markedAsUnread?: boolean | null;
    },
  ): void {
    if (!jid) return;

    const slug = isDirectJid(jid)
      ? resolveConversation(jid, jid, null).conversationSlug
      : this.slugFromJid(jid);

    const nowSec = Math.floor(Date.now() / 1000);
    const pinnedTs = typeof chat.pinned === 'number' ? chat.pinned : null;
    const muteRaw = chat.muteEndTime;
    const muteEndSec =
      muteRaw == null ? 0 : typeof muteRaw === 'number' ? muteRaw : muteRaw.toNumber();

    this.chatStates.upsert(slug, {
      pinned: Boolean(pinnedTs),
      pinnedAt: pinnedTs ?? null,
      muted: muteEndSec > nowSec,
      archived: Boolean(chat.archived),
      markedAsUnread: Boolean(chat.markedAsUnread),
    });
  }

  /**
   * `chats.upsert` — lista inicial de conversas entregue no boot (sync).
   * Cada item é um Chat completo; capturamos as flags de estado.
   */
  private onChatsUpsert(chats: ChatsUpsert): void {
    logger.debug({ count: chats.length }, '💬 chats.upsert');
    for (const chat of chats) {
      if (!chat.id) continue;
      this.applyChatState(chat.id, chat);
    }
    void this.chatStates.flush();
  }

  /**
   * `chats.update` — delta de propriedades alteradas (pin/unpin, mute, archive...).
   * O objeto pode trazer só os campos que mudaram (Partial<Chat>), então fazemos
   * merge com o estado anterior via `upsert` (que preserva campos não presentes).
   */
  private onChatsUpdate(updates: ChatsUpdate): void {
    logger.debug({ count: updates.length }, '💬 chats.update');
    for (const update of updates) {
      if (!update.id) continue;
      // Só aplica os campos que vieram no update (os outros mantêm o valor anterior).
      const partial: {
        pinned?: number | null;
        archived?: boolean | null;
        muteEndTime?: number | { toNumber(): number } | null;
        markedAsUnread?: boolean | null;
      } = {};
      if ('pinned' in update) partial.pinned = update.pinned ?? null;
      if ('archived' in update) partial.archived = update.archived ?? null;
      if ('muteEndTime' in update) partial.muteEndTime = update.muteEndTime as number | null;
      if ('markedAsUnread' in update) partial.markedAsUnread = update.markedAsUnread ?? null;

      // Se nenhum campo de estado chegou, ignora (pode ser timestamp/lastMsg only).
      const hasState =
        'pinned' in update ||
        'archived' in update ||
        'muteEndTime' in update ||
        'markedAsUnread' in update;
      if (!hasState) continue;

      this.applyChatState(update.id, partial);
    }
  }

  /**
   * Eventos de chamada (`call`). Só LEITURA: normaliza pelo mapper e emite ao
   * domínio (o collector grava no calls.jsonl, dedup por callId na leitura). O
   * status evolui ao longo da chamada (offer→ringing→accept/reject/timeout/
   * terminate) — emitimos cada transição; o leitor aplica "último vence".
   * Mesma regra de filtro do resto do pipeline (grupos @g.us + DMs).
   */
  private onCallEvent(calls: WACallEvent[]): void {
    for (const c of calls) {
      const mapped = mapCall(c);
      if (!mapped) continue;
      if (!(mapped.chatJid.endsWith('@g.us') || isDirectJid(mapped.chatJid))) continue;
      // Em grupo, o nome legível é o subject conhecido; sobrescreve o fallback.
      const conv = resolveConversation(
        mapped.chatJid,
        this.groups.get(mapped.chatJid) ?? mapped.chatJid,
        null,
      );
      this.emitter.emit('call', {
        ...mapped,
        conversationSlug: conv.conversationSlug,
      } satisfies InboundCall);
    }
  }

  /**
   * `presence.update` (digitando/gravando/online/visto por último). Só LEITURA:
   * normaliza pelo mapper e emite ao domínio (o collector grava no sidecar
   * volátil). Filtra grupos/DMs como o resto do pipeline; não loga em flood.
   */
  private onPresenceUpdate(p: PresenceUpdate): void {
    const jid = p.id;
    if (!jid || !(jid.endsWith('@g.us') || isDirectJid(jid))) return;
    const mapped = mapPresence(jid, this.groups.get(jid) ?? jid, p.presences);
    if (mapped) this.emitter.emit('presence', mapped);
  }

  /**
   * Inscreve-se para RECEBER a presença de um jid (`presenceSubscribe`). Discreto
   * e idempotente: só inscreve uma vez por jid por conexão. Best-effort — falha
   * (jid inválido/sem permissão) é engolida. Não envia/altera nada na conta.
   */
  private subscribePresence(jid: string): void {
    const sock = this.sock;
    if (!sock) return;
    if (!(jid.endsWith('@g.us') || isDirectJid(jid))) return;
    if (this.presenceSubscribed.has(jid)) return;
    this.presenceSubscribed.add(jid);
    sock.presenceSubscribe(jid).catch(() => {
      // Sem permissão / jid inválido — desmarca para tentar de novo numa próxima.
      this.presenceSubscribed.delete(jid);
    });
  }

  /**
   * `messages.update` traz o `status` numérico agregado (sobretudo em 1:1, mas
   * também dá o pulso geral em grupo). Usamos para o status "macro" da mensagem.
   */
  private onMessagesUpdate(updates: MessagesUpdate): void {
    for (const { key, update } of updates) {
      const jid = key.remoteJid;
      const id = key.id;
      // Grupo (@g.us) e DM 1:1 — o grosso do atendimento é DM, não pode se perder.
      if (!jid || !id || !(jid.endsWith('@g.us') || isDirectJid(jid))) continue;

      // Revogação ("apagada para todos"): o Baileys decodifica o protocolMessage
      // REVOKE e re-emite aqui com messageStubType = REVOKE e message = null. O
      // key.id já é o da mensagem ORIGINAL (a lib troca). Aplica-se a qualquer
      // autor (não só fromMe), então tratamos ANTES do gate de receipt.
      if (update.messageStubType === WAMessageStubType.REVOKE) {
        this.handleRevoke(jid, id, key);
        continue;
      }

      // Edição: o Baileys re-emite com update.message = { editedMessage: {...} }.
      // key.id é o da original. Vale para qualquer autor.
      if (update.message) {
        const content = update.message as proto.IMessage;
        if (content.editedMessage || content.protocolMessage?.editedMessage) {
          this.handleEdit(jid, id, content);
          continue;
        }
      }

      if (!key.fromMe) continue; // a partir daqui, só receipts de mensagens que EU enviei
      const status = mapStatusCode(update.status);
      if (!status) continue;
      this.bumpReceiptStatus(jid, id, status);
      this.emitReceipt(jid, id);
    }
  }

  /**
   * Emite a revogação de uma mensagem (id = mensagem original). O collector
   * grava no deletes.jsonl; a leitura esconde o conteúdo e marca "apagada".
   */
  private handleRevoke(jid: string, targetId: string, key: { participant?: string | null }): void {
    const conv = resolveConversation(jid, this.groups.get(jid) ?? jid, null);
    this.emitter.emit('delete', {
      targetId,
      chatJid: jid,
      isDirect: conv.isDirect,
      conversationSlug: conv.conversationSlug,
      by: key.participant ?? (isDirectJid(jid) ? jid : null),
      timestamp: new Date(),
    } satisfies InboundDelete);
  }

  /**
   * Emite a edição de uma mensagem (id = mensagem original) com o texto novo. Se
   * a edição não trouxer texto interpretável (só mídia trocada), ignora.
   */
  private handleEdit(jid: string, targetId: string, content: proto.IMessage): void {
    const newText = editedTextFrom(content);
    if (newText === null) return;
    const conv = resolveConversation(jid, this.groups.get(jid) ?? jid, null);
    this.emitter.emit('edit', {
      targetId,
      chatJid: jid,
      isDirect: conv.isDirect,
      conversationSlug: conv.conversationSlug,
      newText,
      timestamp: new Date(),
    } satisfies InboundEdit);
  }

  /**
   * `message-receipt.update` traz o receipt POR participante. É a única fonte
   * de "lida por N" em grupo: `readTimestamp` = leu, `receiptTimestamp` = recebeu.
   */
  private onMessageReceiptUpdate(updates: MessageReceiptUpdate): void {
    for (const { key, receipt } of updates) {
      if (!key.fromMe) continue;
      const jid = key.remoteJid;
      const id = key.id;
      // Grupo (@g.us) e DM 1:1. Em DM o leitor é o próprio contato do DM, então
      // `userJid` pode vir vazio — caímos no `remoteJid` como leitor único.
      if (!jid || !id || !(jid.endsWith('@g.us') || isDirectJid(jid))) continue;
      const state = this.ensureReceiptState(jid, id);
      const user = receipt.userJid ?? (isDirectJid(jid) ? jid : undefined);
      if (!user) continue;
      if (toMillis(receipt.readTimestamp) > 0 || toMillis(receipt.playedTimestamp) > 0) {
        state.read.add(user);
        state.delivered.add(user);
        this.bumpReceiptStatus(jid, id, 'read');
      } else if (toMillis(receipt.receiptTimestamp) > 0) {
        state.delivered.add(user);
        this.bumpReceiptStatus(jid, id, 'delivered');
      }
      this.emitReceipt(jid, id);
    }
  }

  private ensureReceiptState(jid: string, id: string): ReceiptState {
    let state = this.receipts.get(id);
    if (!state) {
      state = { groupJid: jid, status: 'sent', delivered: new Set(), read: new Set() };
      this.receipts.set(id, state);
      // Evict do mais antigo quando passa do teto (Map preserva ordem de inserção).
      if (this.receipts.size > MAX_RECEIPTS) {
        const oldest = this.receipts.keys().next().value;
        if (oldest !== undefined) this.receipts.delete(oldest);
      }
    }
    return state;
  }

  private bumpReceiptStatus(jid: string, id: string, status: ReceiptStatus): void {
    const state = this.ensureReceiptState(jid, id);
    if (STATUS_RANK[status] > STATUS_RANK[state.status]) state.status = status;
  }

  private emitReceipt(jid: string, id: string): void {
    const state = this.receipts.get(id);
    if (!state) return;
    // Em DM o slug é `dm-<handle>` (não `slugify(jid)`); resolveConversation
    // unifica grupo e DM. groupName de DM cai no handle quando não há pushName.
    const conv = resolveConversation(jid, this.groups.get(jid) ?? jid, null);
    this.emitter.emit('receipt', {
      groupJid: jid,
      groupName: conv.groupName,
      isDirect: conv.isDirect,
      conversationSlug: conv.conversationSlug,
      targetId: id,
      status: state.status,
      readBy: state.read.size,
      deliveredBy: state.delivered.size,
      readByJids: [...state.read],
      deliveredByJids: [...state.delivered],
      timestamp: new Date(),
    } satisfies InboundReceipt);
  }

  private onMessagesReaction(reactions: MessagesReaction): void {
    for (const item of reactions) {
      const jid = item.key.remoteJid;
      if (!jid || !(jid.endsWith('@g.us') || isDirectJid(jid))) continue; // grupos e DMs
      const groupName = this.groups.get(jid) ?? jid;
      const mapped = mapReaction(item, groupName);
      if (mapped) this.emitter.emit('reaction', mapped);
    }
  }

  private onConnectionUpdate(update: ConnectionUpdate): void {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      logger.info('📲 Escaneie o QR code abaixo (WhatsApp › Aparelhos conectados):');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      logger.info('✅ Conectado ao WhatsApp.');
      this.reconnectAttempts = 0; // conexão estável → zera o backoff
      void this.refreshGroups();
    }
    if (connection === 'close') {
      this.onClose(lastDisconnect);
    }
    // Publica o estado para o painel (QR aparece no navegador também).
    if (connection || qr) {
      this.emitter.emit('status', { connection, qr: qr ?? null } satisfies GatewayStatus);
    }
  }

  private onClose(lastDisconnect: ConnectionUpdate['lastDisconnect']): void {
    if (this.stopping) return;
    const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output
      ?.statusCode;
    if (statusCode === DisconnectReason.loggedOut) {
      logger.error('⚠️  Sessão deslogada no celular. Apague a pasta auth/ e pareie novamente.');
      return;
    }
    // Backoff exponencial com teto + jitter — evita loop apertado de reconexão.
    const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempts);
    const delayMs = Math.floor(base / 2 + (base / 2) * Math.random());
    this.reconnectAttempts += 1;
    logger.warn(
      { statusCode, delayMs, attempt: this.reconnectAttempts },
      '🔁 Conexão caiu. Reconectando com backoff...',
    );
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delayMs);
  }

  private async onMessagesUpsert(upsert: MessagesUpsert): Promise<void> {
    if (upsert.type !== 'notify') return; // apenas tempo real (ignora histórico)
    // Espera os nomes de grupo carregarem: sem isso o slug sairia do JID cru e
    // fragmentaria o histórico do grupo (ver groupsReady). Instantâneo após o 1º.
    await this.groupsReady;
    const sock = this.sock;
    if (!sock) return;
    for (const wa of upsert.messages) {
      const jid = wa.key.remoteJid;
      // Coleta grupos (@g.us) e DMs (contato 1:1); ignora broadcast/status e afins.
      if (!jid || !(jid.endsWith('@g.us') || isDirectJid(jid))) continue;
      // Chat ativo (chegou mensagem em tempo real) → passa a receber presença dele.
      this.subscribePresence(jid);
      this.captureSenderFromMessage(wa);
      const groupName = this.groups.get(jid) ?? jid;
      // Enquete: registra (secret + opções) e emite a definição p/ apuração.
      this.handlePoll(wa, groupName);
      // Voto de enquete: decifra e emite (o pollUpdateMessage não vira balão).
      if (this.handlePollVote(wa, groupName)) continue;
      const mapped = mapMessage(wa, sock, groupName);
      if (mapped) this.emitMessageDeduped(mapped);
    }
  }

  /**
   * History sync (`messaging-history.set`) despeja meses de conversa no primeiro
   * pareamento. Indexamos essas mensagens pelo mesmo caminho do upsert: mesma
   * regra de filtro (grupos @g.us + DMs), normalização via mapper e dedup por id
   * (não duplica o que já veio em tempo real nem o que já está no jsonl). O
   * download de mídia é best-effort — o mapper já monta o descritor e o collector
   * decide; se a mídia de history não baixar, o registro vai sem arquivo.
   */
  private async onHistorySet(messages: HistorySet['messages']): Promise<void> {
    const sock = this.sock;
    if (!sock || !messages?.length) return;
    // Mesmo motivo do tempo real: sem os nomes carregados o slug sai do JID cru.
    await this.groupsReady;
    for (const wa of messages) {
      const jid = wa.key?.remoteJid;
      if (!jid || !(jid.endsWith('@g.us') || isDirectJid(jid))) continue;
      this.captureSenderFromMessage(wa);
      const groupName = this.groups.get(jid) ?? jid;
      // Mesma regra do tempo real: registra enquetes e apura votos do acervo.
      this.handlePoll(wa, groupName);
      if (this.handlePollVote(wa, groupName)) continue;
      const mapped = mapMessage(wa, sock, groupName);
      if (mapped) this.emitMessageDeduped(mapped);
    }
  }

  /**
   * Detecta uma criação de enquete (`pollCreationMessage*`): registra o secret +
   * opções no PollStore (server-side, p/ decifrar votos depois) e emite a
   * definição normalizada pro collector persistir o polls.jsonl (sem secret).
   * Idempotente — re-registrar a mesma enquete não causa dano.
   */
  private handlePoll(wa: WAMessage, groupName: string): void {
    const result = mapPoll(wa, groupName);
    if (!result) return;
    const { poll, secretB64, creatorJid } = result;
    const options: Record<string, string> = {};
    for (const o of poll.options) options[o.hash] = o.name;
    this.polls.set(poll.pollMsgId, { creatorJid, secretB64, options });
    this.emitter.emit('poll', poll);
  }

  /**
   * Detecta um voto (`pollUpdateMessage`): busca o secret da enquete no
   * PollStore, decifra o voto com `decryptPollVote` e emite as opções (por
   * hash). O Baileys 7.x NÃO decifra votos sozinho (o caminho automático está
   * comentado na lib), então fazemos manualmente aqui. Retorna true se a
   * mensagem ERA um voto (não deve virar balão). Re-voto reescreve o anterior.
   */
  private handlePollVote(wa: WAMessage, groupName: string): boolean {
    const content = normalizeMessageContent(wa.message);
    if (!content || getContentType(content) !== 'pollUpdateMessage') return false;
    const update = content.pollUpdateMessage;
    const creationKey = update?.pollCreationMessageKey;
    const pollMsgId = creationKey?.id;
    const vote = update?.vote;
    if (!pollMsgId || !vote || !wa.key.remoteJid) return true; // era voto, mas incompleto

    const entry = this.polls.get(pollMsgId);
    if (!entry) {
      // Enquete desconhecida (criada antes do coletor existir / secret perdido).
      logger.warn({ pollMsgId }, '🗳️  Voto de enquete sem secret conhecido — ignorado.');
      return true;
    }

    const meId = this.sock?.user?.id ? jidNormalizedUser(this.sock.user.id) : undefined;
    const voterJid = getKeyAuthor(wa.key, meId);
    const pollCreatorJid = getKeyAuthor(creationKey, meId);
    try {
      const decrypted = decryptPollVote(vote, {
        pollEncKey: Buffer.from(entry.secretB64, 'base64'),
        pollCreatorJid,
        pollMsgId,
        voterJid,
      });
      const selectedHashes = (decrypted.selectedOptions ?? []).map((opt) =>
        Buffer.from(opt).toString(),
      );
      const conv = resolveConversation(wa.key.remoteJid, groupName, wa.pushName);
      const mapped: InboundPollVote = {
        pollMsgId,
        groupJid: wa.key.remoteJid,
        isDirect: conv.isDirect,
        conversationSlug: conv.conversationSlug,
        voter: voterJid,
        voterName: wa.pushName?.trim() || voterJid.split('@')[0] || 'desconhecido',
        selectedHashes,
        timestamp: new Date(toMillis(wa.messageTimestamp) * 1000),
      };
      this.emitter.emit('pollVote', mapped);
    } catch (err) {
      logger.warn({ err, pollMsgId }, '🗳️  Falha ao decifrar voto de enquete.');
    }
    return true;
  }

  /**
   * Toda mensagem de grupo carrega o LID (`key.participant`) e o telefone real
   * (`key.participantAlt`) do remetente — a fonte mais rica de mapeamento em
   * tempo real. Em DM, `remoteJid`/`remoteJidAlt` cumprem o mesmo papel. O
   * `pushName` dá o nome. Sem isso, quem só posta (e some) ficaria sem telefone.
   */
  private captureSenderFromMessage(wa: WAMessage): void {
    if (wa.key.fromMe) return;
    const key = wa.key;
    const name = wa.pushName?.trim() || undefined;
    // Em grupo: participant(+Alt). Em DM: remoteJid(+Alt).
    const primary = key.participant ?? (isDirectJid(key.remoteJid ?? '') ? key.remoteJid : null);
    const alt = key.participant ? key.participantAlt : key.remoteJidAlt;
    const lid = pickByKind(primary, alt, 'lid');
    const phone = pickByKind(primary, alt, 'phone');
    if (lid || phone) this.contacts.merge({ lid, phone, name });
  }

  private async refreshGroups(): Promise<void> {
    const sock = this.sock;
    if (!sock) {
      this.markGroupsReady();
      return;
    }
    try {
      const all = await sock.groupFetchAllParticipating();
      this.groups.clear();
      for (const meta of Object.values(all)) {
        this.groups.set(meta.id, meta.subject || meta.id);
        // Participantes trazem id/lid/phoneNumber/notify — alimenta o mapa.
        for (const p of meta.participants ?? []) this.contacts.mergeContact(p);
      }
      logger.info({ count: this.groups.size }, '👥 Grupos carregados.');
      const list: GroupInfo[] = [...this.groups.entries()].map(([id, name]) => ({ id, name }));
      this.emitter.emit('groups', list);
      // Tenta resolver telefones que faltam (LID -> PN) pela base de mapeamento.
      void this.resolveMissingPhones();
    } catch (err) {
      logger.error({ err }, 'Falha ao buscar a lista de grupos.');
    }
    // Libera o processamento de mensagens mesmo se o fetch falhar (idempotente):
    // segurar pra sempre travaria a coleta. Sem nome, cai pro fallback de antes.
    this.markGroupsReady();
    void this.contacts.flush();
  }

  /**
   * Para os contatos que só conhecemos por LID, tenta descobrir o telefone real
   * via `signalRepository.lidMapping.getPNForLID`. É best-effort: a lib pode não
   * ter o vínculo, e nesse caso o contato fica marcado sem telefone no painel.
   */
  private async resolveMissingPhones(): Promise<void> {
    const sock = this.sock;
    if (!sock) return;
    const store = sock.signalRepository?.lidMapping;
    if (!store) return;
    for (const lid of this.contacts.lidsWithoutPhone()) {
      try {
        const pn = await store.getPNForLID(`${lid}@lid`);
        if (pn) this.contacts.mergeLidPn(`${lid}@lid`, pn);
      } catch {
        // vínculo indisponível — segue (contato fica sem telefone resolvido)
      }
    }
    void this.contacts.flush();
  }
}

/**
 * Classifica um par de JIDs (primary/alt) e devolve a user-part do tipo pedido.
 * Em grupo LID, `participant` é `@lid` e `participantAlt` é `@s.whatsapp.net`
 * (ou vice-versa) — então olhamos os dois e escolhemos pelo sufixo.
 */
function pickByKind(
  a: string | null | undefined,
  b: string | null | undefined,
  kind: 'lid' | 'phone',
): string | undefined {
  const want = kind === 'lid' ? '@lid' : '@s.whatsapp.net';
  for (const jid of [a, b]) {
    if (jid?.endsWith(want)) return (jid.split('@')[0] ?? '').split(':')[0] || undefined;
  }
  return undefined;
}
