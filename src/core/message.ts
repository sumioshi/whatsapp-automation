import type { Readable } from 'node:stream';

/** Tipos de mídia que o coletor reconhece e organiza em subpastas. */
export type MediaKind = 'audio' | 'video' | 'image' | 'document' | 'sticker' | 'gif';

/**
 * Tipo de uma mensagem: texto puro, uma das mídias, ou um tipo estruturado
 * (localização, contato/vCard, enquete, evento) que antes era descartado.
 */
export type MessageType = MediaKind | 'text' | 'location' | 'contact' | 'poll' | 'event';

/** Grupo do WhatsApp (identidade + nome legível). */
export interface GroupInfo {
  /** JID do grupo, ex.: 1203...@g.us */
  id: string;
  name: string;
}

/** Estado de conexão emitido pelo gateway (consumido pelo painel via arquivo). */
export interface GatewayStatus {
  /** 'open' | 'connecting' | 'close' | undefined (conforme o Baileys). */
  connection: string | undefined;
  /** String do QR quando há pareamento pendente; senão null. */
  qr: string | null;
}

/**
 * Descritor de mídia anexada a uma mensagem.
 * `download` é um closure ligado ao socket do Baileys — a camada de aplicação
 * dispara o download sem nunca conhecer detalhes da lib.
 */
export interface MediaDescriptor {
  kind: MediaKind;
  mimetype: string | null;
  /** Extensão já resolvida (ex.: 'ogg', 'mp4', 'jpg'). */
  fileExtension: string;
  download: () => Promise<Readable>;
}

/** Mensagem normalizada (independente do Baileys), pronta para ser processada. */
export interface InboundMessage {
  /** ID da mensagem (key.id) — usado para dedup. */
  id: string;
  groupJid: string;
  groupName: string;
  /**
   * true se for conversa 1:1 (DM) e não grupo. DMs são sempre coletados (não
   * passam pelo opt-in de grupos); a identidade da conversa é o contato do outro
   * lado, não a minha conta.
   */
  isDirect: boolean;
  /**
   * Slug estável da conversa (nome da pasta em DATA_DIR). Em grupo deriva do
   * nome; em DM deriva do JID do contato (único, imune a colisão de pushName).
   */
  conversationSlug: string;
  /** JID de quem enviou. */
  sender: string;
  /** Nome de exibição (pushName) ou fallback. */
  senderName: string;
  /** true se a mensagem foi enviada pela própria conta conectada. */
  fromMe: boolean;
  timestamp: Date;
  type: MessageType;
  /** Corpo do texto ou legenda da mídia; '' quando não há. */
  text: string;
  /** Texto da mensagem citada (reply), se houver. */
  quotedText: string | null;
  /** JID de quem escreveu a mensagem citada (reply), se houver. */
  quotedSender: string | null;
  media: MediaDescriptor | null;
}

/** Status de entrega/leitura de uma mensagem própria (fromMe). */
export type ReceiptStatus = 'sent' | 'delivered' | 'read';

/**
 * Confirmação de entrega/leitura de uma mensagem que EU enviei, normalizada.
 * Em grupo o status é agregado pelos participantes (ver gateway).
 */
export interface InboundReceipt {
  groupJid: string;
  groupName: string;
  /** true se for conversa 1:1 (DM); DMs não passam pelo opt-in de grupos. */
  isDirect: boolean;
  /** Slug da conversa (pasta em DATA_DIR) — distingue DM de grupo. */
  conversationSlug: string;
  /** ID da mensagem própria a que este receipt se refere. */
  targetId: string;
  /** Status mais avançado observado até agora. */
  status: ReceiptStatus;
  /** Quantos participantes já leram (em grupo). 0 quando não aplicável. */
  readBy: number;
  /** Quantos participantes já receberam (delivered). 0 quando não aplicável. */
  deliveredBy: number;
  /** JIDs dos participantes que já leram (em grupo). */
  readByJids: string[];
  /** JIDs dos participantes que já receberam (delivered) em grupo. */
  deliveredByJids: string[];
  timestamp: Date;
}

/**
 * Estado de presença efêmero de um contato/participante. `available` = online,
 * `composing` = digitando, `recording` = gravando áudio, `paused`/`unavailable`
 * = parou/offline. `lastSeen` (ms epoch) só vem quando o contato expõe "visto
 * por último". Presença é transiente: NÃO é persistida em jsonl, só num sidecar
 * volátil sobrescrito com o estado ATUAL.
 */
export type PresenceState = 'available' | 'unavailable' | 'composing' | 'recording' | 'paused';

/** Atualização de presença (efêmera) de um contato/participante, normalizada. */
export interface InboundPresence {
  /** JID do chat (DM = contato; grupo = jid do grupo). */
  chatJid: string;
  /** true se for conversa 1:1 (DM). */
  isDirect: boolean;
  /** Slug da conversa (pasta em DATA_DIR) — distingue DM de grupo. */
  conversationSlug: string;
  /** JID do participante cuja presença mudou (em DM, == chatJid). */
  participant: string;
  /** Estado de presença mais recente observado. */
  state: PresenceState;
  /** "Visto por último" em ms epoch, quando o contato expõe; senão null. */
  lastSeen: number | null;
  timestamp: Date;
}

/**
 * Status final de uma chamada, do ponto de vista da triagem. Derivado do
 * `WACallUpdateType` do Baileys: `offer/ringing/...` evoluem até um estado
 * terminal. Reduzimos a três desfechos úteis: perdida, atendida, recusada.
 */
export type CallOutcome = 'missed' | 'accepted' | 'rejected' | 'ongoing';

/**
 * Evento de chamada normalizado (uma ligação recebida/feita). O status do
 * Baileys evolui (offer→ringing→accept/reject/timeout/terminate); persistimos
 * UM registro por chamada (dedup por id), e a leitura aplica "último vence".
 */
export interface InboundCall {
  /** id da chamada (estável durante toda a chamada) — chave de dedup. */
  callId: string;
  /** JID do chat onde a chamada aparece (DM = contato; grupo = jid do grupo). */
  chatJid: string;
  isDirect: boolean;
  conversationSlug: string;
  /** JID de quem ligou. */
  from: string;
  /** Nome de exibição de quem ligou (best-effort). */
  fromName: string;
  /** true se for chamada de vídeo. */
  isVideo: boolean;
  /** true se for chamada de grupo. */
  isGroup: boolean;
  /** Status cru do Baileys (offer/ringing/accept/reject/timeout/terminate...). */
  status: string;
  /** Desfecho derivado p/ a UI (perdida/atendida/recusada/em andamento). */
  outcome: CallOutcome;
  timestamp: Date;
}

/**
 * Edição de uma mensagem recebida (o autor trocou o texto). Referencia o id da
 * mensagem ORIGINAL; a aplicação na leitura troca o texto + marca "editada".
 * O messages.jsonl é append-only — a edição vive neste sidecar.
 */
export interface InboundEdit {
  /** id da mensagem original que foi editada. */
  targetId: string;
  chatJid: string;
  isDirect: boolean;
  conversationSlug: string;
  /** Novo texto/legenda da mensagem. */
  newText: string;
  timestamp: Date;
}

/**
 * Revogação ("apagada para todos") de uma mensagem recebida. Referencia o id da
 * mensagem original; a leitura esconde o conteúdo e marca "apagada".
 */
export interface InboundDelete {
  /** id da mensagem original apagada. */
  targetId: string;
  chatJid: string;
  isDirect: boolean;
  conversationSlug: string;
  /** JID de quem apagou (best-effort), ou null. */
  by: string | null;
  timestamp: Date;
}

/** Reação (emoji) a uma mensagem, normalizada. */
export interface InboundReaction {
  groupJid: string;
  groupName: string;
  /** true se for conversa 1:1 (DM); grupos passam pelo opt-in, DMs não. */
  isDirect: boolean;
  /** Slug da conversa (pasta em DATA_DIR) — distingue DM de grupo. */
  conversationSlug: string;
  /** ID da mensagem que recebeu a reação. */
  targetId: string;
  /** Emoji; '' significa reação removida. */
  emoji: string;
  /** JID de quem reagiu. */
  reactor: string;
  reactorName: string;
  fromMe: boolean;
  timestamp: Date;
}

/** Registro persistido (uma linha do messages.jsonl). */
export interface MessageRecord {
  id: string;
  /** ISO 8601. */
  timestamp: string;
  group: string;
  groupJid: string;
  sender: string;
  senderName: string;
  fromMe: boolean;
  type: MessageType;
  text: string;
  quotedText: string | null;
  quotedSender: string | null;
  /** Caminho relativo do arquivo de mídia (a partir de DATA_DIR), ou null. */
  mediaPath: string | null;
}

/**
 * Mídia a enviar para um grupo/contato. Union discriminada por `kind`.
 * `path` é sempre um caminho absoluto de arquivo no disco.
 */
export type OutboundMedia =
  | { kind: 'image'; path: string; caption?: string }
  | { kind: 'document'; path: string; fileName: string; mimetype?: string; caption?: string }
  | { kind: 'audio'; path: string }
  | { kind: 'video'; path: string; caption?: string }
  | { kind: 'gif'; path: string; caption?: string };

/**
 * Definição de uma enquete capturada na criação (`pollCreationMessage*`),
 * normalizada para o domínio. NÃO carrega o `messageSecret` — esse fica só no
 * sidecar server-side (`.polls.json`) usado para decifrar votos; nunca sai daqui.
 */
export interface InboundPoll {
  /** id da mensagem de criação da enquete (== key.id) — chave de apuração. */
  pollMsgId: string;
  groupJid: string;
  isDirect: boolean;
  conversationSlug: string;
  /** Pergunta da enquete (`name`). */
  question: string;
  /** Opções na ordem original, com o hash sha256(optionName) usado pelos votos. */
  options: { name: string; hash: string }[];
  /** Quantas opções dá pra marcar (0 = sem limite/múltipla). 1 = escolha única. */
  selectableCount: number;
  timestamp: Date;
}

/**
 * Um voto decifrado numa enquete, normalizado. Cada voto substitui o anterior
 * do mesmo eleitor (re-voto) — a apuração é idempotente por (pollMsgId, voter).
 */
export interface InboundPollVote {
  /** id da enquete a que o voto se refere. */
  pollMsgId: string;
  groupJid: string;
  isDirect: boolean;
  conversationSlug: string;
  /** JID de quem votou. */
  voter: string;
  /** Nome de exibição de quem votou (best-effort). */
  voterName: string;
  /** Hashes sha256 das opções selecionadas (casam com InboundPoll.options[].hash). */
  selectedHashes: string[];
  timestamp: Date;
}

/** Definição de enquete persistida (uma linha do polls.jsonl). Sem secret. */
export interface PollRecord {
  pollMsgId: string;
  question: string;
  options: { name: string; hash: string }[];
  selectableCount: number;
  timestamp: string;
}

/** Voto persistido (uma linha do poll-votes.jsonl). Dedup por (pollMsgId, voter). */
export interface PollVoteRecord {
  pollMsgId: string;
  voter: string;
  voterName: string;
  selectedHashes: string[];
  /** ISO 8601. */
  timestamp: string;
}

/**
 * Chamada persistida (uma linha do calls.jsonl, append-only). Dedup por callId
 * no leitor: o status evolui, a última linha do mesmo callId vence.
 */
export interface CallRecord {
  callId: string;
  from: string;
  fromName: string;
  isVideo: boolean;
  isGroup: boolean;
  status: string;
  outcome: CallOutcome;
  /** ISO 8601 — usado para ordenar a chamada no timeline junto das mensagens. */
  timestamp: string;
}

/**
 * Edição persistida (uma linha do edits.jsonl, append-only). Dedup por targetId
 * no leitor: a última edição vence (uma mensagem pode ser editada várias vezes).
 */
export interface EditRecord {
  targetId: string;
  newText: string;
  /** ISO 8601 — momento da edição. */
  timestamp: string;
}

/**
 * Revogação persistida (uma linha do deletes.jsonl, append-only). Dedup por
 * targetId no leitor (a primeira/qualquer marca a mensagem como apagada).
 */
export interface DeleteRecord {
  targetId: string;
  by: string | null;
  /** ISO 8601 — momento da remoção. */
  timestamp: string;
}

/** Reação persistida (uma linha do reactions.jsonl). */
export interface ReactionRecord {
  targetId: string;
  emoji: string;
  reactor: string;
  reactorName: string;
  fromMe: boolean;
  timestamp: string;
}

/** Receipt persistido (uma linha do receipts.jsonl). Dedup por targetId no leitor. */
export interface ReceiptRecord {
  targetId: string;
  status: ReceiptStatus;
  readBy: number;
  deliveredBy: number;
  /** JIDs dos participantes que já leram. Ausente em registros antigos → tolerado como []. */
  readByJids?: string[];
  /** JIDs dos participantes que já receberam. Ausente em registros antigos → tolerado como []. */
  deliveredByJids?: string[];
  /** ISO 8601. */
  timestamp: string;
}
