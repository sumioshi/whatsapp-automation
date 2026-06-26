import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PresenceState } from '../core/message.js';

/**
 * Sidecar volátil de PRESENÇA, persistido como JSON em `<DATA_DIR>/.presence.json`.
 * Presença é efêmera (digitando/online/visto por último), então NÃO há histórico:
 * o arquivo é sobrescrito atomicamente (tmp + rename) com o estado ATUAL de cada
 * conversa. Indexado pelo `conversationSlug` — a mesma chave que o painel usa para
 * abrir um chat (`/g/<slug>`), então `/api/presence?slug=` resolve direto.
 *
 * Tolerante a falhas: nada aqui pode derrubar o coletor (fire-and-forget).
 */

const SIDECAR_NAME = '.presence.json';

/** Uma entrada de presença por conversa (estado mais recente). */
export interface PresenceEntry {
  /** JID do chat (DM = contato; grupo = jid do grupo). */
  chatJid: string;
  /** Participante cuja presença está refletida (em grupo, o último ativo). */
  participant: string;
  /** Estado atual. */
  state: PresenceState;
  /** "Visto por último" em ms epoch, quando conhecido; senão null. */
  lastSeen: number | null;
  /** Quando observamos esse estado (ms epoch) — base p/ staleness no painel. */
  updatedAt: number;
}

/** Formato do arquivo `.presence.json`. */
export interface PresenceSidecar {
  version: 1;
  updatedAt: string;
  /** conversationSlug -> presença atual. */
  presences: Record<string, PresenceEntry>;
}

/**
 * Acumula em memória a presença por conversa e persiste atomicamente em disco
 * (debounced). Mantido leve: presença chega em rajada, então agrupamos flushes.
 */
export class PresenceStore {
  private readonly path: string;
  private readonly bySlug = new Map<string, PresenceEntry>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, SIDECAR_NAME);
  }

  /**
   * Registra o estado de presença ATUAL de uma conversa (sobrescreve o anterior).
   * `state: 'unavailable'` ainda é gravado (vira "visto por último"/offline no
   * painel) — não removemos a entrada, só a marcamos.
   */
  set(entry: {
    conversationSlug: string;
    chatJid: string;
    participant: string;
    state: PresenceState;
    lastSeen: number | null;
    timestamp: number;
  }): void {
    const prev = this.bySlug.get(entry.conversationSlug);
    this.bySlug.set(entry.conversationSlug, {
      chatJid: entry.chatJid,
      participant: entry.participant,
      state: entry.state,
      // Preserva o último lastSeen conhecido quando o update não trouxer um novo.
      lastSeen: entry.lastSeen ?? prev?.lastSeen ?? null,
      updatedAt: entry.timestamp,
    });
    this.scheduleFlush();
  }

  private snapshot(): PresenceSidecar {
    const presences: Record<string, PresenceEntry> = {};
    for (const [slug, entry] of this.bySlug) presences[slug] = entry;
    return { version: 1, updatedAt: new Date().toISOString(), presences };
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    // Debounce curto: presença chega em rajada (composing→paused→available).
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 400);
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
