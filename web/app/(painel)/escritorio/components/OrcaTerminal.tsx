'use client';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef, useState } from 'react';
import { colunasParaTela, montarFrameXterm } from '@/lib/orca-terminal';

interface OrcaTerminalProps {
  terminalHandle: string;
  slug: string;
  titulo?: string | null;
  agente?: string | null;
  estadoAgente?: string | null;
  /** Tela já conhecida (snapshot) para pintar antes do primeiro frame do stream. */
  telaInicial?: string[] | null;
  onAbrirNoOrca?: () => void;
}

type Conexao = 'conectando' | 'ao-vivo' | 'reconectando';

interface FrameScreen {
  tail?: string[];
  status?: string;
  seq?: number;
  fonte?: 'local' | 'remoto';
}

// Junta as teclas digitadas num lote curto: uma chamada da CLI por rajada, não por tecla.
const LOTE_TECLAS_MS = 40;

// Sempre escuro, independente do tema do painel: é a convenção de terminal.
const TEMA = {
  background: '#0b0e14',
  foreground: '#d6dbe4',
  cursor: '#8ab4f8',
  cursorAccent: '#0b0e14',
  selectionBackground: 'rgba(138, 180, 248, 0.32)',
  black: '#1a1d24',
  brightBlack: '#5c6370',
};

/**
 * Terminal real do Orca na gaveta: xterm.js pintado pelo stream SSE da tela
 * (`/api/escritorio/orca/terminal`) e teclado devolvido cru pela ação
 * `enviar_teclas`. A tela do Orca vem sem cor (a CLI entrega texto renderizado),
 * então cada frame repinta o quadro inteiro num único write, sem piscar.
 */
export function OrcaTerminal({
  terminalHandle,
  slug,
  titulo,
  agente,
  estadoAgente,
  telaInicial,
  onAbrirNoOrca,
}: OrcaTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ultimaTelaRef = useRef<string[]>(telaInicial ?? []);
  const colunasDisponiveisRef = useRef(80);
  const loteRef = useRef('');
  const loteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cadeiaEnvioRef = useRef<Promise<void>>(Promise.resolve());

  const [conexao, setConexao] = useState<Conexao>('conectando');
  const [statusTerminal, setStatusTerminal] = useState<string>('…');
  const [fonte, setFonte] = useState<'local' | 'remoto' | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const pintar = (tail: string[]) => {
    ultimaTelaRef.current = tail;
    const term = termRef.current;
    if (!term) return;
    // Colunas = largura real da tela do Orca (rolagem horizontal), nunca quebra de linha.
    const cols = colunasParaTela(tail, colunasDisponiveisRef.current);
    if (cols !== term.cols) term.resize(cols, term.rows);
    term.write(montarFrameXterm(tail), () => term.scrollToBottom());
  };

  const despacharLote = () => {
    const data = loteRef.current;
    loteRef.current = '';
    if (!data) return;
    // Sequencial: um lote só sai depois do anterior, para a ordem das teclas valer.
    cadeiaEnvioRef.current = cadeiaEnvioRef.current
      .then(async () => {
        const res = await fetch('/api/escritorio/orca', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acao: 'enviar_teclas', slug, terminalHandle, data }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          result?: { error?: string };
        };
        if (!res.ok || json.ok === false) {
          setErroEnvio(json.result?.error || json.error || 'Falha ao enviar teclas');
        } else {
          setErroEnvio(null);
        }
      })
      .catch(() => setErroEnvio('Sem conexão com a ponte Orca'));
  };

  const enviarTeclas = (data: string) => {
    if (!data) return;
    loteRef.current += data;
    if (loteTimerRef.current) clearTimeout(loteTimerRef.current);
    loteTimerRef.current = setTimeout(() => {
      loteTimerRef.current = null;
      despacharLote();
    }, LOTE_TECLAS_MS);
  };

  // Monta o xterm uma vez por terminal e o encaixa no espaço disponível.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      convertEol: false,
      cursorBlink: false,
      disableStdin: false,
      fontSize: 11.5,
      lineHeight: 1.25,
      // Resolve a pilha de fontes já computada (next/font gera um nome próprio).
      fontFamily: getComputedStyle(el).fontFamily || 'ui-monospace, Menlo, monospace',
      scrollback: 400,
      theme: TEMA,
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    termRef.current = term;
    fitRef.current = fit;

    const ajustar = () => {
      if (!el.clientHeight || !el.clientWidth) return;
      const dims = fit.proposeDimensions();
      if (!dims || !dims.cols || !dims.rows) return;
      colunasDisponiveisRef.current = dims.cols;
      const cols = colunasParaTela(ultimaTelaRef.current, dims.cols);
      if (cols !== term.cols || dims.rows !== term.rows) term.resize(cols, dims.rows);
      // Medida nova pode mudar as linhas visíveis: repinta o último quadro limpo.
      if (ultimaTelaRef.current.length) pintar(ultimaTelaRef.current);
    };
    ajustar();
    const ro = new ResizeObserver(() => ajustar());
    ro.observe(el);

    const sub = term.onData((data) => enviarTeclas(data));
    if (ultimaTelaRef.current.length) pintar(ultimaTelaRef.current);

    return () => {
      ro.disconnect();
      sub.dispose();
      if (loteTimerRef.current) clearTimeout(loteTimerRef.current);
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalHandle]);

  // Stream da tela com reconexão automática do EventSource.
  useEffect(() => {
    setConexao('conectando');
    const es = new EventSource(
      `/api/escritorio/orca/terminal?terminal=${encodeURIComponent(terminalHandle)}&slug=${encodeURIComponent(slug)}`,
    );
    es.onopen = () => setConexao('ao-vivo');
    es.onerror = () => setConexao('reconectando');
    es.addEventListener('screen', (ev) => {
      try {
        const frame = JSON.parse((ev as MessageEvent).data) as FrameScreen;
        if (Array.isArray(frame.tail)) pintar(frame.tail);
        if (frame.status) setStatusTerminal(frame.status);
        if (frame.fonte) setFonte(frame.fonte);
        setConexao('ao-vivo');
      } catch {
        /* frame malformado: espera o próximo */
      }
    });
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalHandle, slug]);

  const bolinha =
    conexao === 'ao-vivo' ? '🟢' : conexao === 'reconectando' ? '🟡' : '⚪';
  const rotuloConexao =
    conexao === 'ao-vivo'
      ? `ao vivo${fonte === 'remoto' ? ' (via Mac)' : ''}`
      : conexao === 'reconectando'
        ? 'reconectando…'
        : 'conectando…';
  const rotuloStatus =
    statusTerminal === 'running'
      ? estadoAgente === 'working'
        ? 'rodando · agente trabalhando'
        : 'rodando'
      : statusTerminal === 'exited'
        ? 'encerrado'
        : statusTerminal === 'unavailable'
          ? 'sem tela'
          : statusTerminal;

  return (
    <div className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-lg border border-line bg-[#0b0e14]">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-white/10 px-2.5 py-1.5 text-[10px] text-zinc-400">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0" aria-hidden="true">
            🖥️
          </span>
          <span className="truncate font-mono text-zinc-200" title={terminalHandle}>
            {titulo || terminalHandle}
          </span>
          {agente && (
            <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300">
              {agente}
            </span>
          )}
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] ${
              statusTerminal === 'running'
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-white/10 text-zinc-400'
            }`}
          >
            {rotuloStatus}
          </span>
          <span className="shrink-0 font-mono text-[9px]" title="Conexão do stream da tela">
            {bolinha} {rotuloConexao}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => enviarTeclas('\x03')}
            title="Enviar Ctrl+C (interromper)"
            className="rounded border border-red-400/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-300 hover:bg-red-500/20"
          >
            ⏹ Ctrl+C
          </button>
          <button
            type="button"
            onClick={() => enviarTeclas('\r')}
            title="Enviar Enter"
            className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-200 hover:bg-white/20"
          >
            ↵ Enter
          </button>
          {onAbrirNoOrca && (
            <button
              type="button"
              onClick={onAbrirNoOrca}
              title="Focar este terminal no app Orca"
              className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-200 hover:bg-white/20"
            >
              ↗ Abrir no Orca
            </button>
          )}
        </div>
      </div>

      {erroEnvio && (
        <div className="border-b border-red-400/20 bg-red-500/10 px-2.5 py-1 text-[10px] text-red-300">
          ⚠️ {erroEnvio}
        </div>
      )}

      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-1.5 py-1 font-mono"
        onClick={() => termRef.current?.focus()}
      />
    </div>
  );
}
