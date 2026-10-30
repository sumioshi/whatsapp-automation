'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MedidorUso } from '@/app/components/ui';
import type {
  ClienteEscritorio,
  ContatoProjetoEscritorio,
  DmDisponivelEscritorio,
} from '@/lib/escritorio-estado';
import { instanteLongo } from '@/lib/formatar-data';
import type { OrcaAgentSession, OrcaProjectAgentInfo } from '@/lib/orca-bridge';
import type { PresenceView } from '@/lib/presence';
import { CharSprite } from './CharSprite';

interface MensagemResumo {
  id: string;
  timestamp: string;
  senderName: string;
  fromMe?: boolean;
  type: string;
  text: string;
  quotedText?: string | null;
}

interface PainelClienteEscritorioProps {
  cliente: ClienteEscritorio;
  palette: number;
  presenca?: PresenceView;
  autonomo?: boolean;
  notaInicial?: string;
  seatLabel?: string;
  canalSelecionado?: string | null;
  onSelectCanal?: (canalSlug: string | null) => void;
  dmsDisponiveis?: DmDisponivelEscritorio[];
  orcaInfo?: OrcaProjectAgentInfo | null;
  orcaAvailable?: boolean;
  onRefreshOrca?: () => void;
  abaInicial?: 'whatsapp' | 'orca';
  onClose: () => void;
  onWalkTo: () => void;
  onRefreshEstado: () => void;
  onToggleMesa?: (slug: string, acao: 'ocupar_mesa' | 'liberar_mesa') => Promise<void>;
}

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

export function PainelClienteEscritorio({
  cliente,
  palette,
  presenca,
  autonomo,
  notaInicial = '',
  seatLabel,
  canalSelecionado,
  onSelectCanal,
  dmsDisponiveis = [],
  orcaInfo,
  orcaAvailable = false,
  onRefreshOrca,
  abaInicial = 'whatsapp',
  onClose,
  onWalkTo,
  onRefreshEstado,
  onToggleMesa,
}: PainelClienteEscritorioProps) {
  const [mensagens, setMensagens] = useState<MensagemResumo[]>([]);
  const [carregandoMsgs, setCarregandoMsgs] = useState(true);
  const [nota, setNota] = useState(notaInicial);
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [marcandoResolvido, setMarcandoResolvido] = useState(false);
  const [alterandoMesa, setAlterandoMesa] = useState(false);

  // Aba ativa do painel lateral: WhatsApp/CRM vs Agente Orca (Chat & Terminal)
  const [abaAtiva, setAbaAtiva] = useState<'whatsapp' | 'orca'>(abaInicial);
  const [indiceAgenteOrca, setIndiceAgenteOrca] = useState(0);
  const [mostrarTerminalOrca, setMostrarTerminalOrca] = useState(false);
  const [screenTailLocal, setScreenTailLocal] = useState<string[] | null>(null);
  const [carregandoScreen, setCarregandoScreen] = useState(false);
  const [promptOrca, setPromptOrca] = useState('');
  const [enviandoPromptOrca, setEnviandoPromptOrca] = useState(false);
  const [feedbackOrca, setFeedbackOrca] = useState<string | null>(null);

  useEffect(() => {
    setAbaAtiva(abaInicial);
    setIndiceAgenteOrca(0);
    setScreenTailLocal(null);
    setFeedbackOrca(null);
  }, [abaInicial, cliente.slug]);

  const agentesOrca: OrcaAgentSession[] = orcaInfo?.agents ?? [];
  const agenteSelecionado: OrcaAgentSession | null =
    agentesOrca[indiceAgenteOrca] ?? agentesOrca[0] ?? null;
  const terminalHandleAtivo =
    agenteSelecionado?.terminalHandle ?? orcaInfo?.primaryTerminalHandle ?? null;

  async function carregarScreenTerminal(handle?: string | null) {
    const h = handle ?? terminalHandleAtivo;
    if (!h) return;
    setCarregandoScreen(true);
    try {
      const res = await fetch(
        `/api/escritorio/orca?slug=${encodeURIComponent(cliente.slug)}&terminal=${encodeURIComponent(h)}&screen=1`,
        { cache: 'no-store' },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        screen?: { tail?: string[] } | null;
      };
      if (data?.screen?.tail) {
        setScreenTailLocal(data.screen.tail);
      }
    } catch {
      // ignore
    } finally {
      setCarregandoScreen(false);
    }
  }

  useEffect(() => {
    if (abaAtiva !== 'orca' || !terminalHandleAtivo) return;
    carregarScreenTerminal(terminalHandleAtivo);
    const t = setInterval(() => {
      carregarScreenTerminal(terminalHandleAtivo);
    }, 5000);
    return () => clearInterval(t);
  }, [abaAtiva, terminalHandleAtivo, cliente.slug]);

  async function handleEnviarPromptOrca(e?: React.FormEvent) {
    e?.preventDefault();
    const texto = promptOrca.trim();
    if (!texto || enviandoPromptOrca) return;
    setEnviandoPromptOrca(true);
    setFeedbackOrca(null);
    try {
      const res = await fetch('/api/escritorio/orca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'enviar_prompt',
          slug: cliente.slug,
          terminalHandle: terminalHandleAtivo,
          worktreePath: orcaInfo?.worktreePath,
          text: texto,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        queued?: boolean;
        message?: string;
        error?: string;
        screenTail?: string[];
      };
      if (data.ok) {
        setPromptOrca('');
        if (data.screenTail) {
          setScreenTailLocal(data.screenTail);
        }
        setFeedbackOrca(
          data.queued
            ? '⏳ Comando na fila para o Orca local executar...'
            : '✓ Prompt enviado para o agente no Orca!',
        );
        onRefreshOrca?.();
        setTimeout(() => {
          carregarScreenTerminal(terminalHandleAtivo);
          onRefreshOrca?.();
        }, 1800);
      } else {
        setFeedbackOrca(`⚠️ ${data.error || 'Falha ao enviar para o Orca'}`);
      }
    } catch {
      setFeedbackOrca('⚠️ Erro de conexão com a ponte Orca');
    } finally {
      setEnviandoPromptOrca(false);
    }
  }

  async function handleAcaoOrca(
    acao: 'iniciar_agente' | 'interromper' | 'focar_orca',
    agentType?: string,
  ) {
    setEnviandoPromptOrca(true);
    setFeedbackOrca(null);
    try {
      const res = await fetch('/api/escritorio/orca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao,
          slug: cliente.slug,
          terminalHandle: terminalHandleAtivo,
          worktreePath: orcaInfo?.worktreePath,
          agentType,
          text: promptOrca.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      setFeedbackOrca(
        data.ok
          ? `✓ ${data.message || 'Comando executado no Orca'}`
          : `⚠️ ${data.error || 'Falha ao executar comando'}`,
      );
      if (acao === 'iniciar_agente' && data.ok) {
        setPromptOrca('');
      }
      onRefreshOrca?.();
      setTimeout(() => {
        carregarScreenTerminal();
        onRefreshOrca?.();
      }, 2000);
    } catch {
      setFeedbackOrca('⚠️ Erro ao comunicar com o Orca');
    } finally {
      setEnviandoPromptOrca(false);
    }
  }

  // Canal de conversa exibido no drawer: null = grupo/conversa principal do projeto; ou dmSlug de um contato vinculado
  const [canalInterno, setCanalInterno] = useState<string | null>(canalSelecionado ?? null);

  // Formulário para vincular novo contato / DM ao projeto
  const [mostrarFormContato, setMostrarFormContato] = useState(false);
  const [novoContatoNome, setNovoContatoNome] = useState('');
  const [novoContatoPapel, setNovoContatoPapel] = useState('Cliente');
  const [novoContatoDmSlug, setNovoContatoDmSlug] = useState('');
  const [salvandoContato, setSalvandoContato] = useState(false);

  useEffect(() => {
    setCanalInterno(canalSelecionado ?? null);
  }, [canalSelecionado, cliente.slug]);

  function selecionarCanal(novo: string | null) {
    setCanalInterno(novo);
    onSelectCanal?.(novo);
  }

  // Encontra o contato vinculado correspondente ao canal ativo, se houver
  const contatoCanalAtivo: ContatoProjetoEscritorio | undefined = canalInterno
    ? cliente.contatosVinculados?.find(
        (ct) => ct.dmSlug === canalInterno || ct.dmSlugs.includes(canalInterno),
      )
    : undefined;

  const querySlugsAtivo = contatoCanalAtivo
    ? contatoCanalAtivo.dmSlugs.join(',')
    : (canalInterno ?? cliente.slug);

  const linkConversaAtiva = contatoCanalAtivo?.dmSlug ?? canalInterno ?? cliente.slug;

  useEffect(() => {
    setNota(notaInicial);
  }, [notaInicial, cliente.slug]);

  useEffect(() => {
    let cancelado = false;
    setCarregandoMsgs(true);

    async function load() {
      try {
        const res = await fetch(
          `/api/escritorio/mensagens?slug=${encodeURIComponent(querySlugsAtivo)}&limit=20`,
          {
            cache: 'no-store',
          },
        );
        if (!res.ok) return;
        const data = (await res.json()) as MensagemResumo[] | { messages?: MensagemResumo[] };
        const lista = Array.isArray(data)
          ? data
          : Array.isArray(data?.messages)
            ? data.messages
            : [];
        if (!cancelado) {
          setMensagens(lista.slice(-20));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelado) setCarregandoMsgs(false);
      }
    }

    load();
    const timer = setInterval(load, 6000);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, [querySlugsAtivo]);

  async function handleVincularContato(e: React.FormEvent) {
    e.preventDefault();
    const nomeLimpo = novoContatoNome.trim();
    if (!nomeLimpo) return;
    setSalvandoContato(true);
    try {
      await fetch('/api/escritorio/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: cliente.slug,
          acao: 'vincular_contato',
          contato: {
            nome: nomeLimpo,
            papel: novoContatoPapel.trim() || 'Contato',
            dmSlug: novoContatoDmSlug.trim() || null,
          },
        }),
      });
      setNovoContatoNome('');
      setNovoContatoDmSlug('');
      setMostrarFormContato(false);
      onRefreshEstado();
    } finally {
      setSalvandoContato(false);
    }
  }

  async function handleRemoverContato(nomeContato: string) {
    try {
      await fetch('/api/escritorio/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: cliente.slug,
          acao: 'remover_contato',
          contato: { nome: nomeContato },
        }),
      });
      onRefreshEstado();
    } catch {
      // ignore
    }
  }

  async function handleMarcarResolvido() {
    setMarcandoResolvido(true);
    try {
      await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolved',
          slug: cliente.slug,
          value: new Date().toISOString(),
        }),
      });
      onRefreshEstado();
    } finally {
      setMarcandoResolvido(false);
    }
  }

  async function handleSalvarNota() {
    setSalvandoNota(true);
    try {
      await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'note',
          slug: cliente.slug,
          value: nota,
        }),
      });
      onRefreshEstado();
    } finally {
      setSalvandoNota(false);
    }
  }

  const valorMensal = cliente.contrato.valorMensal;

  const ehUrgente = cliente.band === 'hot' || cliente.band === 'warm';

  return (
    <aside
      className="flex shrink-0 flex-col border-line bg-surface text-fg shadow-2xl max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-14 max-md:w-full max-md:rounded-t-2xl max-md:border-t md:relative md:h-full md:w-[420px] md:border-l"
      style={{ zIndex: 55 }}
    >
      {/* Topo com Sprite + Nome + Status */}
      <div className="flex items-start gap-3 border-b border-line bg-surface-2 px-4 py-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-[#161822]">
          <CharSprite charIndex={palette} size={36} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-[14.5px] font-bold leading-tight text-fg">
              {cliente.nome}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar painel lateral (Esc)"
              title="Fechar painel (Esc)"
              className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-dim transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ✕
            </button>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-fg-dim">
              {cliente.tipo === 'dm' ? 'DM' : 'Grupo'}
            </span>
            {cliente.aguardando ? (
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                  ehUrgente
                    ? 'border-danger/30 bg-danger-bg text-danger'
                    : 'border-warn-mark/40 bg-warn-bg text-warn'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    ehUrgente ? 'bg-red-500' : 'bg-amber-500'
                  }`}
                />
                Aguardando {cliente.waitingLabel ?? ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded border border-ok/30 bg-ok-bg px-1.5 py-0.5 text-[10px] font-bold text-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Em dia
              </span>
            )}
            {autonomo && (
              <span className="rounded border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-info">
                Autônomo
              </span>
            )}
            {presenca?.status === 'typing' && (
              <span className="inline-flex items-center gap-1 rounded border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-info">
                Digitando…
              </span>
            )}
            {presenca?.status === 'recording' && (
              <span className="inline-flex items-center gap-1 rounded border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-info">
                Gravando áudio…
              </span>
            )}
          </div>

          {cliente.repoNome && (
            <p className="mt-1 text-[11px] font-mono text-fg-dim">
              📦 repo: <strong className="text-fg">{cliente.repoNome}</strong>
              {cliente.github ? ` (${cliente.github})` : ''}
            </p>
          )}
          {seatLabel && <p className="mt-0.5 text-[11px] font-medium text-fg-dim">🪑 {seatLabel}</p>}
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2.5">
        {cliente.emDesenvolvimento && (
          <button
            type="button"
            onClick={onWalkTo}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[12px] font-semibold text-fg transition-colors hover:border-line-2"
            title="Caminhar com seu personagem até a mesa deste projeto"
          >
            <span>🚶</span>
            Ir até a mesa
          </button>
        )}

        <Link
          href={`/g/${encodeURIComponent(linkConversaAtiva)}`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-accent-ink transition-opacity hover:opacity-90"
        >
          {contatoCanalAtivo
            ? `Abrir DM: ${contatoCanalAtivo.nome.split(' ')[0]} →`
            : 'Abrir conversa →'}
        </Link>

        {cliente.aguardando && (
          <button
            type="button"
            disabled={marcandoResolvido}
            onClick={handleMarcarResolvido}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[11px] font-semibold text-fg hover:border-line-2 disabled:opacity-50"
            title="Marcar conversa como resolvida até agora"
          >
            ✓ Resolvido
          </button>
        )}

        {onToggleMesa && (
          <button
            type="button"
            disabled={alterandoMesa}
            onClick={async () => {
              setAlterandoMesa(true);
              try {
                await onToggleMesa(
                  cliente.slug,
                  cliente.emDesenvolvimento ? 'liberar_mesa' : 'ocupar_mesa',
                );
              } finally {
                setAlterandoMesa(false);
              }
            }}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
              cliente.emDesenvolvimento
                ? 'border-line bg-elevated text-fg-dim hover:border-danger/40 hover:bg-danger-bg hover:text-danger'
                : 'border-ok/40 bg-ok-bg text-ok hover:opacity-90'
            }`}
          >
            {cliente.emDesenvolvimento
              ? '🪑 Liberar mesa (Não estou desenvolvendo agora)'
              : '🪑 Colocar em uma mesa (Em desenvolvimento)'}
          </button>
        )}
      </div>

      {/* Seletor de Abas: WhatsApp & CRM vs Agente Orca (Remote / Local) */}
      <div
        role="tablist"
        aria-label="Abas do painel do cliente"
        className="grid grid-cols-2 gap-1.5 border-b border-line bg-surface-2 px-4 py-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={abaAtiva === 'whatsapp'}
          onClick={() => setAbaAtiva('whatsapp')}
          className={`flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            abaAtiva === 'whatsapp'
              ? 'border-accent bg-accent text-accent-ink shadow-sm'
              : 'border-line bg-surface text-fg-dim hover:bg-elevated hover:text-fg'
          }`}
        >
          <span aria-hidden="true">💬</span>
          <span>WhatsApp &amp; CRM</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={abaAtiva === 'orca'}
          onClick={() => setAbaAtiva('orca')}
          className={`flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            abaAtiva === 'orca'
              ? 'border-ok bg-ok-bg text-ok shadow-sm'
              : 'border-line bg-surface text-fg-dim hover:bg-elevated hover:text-fg'
          }`}
        >
          <span aria-hidden="true">🐋</span>
          <span>Agente Orca</span>
          {orcaInfo ? (
            orcaInfo.status === 'working' ? (
              <span className="inline-flex items-center gap-1 rounded border border-ok/30 bg-ok-bg px-1.5 py-0.2 text-[9px] font-bold text-ok">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Codando
              </span>
            ) : orcaInfo.status === 'monitoring' ? (
              <span className="inline-flex items-center gap-1 rounded border border-accent-line bg-accent-soft px-1.5 py-0.2 text-[9px] font-bold text-info">
                👁️ Plantão
              </span>
            ) : orcaInfo.liveTerminalCount > 0 ? (
              <span className="rounded border border-ok/30 bg-ok-bg px-1.5 py-0.2 font-mono text-[9px] font-semibold text-ok">
                {orcaInfo.liveTerminalCount} term
              </span>
            ) : (
              <span className="rounded border border-line bg-elevated px-1.5 py-0.2 text-[9px] font-medium text-fg-dim">
                Pronto
              </span>
            )
          ) : (
            <span className="rounded border border-line bg-elevated px-1.5 py-0.2 text-[9px] font-medium text-fg-dim">
              {orcaAvailable ? 'Sem repo' : 'Offline'}
            </span>
          )}
        </button>
      </div>

      {abaAtiva === 'orca' ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {/* Cabeçalho do Worktree Orca */}
            {orcaInfo ? (
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px]">🐋</span>
                      <span className="truncate text-[12.5px] font-bold text-fg">
                        {orcaInfo.repoLabel}
                      </span>
                      <span className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-fg-dim">
                        🌿 {orcaInfo.branch}
                      </span>
                    </div>
                    <p
                      className="mt-1 truncate font-mono text-[10.5px] text-fg-dim"
                      title={orcaInfo.worktreePath}
                    >
                      {orcaInfo.worktreePath}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {terminalHandleAtivo && (
                      <button
                        type="button"
                        onClick={() => handleAcaoOrca('focar_orca')}
                        title="Focar este terminal no app Orca"
                        className="rounded border border-line bg-surface px-2 py-1 text-[10px] font-semibold text-fg hover:border-accent"
                      >
                        ↗ App Orca
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onRefreshOrca?.();
                        carregarScreenTerminal();
                      }}
                      title="Atualizar estado e tela do agente"
                      className="rounded border border-line bg-surface px-2 py-1 text-[10px] font-semibold text-fg hover:border-line-2"
                    >
                      {carregandoScreen ? '⏳' : '🔄'}
                    </button>
                  </div>
                </div>

                {/* Seletor de sessão/terminal quando há mais de 1 agente aberto no projeto */}
                {agentesOrca.length > 1 && (
                  <div className="mt-2.5 flex flex-wrap gap-1 border-t border-line pt-2">
                    {agentesOrca.map((ag, idx) => {
                      const ativo = idx === indiceAgenteOrca;
                      return (
                        <button
                          key={ag.paneKey}
                          type="button"
                          onClick={() => {
                            setIndiceAgenteOrca(idx);
                            setScreenTailLocal(null);
                          }}
                          className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold transition-colors ${
                            ativo
                              ? 'border-ok bg-ok-bg text-ok'
                              : 'border-line bg-surface text-fg-dim hover:text-fg'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              ag.state === 'working'
                                ? 'animate-pulse bg-emerald-500'
                                : ag.workingMode === 'monitoring'
                                  ? 'bg-blue-500'
                                  : 'bg-zinc-400'
                            }`}
                          />
                          <span className="uppercase">{ag.agentType}</span>
                          <span className="font-mono text-[9px] opacity-80">#{idx + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Barra de controles do terminal ativo */}
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-line pt-2 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    {agenteSelecionado ? (
                      <>
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-bold uppercase ${
                            agenteSelecionado.state === 'working'
                              ? 'border-ok/30 bg-ok-bg text-ok'
                              : agenteSelecionado.workingMode === 'monitoring'
                                ? 'border-accent-line bg-accent-soft text-info'
                                : 'border-line bg-surface text-fg-dim'
                          }`}
                        >
                          🤖 {agenteSelecionado.agentType} ·{' '}
                          {agenteSelecionado.state === 'working'
                            ? 'Trabalhando'
                            : agenteSelecionado.workingMode === 'monitoring'
                              ? 'Plantão'
                              : 'Aguardando prompt'}
                        </span>
                        {agenteSelecionado.toolName && (
                          <span className="rounded border border-warn-mark/40 bg-warn-bg px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-warn">
                            ⚙️ {agenteSelecionado.toolName}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="font-medium text-fg-dim">
                        Nenhum terminal de agente aberto
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {agenteSelecionado?.state === 'working' && (
                      <button
                        type="button"
                        onClick={() => handleAcaoOrca('interromper')}
                        className="rounded border border-danger/40 bg-danger-bg px-2 py-0.5 text-[10px] font-semibold text-danger hover:opacity-90"
                      >
                        ⏹ Parar
                      </button>
                    )}
                    {terminalHandleAtivo && (
                      <button
                        type="button"
                        onClick={() => setMostrarTerminalOrca((v) => !v)}
                        className={`rounded border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                          mostrarTerminalOrca
                            ? 'border-ok bg-ok-bg text-ok'
                            : 'border-line bg-surface text-fg-dim hover:text-fg'
                        }`}
                      >
                        🖥️ {mostrarTerminalOrca ? 'Ver Chat' : 'Ver Terminal TUI'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-line bg-surface-2 p-4 text-center text-[12px] text-fg-dim">
                <p className="font-semibold text-fg">
                  🐋 Nenhum worktree Orca vinculado a &ldquo;{cliente.nome}&rdquo;
                </p>
                <p className="mt-1 text-[11px] text-fg-dim">
                  {orcaAvailable
                    ? 'Vincule um repositório local no Orca para conversar com o agente deste projeto diretamente daqui.'
                    : 'O Orca Desktop local não está acessível neste momento.'}
                </p>
              </div>
            )}

            {/* Caso o projeto tenha worktree mas nenhum terminal aberto: botões de Launch */}
            {orcaInfo && orcaInfo.liveTerminalCount === 0 && (
              <div className="rounded-lg border border-ok/30 bg-ok-bg p-3">
                <div className="text-[11px] font-bold text-ok">
                  🚀 Iniciar novo agente neste projeto
                </div>
                <p className="mt-0.5 text-[11px] text-fg-dim">
                  Escolha qual agente abrir no worktree <strong>{orcaInfo.repoLabel}</strong> (ou
                  digite o prompt abaixo primeiro):
                </p>
                <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    disabled={enviandoPromptOrca}
                    onClick={() => handleAcaoOrca('iniciar_agente', 'claude')}
                    className="rounded border border-line bg-surface px-2 py-1.5 text-[11px] font-semibold text-fg hover:border-ok hover:bg-elevated disabled:opacity-50"
                  >
                    🤖 Claude
                  </button>
                  <button
                    type="button"
                    disabled={enviandoPromptOrca}
                    onClick={() => handleAcaoOrca('iniciar_agente', 'codex')}
                    className="rounded border border-line bg-surface px-2 py-1.5 text-[11px] font-semibold text-fg hover:border-ok hover:bg-elevated disabled:opacity-50"
                  >
                    ⚡ Codex
                  </button>
                  <button
                    type="button"
                    disabled={enviandoPromptOrca}
                    onClick={() => handleAcaoOrca('iniciar_agente', 'antigravity')}
                    className="rounded border border-line bg-surface px-2 py-1.5 text-[11px] font-semibold text-fg hover:border-ok hover:bg-elevated disabled:opacity-50"
                  >
                    🌌 Antigravity
                  </button>
                </div>
              </div>
            )}

            {/* Conversa estruturada do Agente Orca OU Tela TUI ao vivo */}
            {agenteSelecionado && (
              <div className="space-y-2.5">
                {!mostrarTerminalOrca ? (
                  <>
                    {/* Último comando do operador */}
                    {agenteSelecionado.prompt && (
                      <div className="ml-4 rounded-lg border border-accent-line bg-accent-soft p-3 text-[12px] text-fg">
                        <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-info">
                          <span>👤 Seu último comando no Orca</span>
                          <span className="font-mono opacity-80">Prompt</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words leading-relaxed text-fg">
                          {agenteSelecionado.prompt}
                        </p>
                      </div>
                    )}

                    {/* Subagentes em paralelo, se houver */}
                    {agenteSelecionado.subagents.length > 0 && (
                      <div className="rounded-lg border border-line-2 bg-surface-2 p-2.5 text-[11px]">
                        <div className="font-semibold text-fg">
                          🛸 Subagentes ativos ({agenteSelecionado.subagents.length})
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {agenteSelecionado.subagents.map((sub) => (
                            <span
                              key={sub.id}
                              className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-medium text-fg-dim"
                            >
                              {sub.agentType || 'subagent'} · {sub.state}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Última resposta do Assistente no Orca */}
                    {agenteSelecionado.lastAssistantMessage ? (
                      <div className="mr-2 rounded-lg border border-line-2 bg-surface-2 p-3 text-[12px] text-fg">
                        <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-ok">
                          <span className="uppercase">
                            🤖 {agenteSelecionado.agentType} ({orcaInfo?.repoLabel})
                          </span>
                          <span className="font-mono font-medium text-fg-dim">
                            {agenteSelecionado.state === 'working'
                              ? '⚡ Gerando / Codando…'
                              : 'Última resposta'}
                          </span>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-fg">
                          {agenteSelecionado.lastAssistantMessage}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-line bg-surface-2 p-3 text-[11px] font-medium text-fg-dim">
                        Sem mensagem estruturada recente — exibindo saída do terminal abaixo:
                      </div>
                    )}
                  </>
                ) : null}

                {/* Tela do Terminal (TUI) ao vivo — exibida quando o toggle está ativo ou quando não há lastAssistantMessage */}
                {(mostrarTerminalOrca || !agenteSelecionado.lastAssistantMessage) && (
                  <div className="rounded-lg border border-line bg-[#0b0e14] p-2.5">
                    <div className="mb-1.5 flex items-center justify-between border-b border-white/10 pb-1.5 text-[10px] text-zinc-400">
                      <span className="font-mono">
                        🖥️ {agenteSelecionado.terminalTitle || agenteSelecionado.paneKey} (
                        {agenteSelecionado.terminalHandle || 'sem-pty'})
                      </span>
                      <button
                        type="button"
                        onClick={() => carregarScreenTerminal()}
                        className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-zinc-200 hover:bg-white/20"
                      >
                        Atualizar TUI
                      </button>
                    </div>
                    <pre className="max-h-[320px] overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10.5px] leading-[1.45] text-emerald-300/90">
                      {(
                        screenTailLocal ??
                        agenteSelecionado.screenTail ?? [
                          'Carregando tela do terminal no Orca...',
                        ]
                      )
                        .slice(-38)
                        .join('\n')}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Sub-worktrees / branches filhos abertos no Orca */}
            {orcaInfo && orcaInfo.childWorktrees.length > 0 && (
              <div className="rounded-lg border border-line bg-surface-2 p-3">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-fg-dim">
                  🌿 Worktrees Paralelos no Orca ({orcaInfo.childWorktrees.length})
                </div>
                <div className="mt-2 space-y-1.5">
                  {orcaInfo.childWorktrees.map((cw) => (
                    <div
                      key={cw.worktreeId}
                      className="rounded border border-line bg-surface px-2.5 py-1.5 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold text-fg">{cw.displayName}</span>
                        <span className="shrink-0 rounded bg-elevated px-1.5 py-0.2 font-mono text-[9.5px] font-medium text-fg-dim">
                          {cw.branch} · {cw.status}
                        </span>
                      </div>
                      {cw.lastAssistantMessage && (
                        <p className="mt-1 line-clamp-2 text-[10.5px] text-fg-dim">
                          {cw.lastAssistantMessage}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Composer fixo na base da aba Orca para enviar comando direto ao agente */}
          {orcaInfo && (
            <form
              onSubmit={handleEnviarPromptOrca}
              className="border-t border-line bg-surface-2 px-4 py-3"
            >
              <div className="mb-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setPromptOrca(
                      `Leia as últimas mensagens do grupo ${cliente.slug} via MCP whatsapp-collector e me diga o que o cliente pediu e o que precisamos fazer.`,
                    )
                  }
                  className="rounded border border-line bg-surface px-2 py-0.5 text-[10px] font-medium text-fg-dim hover:border-ok hover:text-fg"
                >
                  🔍 Checar grupo WPP
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPromptOrca('Qual o status atual desta tarefa e o que falta implementar?')
                  }
                  className="rounded border border-line bg-surface px-2 py-0.5 text-[10px] font-medium text-fg-dim hover:border-ok hover:text-fg"
                >
                  📋 O que falta?
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPromptOrca('Rode o build e os testes para garantir que está tudo passando.')
                  }
                  className="rounded border border-line bg-surface px-2 py-0.5 text-[10px] font-medium text-fg-dim hover:border-ok hover:text-fg"
                >
                  🧪 Rodar testes e build
                </button>
              </div>

              {feedbackOrca && (
                <div className="mb-2 rounded border border-ok/40 bg-ok-bg px-2.5 py-1 text-[11px] font-semibold text-ok">
                  {feedbackOrca}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <textarea
                  value={promptOrca}
                  onChange={(e) => setPromptOrca(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleEnviarPromptOrca();
                    }
                  }}
                  rows={2}
                  placeholder={
                    terminalHandleAtivo
                      ? `Mandar comando para ${agenteSelecionado?.agentType || 'o agente'} em ${orcaInfo.repoLabel}... (⌘+Enter envia)`
                      : `Digite o prompt para iniciar um agente em ${orcaInfo.repoLabel}...`
                  }
                  className="w-full resize-none rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-medium text-fg-dim">
                    {terminalHandleAtivo
                      ? `Terminal: ${terminalHandleAtivo.slice(0, 13)}…`
                      : 'Abre novo terminal Claude no Orca'}
                  </span>
                  <button
                    type="submit"
                    disabled={enviandoPromptOrca || !promptOrca.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {enviandoPromptOrca ? 'Enviando…' : '🐋 Enviar pro Agente ↵'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      ) : (
      /* Corpo rolável: Aba WhatsApp & CRM */
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {/* Contatos do Projeto & Conversas Fora do Grupo (DMs Monitoradas) */}
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-dim">
              👥 Contatos &amp; Chats ({cliente.contatosVinculados?.length ?? 0})
            </span>
            <button
              type="button"
              onClick={() => setMostrarFormContato((v) => !v)}
              className="rounded border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold text-fg-dim hover:text-fg"
            >
              {mostrarFormContato ? 'Cancelar' : '+ Vincular'}
            </button>
          </div>

          {mostrarFormContato && (
            <form
              onSubmit={handleVincularContato}
              className="mt-2.5 space-y-2 rounded-md border border-line bg-surface p-2.5"
            >
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={novoContatoNome}
                  onChange={(e) => setNovoContatoNome(e.target.value)}
                  placeholder="Nome (ex: Ana, Bruno)"
                  required
                  className="rounded border border-line bg-elevated px-2 py-1 text-[11px] text-fg placeholder:text-fg-faint focus:outline-none"
                />
                <input
                  type="text"
                  value={novoContatoPapel}
                  onChange={(e) => setNovoContatoPapel(e.target.value)}
                  placeholder="Papel (ex: Cliente)"
                  className="rounded border border-line bg-elevated px-2 py-1 text-[11px] text-fg placeholder:text-fg-faint focus:outline-none"
                />
              </div>
              <select
                value={novoContatoDmSlug}
                onChange={(e) => {
                  const val = e.target.value;
                  setNovoContatoDmSlug(val);
                  if (val && !novoContatoNome.trim()) {
                    const found = dmsDisponiveis.find((d) => d.slug === val);
                    if (found) setNovoContatoNome(found.nome);
                  }
                }}
                className="w-full rounded border border-line bg-elevated px-2 py-1 text-[11px] text-fg focus:outline-none"
              >
                <option value="">Sem DM vinculada (apenas contato do grupo)</option>
                {dmsDisponiveis.map((dm) => (
                  <option key={dm.slug} value={dm.slug}>
                    💬 {dm.nome} ({dm.slug}) · {dm.mensagens}m
                    {dm.atividadeLabel ? ` · ${dm.atividadeLabel}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={salvandoContato}
                className="w-full rounded bg-accent py-1 text-[11px] font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
              >
                {salvandoContato ? 'Vinculando…' : 'Salvar vínculo no projeto'}
              </button>
            </form>
          )}

          {/* Aba do Grupo Principal */}
          <div className="mt-2.5 space-y-1.5">
            {cliente.tipo === 'grupo' && (
              <div
                onClick={() => selecionarCanal(null)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors ${
                  canalInterno === null
                    ? 'border-accent bg-selected font-semibold text-fg'
                    : 'border-line bg-surface text-fg-dim hover:bg-elevated hover:text-fg'
                }`}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span>👥</span>
                  <span className="truncate font-semibold">Grupo: {cliente.nome}</span>
                </div>
                <span className="shrink-0 font-mono text-[10px] font-medium text-fg-dim">
                  {cliente.atividadeLabel ?? `${cliente.mensagens}m`}
                </span>
              </div>
            )}

            {(cliente.contatosVinculados ?? []).map((ct) => {
              const temDm = Boolean(ct.dmSlug);
              const selecionado =
                temDm &&
                canalInterno !== null &&
                (ct.dmSlug === canalInterno || ct.dmSlugs.includes(canalInterno));
              const dmUrgente = ct.aguardando && (ct.band === 'hot' || ct.band === 'warm');

              return (
                <div
                  key={ct.id}
                  onClick={() => {
                    if (temDm && ct.dmSlug) {
                      selecionarCanal(selecionado ? null : ct.dmSlug);
                    }
                  }}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] transition-colors ${
                    temDm ? 'cursor-pointer' : ''
                  } ${
                    selecionado
                      ? 'border-accent bg-selected text-fg'
                      : ct.aguardando
                        ? 'border-warn-mark/40 bg-warn-bg text-fg'
                        : 'border-line bg-surface text-fg-dim hover:bg-elevated hover:text-fg'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span>{temDm ? '💬' : '👤'}</span>
                      <span className="truncate font-semibold text-fg">{ct.nome}</span>
                      {ct.papel && (
                        <span className="shrink-0 rounded border border-line bg-elevated px-1.5 py-0.2 text-[9.5px] font-medium text-fg-dim">
                          {ct.papel}
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {ct.aguardando ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9.5px] font-bold ${
                            dmUrgente
                              ? 'border-danger/30 bg-danger-bg text-danger'
                              : 'border-warn-mark/40 bg-warn-bg text-warn'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              dmUrgente ? 'bg-red-500' : 'bg-amber-500'
                            }`}
                          />
                          {ct.waitingLabel ?? 'Aguardando'}
                        </span>
                      ) : temDm ? (
                        <span className="font-mono text-[10px] font-medium text-fg-dim">
                          {ct.atividadeLabel ? `DM · ${ct.atividadeLabel}` : `DM · ${ct.mensagensDm}m`}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-fg-dim">No grupo</span>
                      )}

                      {temDm && ct.dmSlug && (
                        <Link
                          href={`/g/${encodeURIComponent(ct.dmSlug)}`}
                          onClick={(e) => e.stopPropagation()}
                          title={`Abrir chat individual de ${ct.nome}`}
                          className="rounded border border-line bg-elevated px-1.5 py-0.5 text-[10px] font-semibold text-fg-dim hover:border-accent hover:text-fg"
                        >
                          ↗
                        </Link>
                      )}

                      {ct.custom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoverContato(ct.nome);
                          }}
                          title="Remover vínculo"
                          className="rounded px-1 text-[10px] text-fg-dim hover:text-danger"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {temDm && ct.ultimaPreview && (
                    <p className="mt-1 truncate pl-5 text-[10.5px] text-fg-dim">
                      {ct.ultimaPreview}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Resumo de contrato / uso 30d */}
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-fg-dim">
            <span>Contrato &amp; Uso (30d)</span>
            {valorMensal != null && (
              <span className="font-mono text-[12px] font-bold text-fg">
                {BRL.format(valorMensal)}/mês
              </span>
            )}
          </div>

          <div className="mt-2.5">
            <MedidorUso valor={cliente.msgsCliente30d} limite={cliente.limite} compacto />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-fg-dim">
            <span>
              Total histórico: <strong className="font-mono text-fg">{cliente.mensagens}</strong>{' '}
              msgs
            </span>
            <span>
              Entregas (30d):{' '}
              <strong className="font-mono text-fg">{cliente.entregas30d}</strong> (
              {cliente.entregasTotal} total)
            </span>
          </div>

          {cliente.etiquetas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
              {cliente.etiquetas.map((et) => (
                <span
                  key={et}
                  className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-fg-dim"
                >
                  {et}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Sinais do dia se houver */}
        {cliente.sinais.length > 0 && (
          <div className="rounded-lg border border-warn-mark/40 bg-warn-bg p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-warn">
              Sinais de Atenção ({cliente.sinais.length})
            </div>
            <ul className="mt-1.5 space-y-1 text-[12px] font-medium text-fg">
              {cliente.sinais.map((s) => (
                <li key={s} className="leading-snug">
                  • {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Notas rápidas do cliente */}
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-fg-dim">
            <span>Nota interna (CRM)</span>
            {nota !== notaInicial && (
              <button
                type="button"
                disabled={salvandoNota}
                onClick={handleSalvarNota}
                className="rounded bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
              >
                {salvandoNota ? 'Salvando…' : 'Salvar'}
              </button>
            )}
          </div>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder="Anotações sobre contrato, combinado ou pendência..."
            className="mt-1.5 w-full resize-none rounded border border-line bg-surface px-2 py-1.5 text-[12px] text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
          />
        </div>

        {/* Últimas mensagens do WhatsApp */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-bold uppercase tracking-wider text-fg-dim">
              {contatoCanalAtivo
                ? `💬 Mensagens DM: ${contatoCanalAtivo.nome}`
                : '👥 Últimas mensagens no Grupo'}
            </span>
            {contatoCanalAtivo ? (
              <button
                type="button"
                onClick={() => selecionarCanal(null)}
                className="shrink-0 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-fg-dim hover:text-fg"
              >
                ← Voltar ao grupo
              </button>
            ) : (
              <span className="shrink-0 font-mono text-[10px] font-medium text-fg-dim">
                Somente leitura
              </span>
            )}
          </div>

          {carregandoMsgs ? (
            <div className="rounded-lg border border-line bg-surface-2 p-4 text-center text-[12px] font-medium text-fg-dim">
              Carregando histórico…
            </div>
          ) : mensagens.length === 0 ? (
            <div className="rounded-lg border border-line bg-surface-2 p-4 text-center text-[12px] font-medium text-fg-dim">
              Nenhuma mensagem recente.
            </div>
          ) : (
            <div className="space-y-2">
              {mensagens.map((m) => {
                const ehMinha = Boolean(m.fromMe);
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg border px-3 py-2 text-[12px] ${
                      ehMinha
                        ? 'ml-4 border-accent-line bg-accent-soft text-fg'
                        : 'mr-4 border-line bg-surface-2 text-fg'
                    }`}
                  >
                    <div className="mb-0.5 flex items-center justify-between gap-2 text-[10.5px] text-fg-dim">
                      <span className="truncate font-bold text-fg">
                        {ehMinha ? 'Você' : m.senderName || 'Cliente'}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {!ehMinha && m.text && orcaInfo && (
                          <button
                            type="button"
                            onClick={() => {
                              setPromptOrca(
                                `Mensagem de ${m.senderName || cliente.nome} no WhatsApp (${cliente.slug}): "${m.text}"\n\nAnalise o que foi pedido e implemente ou prepare a solução.`,
                              );
                              setAbaAtiva('orca');
                            }}
                            title="Encaminhar esta mensagem do cliente para o Agente no Orca"
                            className="rounded border border-ok/40 bg-ok-bg px-1.5 py-0.5 text-[9.5px] font-bold text-ok hover:opacity-90"
                          >
                            🐋 Mandar pro Agente
                          </button>
                        )}
                        <span className="font-mono font-medium">{instanteLongo(m.timestamp)}</span>
                      </div>
                    </div>
                    {m.quotedText && (
                      <div className="mb-1 truncate border-l-2 border-line-2 pl-2 text-[11px] italic text-fg-dim">
                        {m.quotedText}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words leading-relaxed text-fg">
                      {m.type !== 'text' && !m.text
                        ? `[${m.type}]`
                        : m.type !== 'text'
                          ? `[${m.type}] ${m.text}`
                          : m.text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}
    </aside>
  );
}
