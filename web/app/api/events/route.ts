import { watch, type FSWatcher } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { NextResponse } from 'next/server';
import { safeDataPath } from '@/lib/paths';
import { splitJsonlBuffer } from '@/lib/sse-tail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 25_000; // mantém a conexão viva através do proxy do Railway
const FALLBACK_POLL_MS = 5_000; // rede de segurança caso o fs.watch perca evento

/**
 * GET /api/events?slug=<grupo> — stream SSE das mensagens NOVAS do chat
 * (linhas cruas do messages.jsonl, mesmo formato do `tail -F` local), a partir
 * do momento da conexão. É o canal de "plantão" do Monitor no modo remoto:
 * o Mac abre a conexão (atravessa NAT) e o servidor empurra na hora que chega.
 * Atrás do mesmo Basic Auth do painel (proxy.ts cobre /api inteiro).
 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug obrigatório' }, { status: 400 });

  let file: string;
  try {
    file = safeDataPath(slug, 'messages.jsonl');
  } catch {
    return NextResponse.json({ error: 'slug inválido' }, { status: 400 });
  }

  const enc = new TextEncoder();
  let watcher: FSWatcher | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let offset = await stat(file).then((s) => s.size).catch(() => 0);
      let carry: Buffer = Buffer.alloc(0);
      let draining = false;

      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(text));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        watcher?.close();
        if (poll) clearInterval(poll);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* já fechado pelo runtime */
        }
      };

      // Lê do offset ao EOF e emite cada linha completa como um evento SSE.
      const drain = async () => {
        if (draining || closed) return;
        draining = true;
        try {
          const size = await stat(file).then((s) => s.size).catch(() => 0);
          if (size < offset) {
            // arquivo trocado/truncado (ex.: rewrite atômico): não replay do antigo
            offset = size;
            carry = Buffer.alloc(0);
            return;
          }
          if (size === offset) return;
          const fh = await open(file, 'r');
          try {
            const chunk = Buffer.alloc(size - offset);
            const { bytesRead } = await fh.read(chunk, 0, chunk.length, offset);
            offset += bytesRead;
            const r = splitJsonlBuffer(carry, chunk.subarray(0, bytesRead));
            carry = r.carry;
            for (const line of r.lines) send(`data: ${line}\n\n`);
          } finally {
            await fh.close();
          }
        } catch {
          /* arquivo pode não existir ainda; o próximo evento/poll tenta de novo */
        } finally {
          draining = false;
        }
      };

      send(`: conectado slug=${slug}\n\n`);

      // fs.watch no DIRETÓRIO (sobrevive ao rewrite-por-rename do arquivo).
      try {
        watcher = watch(dirname(file), (_event, name) => {
          if (name === 'messages.jsonl') void drain();
        });
      } catch {
        /* diretório do grupo ainda não existe; o poll cobre */
      }
      poll = setInterval(() => void drain(), FALLBACK_POLL_MS);
      heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      watcher?.close();
      if (poll) clearInterval(poll);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
