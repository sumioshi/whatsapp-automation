import { NextResponse } from 'next/server';
import {
  getOrcaBin,
  readLocalTerminalScreen,
  readSyncedTerminalScreen,
  registrarWatchTerminal,
} from '@/lib/orca-bridge';
import { hashTela } from '@/lib/orca-terminal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LER_A_CADA_MS = 1000;
const PING_A_CADA_MS = 15_000;
const RENOVAR_WATCH_A_CADA_MS = 10_000;
const VALIDADE_WATCH_MS = 30_000;

/**
 * GET /api/escritorio/orca/terminal?terminal=<handle>[&slug=<slug>]
 * Stream SSE da tela de um terminal do Orca. A cada 1 s lê a tela (CLI local,
 * ou o último snapshot sincronizado quando a rota roda na nuvem) e emite
 * `event: screen` com `{tail, status, draft, seq}` só quando o conteúdo mudou;
 * `event: ping` a cada 15 s mantém a conexão viva. Na nuvem, renova o registro
 * de "terminal assistido" para o relay do Mac ler esse terminal a cada ciclo.
 * Fecha quando o navegador desconecta (`req.signal`).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const terminal = url.searchParams.get('terminal')?.trim() ?? '';
  if (!terminal || !/^[\w.:-]{1,200}$/.test(terminal)) {
    return NextResponse.json({ error: 'terminal (handle) obrigatório' }, { status: 400 });
  }

  const local = Boolean(getOrcaBin());
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let fechado = false;
      let seq = 0;
      let ultimoHash = '';
      let ultimoPing = Date.now();
      let ultimoWatch = 0;
      let lendo = false;

      const emitir = (evento: string, dados: unknown) => {
        if (fechado) return;
        try {
          controller.enqueue(enc.encode(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`));
        } catch {
          fechar();
        }
      };

      const passada = async () => {
        if (fechado || lendo) return;
        lendo = true;
        try {
          const agora = Date.now();
          if (!local && agora - ultimoWatch >= RENOVAR_WATCH_A_CADA_MS) {
            ultimoWatch = agora;
            await registrarWatchTerminal(terminal, VALIDADE_WATCH_MS).catch(() => {});
          }

          const tela = local
            ? await readLocalTerminalScreen(terminal)
            : await readSyncedTerminalScreen(terminal);
          const quadro = tela
            ? { tail: tela.tail, status: tela.status ?? 'running', draft: tela.draft ?? null }
            : { tail: [] as string[], status: 'unavailable', draft: null };

          const h = hashTela({ tail: quadro.tail, status: quadro.status });
          if (h !== ultimoHash) {
            ultimoHash = h;
            seq += 1;
            emitir('screen', { ...quadro, seq, fonte: local ? 'local' : 'remoto' });
            ultimoPing = Date.now();
          } else if (Date.now() - ultimoPing >= PING_A_CADA_MS) {
            ultimoPing = Date.now();
            emitir('ping', { t: ultimoPing });
          }
        } catch {
          // Leitura falhou nesta passada; a próxima tenta de novo.
        } finally {
          lendo = false;
        }
      };

      const timer = setInterval(() => void passada(), LER_A_CADA_MS);
      const fechar = () => {
        if (fechado) return;
        fechado = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* já fechado pelo runtime */
        }
      };

      req.signal.addEventListener('abort', fechar);
      void passada();
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
