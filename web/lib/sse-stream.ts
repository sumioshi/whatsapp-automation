import { type FSWatcher, watch } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Role } from './contacts';
import { type FiltroEventos, passaFiltro } from './sse-filtro';
import { formatCursor, tailJsonl } from './sse-tail';

/**
 * Núcleo do stream SSE de mensagens novas: acompanha o `messages.jsonl` de uma
 * ou mais conversas, emite cada linha nova como evento com `id:` = cursor de
 * retomada (offset por conversa) e a chave `slug` injetada no JSON. Com cursor
 * de entrada (Last-Event-ID), repõe só o buraco — limitado às últimas
 * `maxReplay` linhas por conversa pra não inundar depois de horas fora.
 * Quem chama decide o transporte (a rota /api/events enfileira os quadros).
 */

export interface StreamOpts {
  dataDir: string;
  slugs: string[];
  /** Offsets de retomada por slug (parseCursor do Last-Event-ID). */
  cursor: Map<string, number>;
  filtro: FiltroEventos;
  papelDe: (sender: string) => Role;
  pollMs?: number;
  heartbeatMs?: number;
  maxReplay?: number;
  /**
   * Também acompanha `<dataDir>/.entregas.jsonl` (transições da fila de
   * entregas humanizadas) e emite `event: entrega` para as conversas do
   * stream. Sem `id:` — não entra no cursor de retomada, começa do fim.
   */
  entregas?: boolean;
}

export interface StreamHandle {
  close(): void;
  /** Espera a inicialização e drena todas as conversas (útil em teste e no replay). */
  drainAll(): Promise<void>;
}

interface Conversa {
  slug: string;
  file: string;
  /** Nome do arquivo vigiado dentro do diretório (fs.watch no diretório). */
  arquivo: string;
  tipo: 'mensagem' | 'entrega';
  /** Offset do primeiro byte ainda não consumido como linha completa. */
  base: number;
  carry: Buffer;
  draining: boolean;
  replayPendente: boolean;
  watcher: FSWatcher | null;
}

const ENTREGAS_FILE = '.entregas.jsonl';
const POLL_MS = 5_000; // rede de segurança caso o fs.watch perca evento
const HEARTBEAT_MS = 25_000; // mantém a conexão viva através do proxy
const MAX_REPLAY = 200;

export function abrirStreamEventos(
  opts: StreamOpts,
  emit: (frame: string) => void,
): StreamHandle {
  const maxReplay = opts.maxReplay ?? MAX_REPLAY;
  const conversas: Conversa[] = opts.slugs.map((slug) => ({
    slug,
    file: join(opts.dataDir, slug, 'messages.jsonl'),
    arquivo: 'messages.jsonl',
    tipo: 'mensagem',
    base: 0,
    carry: Buffer.alloc(0),
    draining: false,
    replayPendente: opts.cursor.has(slug),
    watcher: null,
  }));
  if (opts.entregas) {
    conversas.push({
      slug: '',
      file: join(opts.dataDir, ENTREGAS_FILE),
      arquivo: ENTREGAS_FILE,
      tipo: 'entrega',
      base: 0,
      carry: Buffer.alloc(0),
      draining: false,
      replayPendente: false,
      watcher: null,
    });
  }
  const offsets = new Map<string, number>();
  let closed = false;
  let poll: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const tamanho = (c: Conversa) => stat(c.file).then((s) => s.size).catch(() => 0);

  const drain = async (c: Conversa) => {
    if (c.draining || closed) return;
    c.draining = true;
    try {
      const size = await tamanho(c);
      if (size < c.base) {
        // arquivo trocado/truncado (rewrite atômico): sem replay do antigo
        c.base = size;
        c.carry = Buffer.alloc(0);
        if (c.tipo === 'mensagem') offsets.set(c.slug, size);
        return;
      }
      const pos = c.base + c.carry.length;
      if (size === pos) return;
      const fh = await open(c.file, 'r');
      let chunk: Buffer;
      try {
        chunk = Buffer.alloc(size - pos);
        const { bytesRead } = await fh.read(chunk, 0, chunk.length, pos);
        chunk = chunk.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
      const r = tailJsonl(c.carry, chunk, c.base);
      c.base += r.consumed;
      c.carry = r.carry;
      let linhas = r.lines;
      if (c.replayPendente) {
        c.replayPendente = false;
        if (linhas.length > maxReplay) {
          emit(`: replay truncado slug=${c.slug} ignoradas=${linhas.length - maxReplay}\n\n`);
          linhas = linhas.slice(-maxReplay);
        }
      }
      for (const { line, end } of linhas) {
        let obj: Record<string, unknown>;
        try {
          obj = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue; // linha corrompida: inútil pro consumidor, segue a vida
        }
        if (c.tipo === 'entrega') {
          const slug = typeof obj.slug === 'string' ? obj.slug : '';
          if (opts.slugs.includes(slug)) emit(`event: entrega\ndata: ${JSON.stringify(obj)}\n\n`);
          continue;
        }
        offsets.set(c.slug, end);
        if (!passaFiltro(obj as { fromMe?: boolean; origem?: string; sender?: string }, opts.filtro, opts.papelDe)) {
          continue;
        }
        emit(`id: ${formatCursor(offsets)}\ndata: ${JSON.stringify({ ...obj, slug: c.slug })}\n\n`);
      }
      if (!linhas.length && c.tipo === 'mensagem') offsets.set(c.slug, c.base);
    } catch {
      // arquivo pode não existir ainda; o próximo evento/poll tenta de novo
    } finally {
      c.draining = false;
    }
  };

  const drainTodas = async () => {
    for (const c of conversas) await drain(c);
  };

  const iniciar = async () => {
    for (const c of conversas) {
      const size = await tamanho(c);
      const cur = c.tipo === 'mensagem' ? opts.cursor.get(c.slug) : undefined;
      // Cursor válido retoma de lá; ausente ou além do arquivo começa do fim.
      if (cur !== undefined && cur <= size) {
        c.base = cur;
      } else {
        c.base = size;
        c.replayPendente = false;
      }
      if (c.tipo === 'mensagem') offsets.set(c.slug, c.base);
      try {
        // No DIRETÓRIO: sobrevive ao rewrite-por-rename do arquivo.
        c.watcher = watch(dirname(c.file), (_event, name) => {
          if (name === c.arquivo) void drain(c);
        });
      } catch {
        // diretório da conversa ainda não existe; o poll cobre
      }
    }
    emit(`: conectado slugs=${opts.slugs.join(',')}\n\n`);
    await drainTodas();
    if (closed) return;
    poll = setInterval(() => void drainTodas(), opts.pollMs ?? POLL_MS);
    heartbeat = setInterval(() => emit(': ping\n\n'), opts.heartbeatMs ?? HEARTBEAT_MS);
  };
  const pronto = iniciar();

  return {
    close() {
      if (closed) return;
      closed = true;
      for (const c of conversas) c.watcher?.close();
      if (poll) clearInterval(poll);
      if (heartbeat) clearInterval(heartbeat);
    },
    async drainAll() {
      await pronto;
      await drainTodas();
    },
  };
}
