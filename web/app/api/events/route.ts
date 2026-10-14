import { NextResponse } from 'next/server';
import { conversasDaRequisicao } from '@/lib/caixa-dados';
import { buildContacts, numberFromJid, roleOf } from '@/lib/contacts';
import { DATA_DIR, safeDataPath } from '@/lib/paths';
import { parseFiltro, parseSlugs } from '@/lib/sse-filtro';
import { abrirStreamEventos, type StreamHandle } from '@/lib/sse-stream';
import { parseCursor } from '@/lib/sse-tail';
import { readTriage } from '@/lib/triage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/events?slug=a,b[&alertar=1][&todos=1][&fromMe=0|1][&ocultar=coletor][&papel=client]
 * Stream SSE das mensagens NOVAS das conversas (linha do messages.jsonl + `slug`),
 * a partir do momento da conexão. Cada evento leva `id:` (cursor por conversa);
 * reenviar em `Last-Event-ID` retoma do buraco. `alertar=1` inclui todas as
 * conversas com `alertar` ligado na triagem; `todos=1` inclui todas as conversas
 * ativas (não silenciadas). É o canal de "plantão" do Monitor e do sino de
 * notificações do painel. Também emite `event: entrega` (transição de uma entrega
 * humanizada dessas conversas: interrompida, entregue…). Atrás do mesmo Basic
 * Auth do painel (proxy.ts cobre /api).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const modoAlertar = url.searchParams.get('alertar') === '1';
  const modoTodos = url.searchParams.get('todos') === '1';
  let slugs = parseSlugs(url.searchParams);

  for (const s of slugs) {
    try {
      safeDataPath(s, 'messages.jsonl');
    } catch {
      return NextResponse.json({ error: `slug inválido: ${s}` }, { status: 400 });
    }
  }

  if (modoAlertar || modoTodos) {
    const t = await readTriage();
    if (modoAlertar) {
      for (const s of Object.keys(t.alertar).filter((k) => t.alertar[k])) {
        try {
          safeDataPath(s, 'messages.jsonl');
          slugs.push(s);
        } catch {
          return NextResponse.json({ error: `slug inválido: ${s}` }, { status: 400 });
        }
      }
    }
    if (modoTodos) {
      const grupos = await conversasDaRequisicao();
      for (const g of grupos) {
        if (t.muted[g.slug]) continue;
        try {
          safeDataPath(g.slug, 'messages.jsonl');
          slugs.push(g.slug);
        } catch {
          // Ignora silenciosamente qualquer slug inválido quando vier de todos=1
        }
      }
    }
    slugs = [...new Set(slugs)];
  }

  if (!slugs.length && !modoAlertar && !modoTodos) {
    return NextResponse.json({ error: 'slug (ou alertar=1 / todos=1) obrigatório' }, { status: 400 });
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
