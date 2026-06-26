import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Sidecar volátil de ESTADO DE CHAT, persistido como JSON em `<DATA_DIR>/.chats.json`.
 * Reflete o que o operador marca no celular: fixado (pinned), silenciado (muted),
 * arquivado (archived) e marcado como não-lido (markedAsUnread).
 *
 * É estado atual, não histórico: o arquivo é sobrescrito atomicamente (tmp + rename)
 * com os dados mais recentes de cada conversa. Indexado pelo `conversationSlug`,
 * mesma chave de `/g/<slug>` no painel.
 *
 * Tolerante a falhas: nada aqui pode derrubar o coletor.
 */

const SIDECAR_NAME = '.chats.json';

/** Flags de estado de um chat. */
export interface ChatStateEntry {
  /** true se o chat está fixado no topo (pinned != null && pinned !== 0). */
  pinned: boolean;
  /** timestamp unix (segundos) do pino — útil p/ ordenar fixados entre si. */
  pinnedAt: number | null;
  /** true se notificações estão silenciadas (muteEndTime no futuro ou === 0). */
  muted: boolean;
  /** true se o chat está arquivado. */
  archived: boolean;
  /** true se foi marcado manualmente como não-lido (markedAsUnread). */
  markedAsUnread: boolean;
}

/** Formato do arquivo `.chats.json`. */
export interface ChatStateSidecar {
  version: 1;
  updatedAt: string;
  /** conversationSlug -> estado atual. */
  chats: Record<string, ChatStateEntry>;
}

/**
 * Acumula em memória o estado de cada conversa e persiste atomicamente em disco
 * (debounced). Mantido leve: chats.upsert/update chegam em rajada no boot.
 */
export class ChatStateStore {
  private readonly path: string;
  private readonly bySlug = new Map<string, ChatStateEntry>();
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, SIDECAR_NAME);
  }

  /**
   * Registra ou atualiza o estado de um chat. Campos opcionais: só os campos
   * presentes no update são aplicados (merge parcial = idempotente).
   */
  upsert(slug: string, update: Partial<ChatStateEntry>): void {
    const prev = this.bySlug.get(slug) ?? {
      pinned: false,
      pinnedAt: null,
      muted: false,
      archived: false,
      markedAsUnread: false,
    };
    this.bySlug.set(slug, { ...prev, ...update });
    this.scheduleFlush();
  }

  /** Remove o chat do sidecar (chats.delete). */
  delete(slug: string): void {
    if (this.bySlug.delete(slug)) this.scheduleFlush();
  }

  private snapshot(): ChatStateSidecar {
    const chats: Record<string, ChatStateEntry> = {};
    for (const [slug, entry] of this.bySlug) chats[slug] = entry;
    return { version: 1, updatedAt: new Date().toISOString(), chats };
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    // Debounce: chats.upsert chega em rajada no boot (sync inicial).
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 500);
  }

  /** Grava o sidecar atomicamente (tmp + rename) se houver mudanças pendentes. */
  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(this.snapshot(), null, 2)}\n`, 'utf8');
      await rename(tmp, this.path);
    } catch {
      // Falha de escrita não derruba o coletor — tenta de novo no próximo flush.
      this.dirty = true;
    }
  }
}
