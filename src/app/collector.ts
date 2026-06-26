import { Readable } from 'node:stream';
import type { GroupConfig } from '../config/groups.js';
import type {
  CallRecord,
  DeleteRecord,
  EditRecord,
  InboundCall,
  InboundDelete,
  InboundEdit,
  InboundMessage,
  InboundPoll,
  InboundPollVote,
  InboundPresence,
  InboundReaction,
  InboundReceipt,
  MessageRecord,
  PollRecord,
  PollVoteRecord,
  ReactionRecord,
  ReceiptRecord,
} from '../core/message.js';
import type { MessageStore } from '../core/ports.js';
import { logger } from '../logger.js';
import { mediaFileName, slugify } from '../storage/paths.js';
import type { PresenceStore } from '../storage/presenceStore.js';

/**
 * Orquestra o fluxo de uma mensagem: filtra grupos monitorados, baixa a mídia
 * (com dedup) e grava o registro. Depende só das portas — nunca do Baileys.
 */
export class Collector {
  constructor(
    private readonly store: MessageStore,
    private readonly groups: GroupConfig,
    private readonly presence: PresenceStore,
  ) {}

  async handle(msg: InboundMessage): Promise<void> {
    // DMs são sempre coletados; grupos só quando marcados (opt-in).
    if (!msg.isDirect && !this.groups.isWatched(msg.groupJid)) return;

    const slug = msg.conversationSlug;
    const mediaPath = msg.media ? await this.persistMedia(msg, slug) : null;

    const record: MessageRecord = {
      id: msg.id,
      timestamp: msg.timestamp.toISOString(),
      group: msg.groupName,
      groupJid: msg.groupJid,
      sender: msg.sender,
      senderName: msg.senderName,
      fromMe: msg.fromMe,
      type: msg.type,
      text: msg.text,
      quotedText: msg.quotedText,
      quotedSender: msg.quotedSender,
      mediaPath,
    };

    try {
      await this.store.saveRecord(slug, record);
    } catch (err) {
      logger.error({ err, group: msg.groupName, id: msg.id }, 'Falha ao gravar registro.');
    }
  }

  /** Grava uma reação (emoji) de um grupo monitorado ou de um DM. */
  async handleReaction(reaction: InboundReaction): Promise<void> {
    if (!reaction.isDirect && !this.groups.isWatched(reaction.groupJid)) return;
    const slug = reaction.conversationSlug;
    const record: ReactionRecord = {
      targetId: reaction.targetId,
      emoji: reaction.emoji,
      reactor: reaction.reactor,
      reactorName: reaction.reactorName,
      fromMe: reaction.fromMe,
      timestamp: reaction.timestamp.toISOString(),
    };
    try {
      await this.store.saveReaction(slug, record);
    } catch (err) {
      logger.error({ err, group: reaction.groupName }, 'Falha ao gravar reação.');
    }
  }

  /** Persiste a definição de uma enquete (sem secret) p/ o painel apurar votos. */
  async handlePoll(poll: InboundPoll): Promise<void> {
    if (!poll.isDirect && !this.groups.isWatched(poll.groupJid)) return;
    const record: PollRecord = {
      pollMsgId: poll.pollMsgId,
      question: poll.question,
      options: poll.options,
      selectableCount: poll.selectableCount,
      timestamp: poll.timestamp.toISOString(),
    };
    try {
      await this.store.savePoll(poll.conversationSlug, record);
    } catch (err) {
      logger.error({ err, id: poll.pollMsgId }, 'Falha ao gravar enquete.');
    }
  }

  /** Persiste um voto de enquete (append-only; apuração idempotente no leitor). */
  async handlePollVote(vote: InboundPollVote): Promise<void> {
    if (!vote.isDirect && !this.groups.isWatched(vote.groupJid)) return;
    const record: PollVoteRecord = {
      pollMsgId: vote.pollMsgId,
      voter: vote.voter,
      voterName: vote.voterName,
      selectedHashes: vote.selectedHashes,
      timestamp: vote.timestamp.toISOString(),
    };
    try {
      await this.store.savePollVote(vote.conversationSlug, record);
    } catch (err) {
      logger.error({ err, id: vote.pollMsgId }, 'Falha ao gravar voto de enquete.');
    }
  }

  /** Grava um receipt (entrega/leitura) de uma mensagem própria em grupo monitorado ou DM. */
  async handleReceipt(receipt: InboundReceipt): Promise<void> {
    // DMs são sempre coletados; grupos só quando marcados (opt-in) — espelha handle().
    if (!receipt.isDirect && !this.groups.isWatched(receipt.groupJid)) return;
    const slug = receipt.conversationSlug;
    const record: ReceiptRecord = {
      targetId: receipt.targetId,
      status: receipt.status,
      readBy: receipt.readBy,
      deliveredBy: receipt.deliveredBy,
      readByJids: receipt.readByJids,
      deliveredByJids: receipt.deliveredByJids,
      timestamp: receipt.timestamp.toISOString(),
    };
    try {
      await this.store.saveReceipt(slug, record);
    } catch (err) {
      logger.error({ err, group: receipt.groupName }, 'Falha ao gravar receipt.');
    }
  }

  /**
   * Grava uma chamada (calls.jsonl, append-only). O status evolui (offer→...→
   * accept/reject/timeout); cada transição é uma linha, e o leitor aplica
   * "último vence" por callId. Mesmo opt-in (DM sempre; grupo só monitorado).
   */
  async handleCall(call: InboundCall): Promise<void> {
    if (!call.isDirect && !this.groups.isWatched(call.chatJid)) return;
    const record: CallRecord = {
      callId: call.callId,
      from: call.from,
      fromName: call.fromName,
      isVideo: call.isVideo,
      isGroup: call.isGroup,
      status: call.status,
      outcome: call.outcome,
      timestamp: call.timestamp.toISOString(),
    };
    try {
      await this.store.saveCall(call.conversationSlug, record);
    } catch (err) {
      logger.error({ err, id: call.callId }, 'Falha ao gravar chamada.');
    }
  }

  /**
   * Grava uma edição de mensagem recebida (edits.jsonl, append-only). O
   * messages.jsonl é append-only — a edição vive aqui e é aplicada na leitura.
   */
  async handleEdit(edit: InboundEdit): Promise<void> {
    if (!edit.isDirect && !this.groups.isWatched(edit.chatJid)) return;
    const record: EditRecord = {
      targetId: edit.targetId,
      newText: edit.newText,
      timestamp: edit.timestamp.toISOString(),
    };
    try {
      await this.store.saveEdit(edit.conversationSlug, record);
    } catch (err) {
      logger.error({ err, id: edit.targetId }, 'Falha ao gravar edição.');
    }
  }

  /**
   * Grava a revogação de uma mensagem ("apagada para todos") no deletes.jsonl
   * (append-only). A leitura esconde o conteúdo original e marca "apagada".
   */
  async handleDelete(del: InboundDelete): Promise<void> {
    if (!del.isDirect && !this.groups.isWatched(del.chatJid)) return;
    const record: DeleteRecord = {
      targetId: del.targetId,
      by: del.by,
      timestamp: del.timestamp.toISOString(),
    };
    try {
      await this.store.saveDelete(del.conversationSlug, record);
    } catch (err) {
      logger.error({ err, id: del.targetId }, 'Falha ao gravar remoção.');
    }
  }

  /**
   * Atualiza a presença ATUAL (digitando/online/visto por último) de uma conversa
   * no sidecar volátil. Presença é efêmera: sobrescreve, não acumula histórico.
   * Mesmo opt-in das outras leituras (DM sempre; grupo só quando monitorado).
   */
  handlePresence(presence: InboundPresence): void {
    if (!presence.isDirect && !this.groups.isWatched(presence.chatJid)) return;
    this.presence.set({
      conversationSlug: presence.conversationSlug,
      chatJid: presence.chatJid,
      participant: presence.participant,
      state: presence.state,
      lastSeen: presence.lastSeen,
      timestamp: presence.timestamp.getTime(),
    });
  }

  /**
   * Baixa a foto de um grupo monitorado a partir da URL e salva como avatar.jpg
   * (cache sobrescrito). `url` null/erro = grupo sem foto → não faz nada.
   */
  async saveAvatar(groupJid: string, groupName: string, url: string | null): Promise<void> {
    if (!url || !this.groups.isWatched(groupJid)) return;
    const slug = slugify(groupName);
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) return;
      const stream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
      await this.store.saveAvatar(slug, stream);
      logger.info({ group: groupName }, '🖼️  Foto do grupo atualizada.');
    } catch (err) {
      logger.warn({ err, group: groupName }, 'Falha ao baixar foto do grupo.');
    }
  }

  /** Baixa e salva a mídia. Erros são logados sem derrubar o processo. */
  private async persistMedia(msg: InboundMessage, slug: string): Promise<string | null> {
    const media = msg.media;
    if (!media) return null;

    const fileName = mediaFileName(
      msg.timestamp,
      msg.senderName,
      msg.type,
      msg.id,
      media.fileExtension,
    );

    try {
      if (await this.store.hasMedia(slug, media.kind, fileName)) {
        return `${slug}/${media.kind}/${fileName}`;
      }
      const stream = await media.download();
      const path = await this.store.saveMedia(slug, media.kind, fileName, stream);
      logger.info({ group: msg.groupName, file: fileName }, '⬇️  Mídia salva.');
      return path;
    } catch (err) {
      logger.error({ err, group: msg.groupName, id: msg.id }, 'Falha ao baixar mídia.');
      return null;
    }
  }
}
