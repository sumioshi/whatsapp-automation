import type { Readable } from 'node:stream';
import type {
  CallRecord,
  DeleteRecord,
  EditRecord,
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
  MediaKind,
  MessageRecord,
  OutboundMedia,
  PollRecord,
  PollVoteRecord,
  ReactionRecord,
  ReceiptRecord,
} from './message.js';

/**
 * Porta de entrada do WhatsApp. Implementada pelo adapter do Baileys.
 * A aplicação depende SÓ desta interface — troca de lib = troca de 1 arquivo.
 */
export interface WhatsAppGateway {
  /** Conecta, trata QR e reconexão. Resolve quando a 1ª conexão é iniciada. */
  start(): Promise<void>;
  /** Encerra a conexão de forma limpa. */
  stop(): Promise<void>;
  /** Registra handler para cada mensagem nova de grupo (tempo real). */
  onMessage(handler: (message: InboundMessage) => void): void;
  /** Registra handler disparado quando a lista de grupos é (re)carregada. */
  onGroups(handler: (groups: GroupInfo[]) => void): void;
  /** Registra handler para mudanças de estado de conexão (QR, open, close). */
  onStatus(handler: (status: GatewayStatus) => void): void;
  /** Registra handler para reações (emoji) a mensagens. */
  onReaction(handler: (reaction: InboundReaction) => void): void;
  /** Registra handler para confirmações de entrega/leitura de mensagens próprias. */
  onReceipt(handler: (receipt: InboundReceipt) => void): void;
  /** Registra handler para presença (digitando/online/visto por último) — só LEITURA. */
  onPresence(handler: (presence: InboundPresence) => void): void;
  /** Registra handler para a criação de uma enquete (definição + opções). */
  onPoll(handler: (poll: InboundPoll) => void): void;
  /** Registra handler para um voto de enquete já decifrado. */
  onPollVote(handler: (vote: InboundPollVote) => void): void;
  /** Registra handler para eventos de chamada (offer/accept/reject/timeout...). */
  onCall(handler: (call: InboundCall) => void): void;
  /** Registra handler para edição de mensagem recebida (texto novo). */
  onEdit(handler: (edit: InboundEdit) => void): void;
  /** Registra handler para revogação ("apagada para todos") de mensagem recebida. */
  onDelete(handler: (del: InboundDelete) => void): void;
  /** Envia uma mensagem de texto para um grupo/contato (jid). `mentions` = jids a marcar (@). */
  sendText(jid: string, text: string, mentions?: string[]): Promise<void>;
  /** Envia uma mídia (imagem, documento, áudio ou vídeo) para um grupo/contato (jid). */
  sendMedia(jid: string, media: OutboundMedia): Promise<void>;
  /**
   * Reage (emoji) a uma mensagem identificada por `key`. `emoji` vazio ('')
   * remove a reação. A própria reação também é emitida no fluxo de onReaction.
   */
  sendReaction(
    jid: string,
    key: { id: string; participant?: string; fromMe?: boolean },
    emoji: string,
  ): Promise<void>;
  /**
   * URL (alta-res) da foto de perfil de um grupo, ou null se não tiver/erro.
   * Encapsula a chamada ao Baileys; o download em si é feito pela aplicação.
   */
  getAvatarUrl(jid: string): Promise<string | null>;
}

/**
 * Porta de persistência. Implementada pelo adapter de filesystem hoje;
 * amanhã poderia ser um banco (para um painel) sem tocar na aplicação.
 */
export interface MessageStore {
  /** True se a mídia já existe (dedup). */
  hasMedia(groupSlug: string, kind: MediaKind, fileName: string): Promise<boolean>;
  /** Grava a mídia a partir de um stream. Retorna o caminho relativo salvo. */
  saveMedia(groupSlug: string, kind: MediaKind, fileName: string, data: Readable): Promise<string>;
  /** Anexa o registro ao log do grupo (jsonl + md). */
  saveRecord(groupSlug: string, record: MessageRecord): Promise<void>;
  /** Anexa uma reação ao reactions.jsonl do grupo. */
  saveReaction(groupSlug: string, reaction: ReactionRecord): Promise<void>;
  /** Anexa um receipt (entrega/leitura) ao receipts.jsonl do grupo. */
  saveReceipt(groupSlug: string, receipt: ReceiptRecord): Promise<void>;
  /** Anexa (com dedup por id no leitor) uma definição de enquete ao polls.jsonl. */
  savePoll(groupSlug: string, poll: PollRecord): Promise<void>;
  /** Anexa um voto de enquete ao poll-votes.jsonl (último por eleitor vence). */
  savePollVote(groupSlug: string, vote: PollVoteRecord): Promise<void>;
  /** Anexa uma chamada ao calls.jsonl (append-only; dedup por callId no leitor). */
  saveCall(groupSlug: string, call: CallRecord): Promise<void>;
  /** Anexa uma edição de mensagem ao edits.jsonl (append-only; última por id vence). */
  saveEdit(groupSlug: string, edit: EditRecord): Promise<void>;
  /** Anexa uma revogação ao deletes.jsonl (append-only; aplicada na leitura). */
  saveDelete(groupSlug: string, del: DeleteRecord): Promise<void>;
  /** Salva (sobrescreve) a foto do grupo em <slug>/avatar.jpg a partir de um stream. */
  saveAvatar(groupSlug: string, data: Readable): Promise<void>;
}
