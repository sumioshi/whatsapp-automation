import { NextResponse } from 'next/server';
import { buildContacts, numberFromJid, roleOf } from '@/lib/contacts';
import { DATA_DIR, safeDataPath } from '@/lib/paths';
import { parseFiltro, parseSlugs } from '@/lib/sse-filtro';
import { abrirStreamEventos, type StreamHandle } from '@/lib/sse-stream';
import { parseCursor } from '@/lib/sse-tail';
import { readTriage } from '@/lib/triage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/events?slug=a,b[&alertar=1][&fromMe=0|1][&ocultar=coletor][&papel=client]
 * Stream SSE das mensagens NOVAS das conversas (linha do messages.jsonl + `slug`),
 * a partir do momento da conexão. Cada evento leva `id:` (cursor por conversa);
 * reenviar em `Last-Event-ID` retoma do buraco. `alertar=1` inclui todas as
 * conversas com `alertar` ligado na triagem. É o canal de "plantão" do Monitor
 * no modo remoto: o Mac abre a conexão (atravessa NAT) e o servidor empurra na
 * hora que chega. Também emite `event: entrega` (transição de uma entrega
 * humanizada dessas conversas: interrompida, entregue…). Atrás do mesmo Basic
 * Auth do painel (proxy.ts cobre /api).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  let slugs = parseSlugs(url.searchParams);
  if (url.searchParams.get('alertar') === '1') {
    const t = await readTriage();
    slugs = [...new Set([...slugs, ...Object.keys(t.alertar).filter((s) => t.alertar[s])])];
  }
  if (!slugs.length) {
    return NextResponse.json({ error: 'slug (ou alertar=1) obrigatório' }, { status: 400 });
  }
  for (const s of slugs) {
    try {
      safeDataPath(s, 'messages.jsonl');
    } catch {
      return NextResponse.json({ error: `slug inválido: ${s}` }, { status: 400 });
    }
  }

  const filtro = parseFiltro(url.searchParams);
  const contatos = filtro.papel.size ? await buildContacts() : null;
  const papelDe = (sender: string) =>
    contatos ? roleOf(contatos, numberFromJid(sender)) : ('client' as const);
  const cursor = parseCursor(req.headers.get('last-event-id'));

  const enc = new TextEncoder();
  let handle: StreamHandle | null = null;
  const stream = new ReadableStream({
    start(controller) {
      let fechado = false;
      const fechar = () => {
        if (fechado) return;
        fechado = true;
        handle?.close();
        try {
          controller.close();
        } catch {
          /* já fechado pelo runtime */
        }
      };
      handle = abrirStreamEventos({ dataDir: DATA_DIR, slugs, cursor, filtro, papelDe, entregas: true }, (frame) => {
        if (fechado) return;
        try {
          controller.enqueue(enc.encode(frame));
        } catch {
          fechar();
        }
      });
      req.signal.addEventListener('abort', fechar);
    },
    cancel() {
      handle?.close();
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
