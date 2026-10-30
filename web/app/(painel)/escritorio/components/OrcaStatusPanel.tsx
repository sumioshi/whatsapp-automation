'use client';

import { useEffect, useRef, useState } from 'react';
import type { OrcaSnapshot } from '@/lib/orca-bridge';

/** Saúde do snapshot como a rota devolve em `?info=1`, mais o instante em que chegou. */
export interface OrcaStatusInfo {
  ageMs: number;
  relayOk: boolean;
  recebidoEm: number;
}

export type OrcaStatusTone = 'ok' | 'warn' | 'off';

const IDADE_AVISO_MS = 60_000;
const IDADE_CRITICA_MS = 5 * 60_000;

/** Idade real do snapshot agora: o que a rota mediu + o tempo desde a resposta. */
export function idadeSnapshotMs(info: OrcaStatusInfo | null, agora = Date.now()): number | null {
  if (!info) return null;
  return info.ageMs + Math.max(0, agora - info.recebidoEm);
}

/** Cor do pill da barra: verde (local ou remoto fresco), amarelo (remoto velho), cinza (sem dado). */
export function tomStatusOrca(snapshot: OrcaSnapshot | null, idadeMs: number | null): OrcaStatusTone {
  if (!snapshot?.available) return 'off';
  if (snapshot.source === 'local-cli') return 'ok';
  if (idadeMs !== null && idadeMs > IDADE_AVISO_MS) return 'warn';
  return 'ok';
}

function formatarIdade(ms: number): string {
  if (ms < 1000) return 'agora';
  const s = Math.round(ms / 1000);
  if (s < 60) return `há ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return `há ${h} h ${m % 60} min`;
}

interface OrcaStatusPanelProps {
  snapshot: OrcaSnapshot | null;
  info: OrcaStatusInfo | null;
  onClose: () => void;
  onRefresh: () => void;
}

interface RespostaAcao {
  ok?: boolean;
  queued?: boolean;
  message?: string;
  error?: string;
  result?: { ok?: boolean; message?: string; error?: string };
}

async function chamarPonte(body: Record<string, unknown>): Promise<RespostaAcao> {
  const res = await fetch('/api/escritorio/orca', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as RespostaAcao;
}

function mensagemDe(data: RespostaAcao, fallbackOk: string): string {
  if (data.ok && data.queued) return '⏳ Na fila: o Orca do Mac executa em instantes.';
  const ok = data.result ? data.result.ok !== false && data.ok !== false : Boolean(data.ok);
  if (ok) return `✓ ${data.result?.message || data.message || fallbackOk}`;
  return `⚠️ ${data.result?.error || data.error || 'Falha na ponte Orca'}`;
}

export function OrcaStatusPanel({ snapshot, info, onClose, onRefresh }: OrcaStatusPanelProps) {
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [pairingCode, setPairingCode] = useState('');
  const [nomeAmbiente, setNomeAmbiente] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState<string | null>(null);

  // Foco inicial no título; Esc e clique fora fecham.
  useEffect(() => {
    tituloRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const alvo = e.target as Node | null;
      if (painelRef.current && alvo && !painelRef.current.contains(alvo)) {
        // O botão que abre o painel cuida do próprio toggle.
        if ((alvo as HTMLElement).closest?.('[data-orca-status-trigger]')) return;
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [onClose]);

  // A idade exibida anda sozinha entre um refresh e outro.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const idadeMs = idadeSnapshotMs(info, agora);
  const disponivel = Boolean(snapshot?.available);
  const local = snapshot?.source === 'local-cli';
  const idadeTom: OrcaStatusTone | 'danger' =
    idadeMs === null || local
      ? 'ok'
      : idadeMs > IDADE_CRITICA_MS
        ? 'danger'
        : idadeMs > IDADE_AVISO_MS
          ? 'warn'
          : 'ok';

  const estado = !disponivel
    ? { icone: '🔴', texto: 'Sem dado do Orca', classe: 'text-danger' }
    : local
      ? { icone: '🟢', texto: 'Conectado (CLI local)', classe: 'text-ok' }
      : {
          icone: '🔵',
          texto: `Remoto via ${snapshot?.hostLabel || 'Mac do operador'}`,
          classe: 'text-info',
        };

  async function parear(e: React.FormEvent) {
    e.preventDefault();
    const code = pairingCode.trim();
    if (!code || ocupado) return;
    setOcupado(true);
    setFeedback(null);
    try {
      const data = await chamarPonte({
        acao: 'parear_ambiente',
        pairingCode: code,
        name: nomeAmbiente.trim() || undefined,
      });
      const msg = mensagemDe(data, 'Ambiente pareado.');
      setFeedback(msg);
      if (msg.startsWith('✓') || msg.startsWith('⏳')) {
        setPairingCode('');
        setNomeAmbiente('');
        onRefresh();
      }
    } catch {
      setFeedback('⚠️ Erro de conexão com a ponte Orca');
    } finally {
      setOcupado(false);
    }
  }

  async function removerAmbiente(id: string) {
    if (ocupado) return;
    setOcupado(true);
    setFeedback(null);
    try {
      const data = await chamarPonte({ acao: 'remover_ambiente', id });
      setFeedback(mensagemDe(data, 'Ambiente removido.'));
      setConfirmandoRemocao(null);
      onRefresh();
    } catch {
      setFeedback('⚠️ Erro de conexão com a ponte Orca');
    } finally {
      setOcupado(false);
    }
  }

  const fatos: Array<[string, string]> = [
    ['Fonte', !disponivel ? 'nenhuma' : local ? 'CLI local' : 'sync remoto'],
    ['Host', snapshot?.hostLabel || '—'],
    ['Runtime', snapshot?.runtimeId ? snapshot.runtimeId.slice(0, 8) : '—'],
    ['Versão', snapshot?.appVersion || '—'],
    [
      'Estado',
      [snapshot?.runtimeState, snapshot?.connectionState].filter(Boolean).join(' · ') || '—',
    ],
  ];

  return (
    <div
      ref={painelRef}
      role="dialog"
      aria-labelledby="orca-status-titulo"
      className="absolute left-0 top-full z-40 mt-1.5 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-3 text-[11.5px] text-fg shadow-[var(--shadow-pop)]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id="orca-status-titulo"
          ref={tituloRef}
          tabIndex={-1}
          className="text-[12.5px] font-bold text-fg outline-none"
        >
          🐋 Ponte Orca
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRefresh}
            title="Atualizar agora"
            className="rounded border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold text-fg-dim hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            🔄
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel do Orca"
            className="rounded border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold text-fg-dim hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            ✕
          </button>
        </div>
      </div>

      <p className={`mt-2 font-semibold ${estado.classe}`}>
        <span aria-hidden="true">{estado.icone}</span> {estado.texto}
      </p>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {fatos.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-fg-dim">{k}</dt>
            <dd className="truncate font-mono text-[11px]" title={v}>
              {v}
            </dd>
          </div>
        ))}
        <dt className="text-fg-dim">Atualizado</dt>
        <dd
          className={`font-mono text-[11px] ${
            idadeTom === 'danger' ? 'text-danger' : idadeTom === 'warn' ? 'text-warn' : 'text-fg'
          }`}
        >
          {idadeMs === null ? '—' : formatarIdade(idadeMs)}
        </dd>
      </dl>

      {idadeTom !== 'ok' && (
        <p
          className={`mt-2 rounded border px-2 py-1.5 text-[11px] ${
            idadeTom === 'danger'
              ? 'border-danger/40 bg-danger-bg text-danger'
              : 'border-warn/40 bg-warn-bg text-warn'
          }`}
        >
          Relay parado? Rode <code className="font-mono">npm run orca-bridge</code> no Mac (ou{' '}
          <code className="font-mono">pm2 start ecosystem.config.cjs --only wa-orca-bridge</code>).
        </p>
      )}

      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {[
          ['Worktrees', snapshot?.allWorktreesCount ?? 0],
          ['Terminais', snapshot?.terminalsCount ?? 0],
          ['Agentes ativos', snapshot?.activeAgentsCount ?? 0],
        ].map(([rotulo, n]) => (
          <div key={rotulo} className="rounded border border-line bg-surface-2 px-2 py-1.5 text-center">
            <div className="font-mono text-[14px] font-bold tabular-nums text-fg">{n}</div>
            <div className="text-[10px] text-fg-dim">{rotulo}</div>
          </div>
        ))}
      </div>

      {snapshot && snapshot.hosts.length > 0 && (
        <section className="mt-3" aria-label="Hosts do Orca">
          <h3 className="text-[10px] font-bold uppercase tracking-wide text-fg-dim">
            Hosts ({snapshot.hosts.length})
          </h3>
          <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto">
            {snapshot.hosts.map((h) => (
              <li key={h.id} className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${h.connected ? 'bg-ok' : 'bg-fg-mute'}`}
                  aria-hidden="true"
                />
                <span className="truncate font-medium" title={h.id}>
                  {h.label}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-fg-dim">
                  {h.kind}
                  {h.platform ? ` · ${h.platform}` : ''}
                  {h.connected ? '' : ' · desconectado'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-3" aria-label="Ambientes remotos pareados">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-fg-dim">
          Ambientes pareados ({snapshot?.environments.length ?? 0})
        </h3>
        {snapshot && snapshot.environments.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {snapshot.environments.map((env) => (
              <li key={env.id} className="flex items-center justify-between gap-2">
                <span className="truncate font-medium" title={env.id}>
                  {env.label}
                </span>
                {confirmandoRemocao === env.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="text-[10px] text-fg-dim">Remover?</span>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => removerAmbiente(env.id)}
                      className="rounded border border-danger/40 bg-danger-bg px-1.5 py-0.5 text-[10px] font-semibold text-danger disabled:opacity-50"
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmandoRemocao(null)}
                      className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-fg-dim hover:text-fg"
                    >
                      Não
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => setConfirmandoRemocao(env.id)}
                    className="shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-fg-dim hover:border-danger/40 hover:text-danger disabled:opacity-50"
                  >
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-fg-dim">Nenhum Orca remoto pareado.</p>
        )}
      </section>

      <form onSubmit={parear} className="mt-3 space-y-1.5" aria-label="Parear outro Orca">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-fg-dim">
          Parear outro Orca
        </h3>
        <input
          type="text"
          value={nomeAmbiente}
          onChange={(e) => setNomeAmbiente(e.target.value)}
          placeholder="Nome (opcional, ex.: notebook-trabalho)"
          aria-label="Nome do ambiente"
          className="h-8 w-full rounded border border-line bg-surface-2 px-2 text-[11px] text-fg placeholder:text-fg-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="flex gap-1.5">
          <input
            type="password"
            autoComplete="off"
            value={pairingCode}
            onChange={(e) => setPairingCode(e.target.value)}
            placeholder="orca://pair?code=…"
            aria-label="Pairing code"
            className="h-8 min-w-0 flex-1 rounded border border-line bg-surface-2 px-2 font-mono text-[11px] text-fg placeholder:text-fg-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="submit"
            disabled={ocupado || !pairingCode.trim() || !disponivel}
            className="h-8 shrink-0 rounded border border-accent bg-accent px-3 text-[11px] font-semibold text-accent-ink disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {ocupado ? '…' : 'Parear'}
          </button>
        </div>
        <p className="text-[10px] text-fg-dim">
          O código vai direto para a CLI do Orca no Mac e não fica guardado.
        </p>
      </form>

      {feedback && (
        <p role="status" className="mt-2 text-[11px] font-medium text-fg">
          {feedback}
        </p>
      )}
    </div>
  );
}
