'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClienteEscritorio, DmDisponivelEscritorio } from '@/lib/escritorio-estado';
import type { PresenceView } from '@/lib/presence';
import { AgentLabels, type AgentLabelMeta } from './components/AgentLabels';
import { AreaLabelsOverlay } from './components/AreaLabelsOverlay';
import { CenaLoaderEscritorio } from './components/CenaLoaderEscritorio';
import { CharSprite } from './components/CharSprite';
import { OrganogramaClientesView } from './components/OrganogramaClientesView';
import { PainelClienteEscritorio } from './components/PainelClienteEscritorio';
import { ZoomControls } from './components/ZoomControls';
import { PALETTE_COUNT } from './constants';
import { useEditorActions } from './hooks/useEditorActions';
import { useEditorKeyboard } from './hooks/useEditorKeyboard';
import { useLeaderKeyboard } from './hooks/useLeaderKeyboard';
import { useOfficeAssets } from './hooks/useOfficeAssets';
import { isSoundEnabled, playDoneSound, setSoundEnabled } from './notificationSound';
import { OfficeCanvas } from './office/components/OfficeCanvas';
import { type SubagentCharacter, ToolOverlay } from './office/components/ToolOverlay';
import { EditorState } from './office/editor/editorState';
import { EditorToolbar } from './office/editor/EditorToolbar';
import { OfficeState } from './office/engine/officeState';
import { getCatalogEntry } from './office/layout/furnitureCatalog';
import { CharacterState, EditTool, TILE_SIZE, type ToolActivity } from './office/types';

interface EscritorioViewProps {
  clientesIniciais: ClienteEscritorio[];
  presencasIniciais: Record<string, PresenceView>;
  autonomoInicial: Record<string, boolean>;
  notasIniciais: Record<string, string>;
}

type AbaEscritorio = 'mapa' | 'organograma';
type FiltroEscopo = 'em_dev' | 'todos';
type FiltroStatus = 'todos' | 'urgentes' | 'aguardando' | 'em_dia';

const TOTAL_MESAS_ESCRITORIO = 28;

function hashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function paletteForSlug(slug: string): number {
  return hashSlug(slug) % PALETTE_COUNT;
}

const emptySubagents: SubagentCharacter[] = [];

export function EscritorioView({
  clientesIniciais,
  presencasIniciais,
  autonomoInicial,
  notasIniciais,
}: EscritorioViewProps) {
  const [clientes, setClientes] = useState<ClienteEscritorio[]>(clientesIniciais);
  const [presencas, setPresencas] = useState<Record<string, PresenceView>>(presencasIniciais);
  const [autonomo, setAutonomo] = useState<Record<string, boolean>>(autonomoInicial);
  const [notas, setNotas] = useState<Record<string, string>>(notasIniciais);
  const [dmsDisponiveis, setDmsDisponiveis] = useState<DmDisponivelEscritorio[]>([]);

  const [aba, setAba] = useState<AbaEscritorio>('mapa');
  const [escopo, setEscopo] = useState<FiltroEscopo>('em_dev');
  const [statusFiltro, setStatusFiltro] = useState<FiltroStatus>('todos');
  const [busca, setBusca] = useState('');
  const [mostrarAreas, setMostrarAreas] = useState(true);
  const [mostrarRoster, setMostrarRoster] = useState(true);
  const [mostrarPausados, setMostrarPausados] = useState(false);
  const [somAtivo, setSomAtivo] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [canalDrawerSelecionado, setCanalDrawerSelecionado] = useState<string | null>(null);
  const [expandedProjetos, setExpandedProjetos] = useState<Record<string, boolean>>({});
  const [expandirTodosContatos, setExpandirTodosContatos] = useState(false);

  // Em telas mobile (<768px), inicia com a lista lateral recolhida para não esmagar o mapa
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMostrarRoster(false);
    }
  }, []);

  const officeStateRef = useRef<OfficeState | null>(null);
  const editorStateRef = useRef<EditorState | null>(null);
  const getOfficeState = useCallback(() => {
    if (!officeStateRef.current) {
      officeStateRef.current = new OfficeState();
    }
    return officeStateRef.current;
  }, []);
  const getEditorState = useCallback(() => {
    if (!editorStateRef.current) {
      editorStateRef.current = new EditorState();
    }
    return editorStateRef.current;
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditorActions(getOfficeState, getEditorState());

  const { layoutReady, loadingProgress, loadingStep, loadedAssets, reloadLayout } = useOfficeAssets(
    getOfficeState,
    editor.setLastSavedLayout,
  );

  useEditorKeyboard(
    editor.isEditMode,
    getEditorState(),
    editor.handleDeleteSelected,
    editor.handleRotateSelected,
    editor.handleToggleState,
    editor.handleUndo,
    editor.handleRedo,
    editor.handleEditorSelectionChange,
    editor.handleToggleEditMode,
  );

  useLeaderKeyboard(getOfficeState, !editor.isEditMode && aba === 'mapa');

  // Atualização periódica do estado real dos clientes
  const refreshEstado = useCallback(async () => {
    try {
      const res = await fetch('/api/escritorio/estado', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        clientes?: ClienteEscritorio[];
        presencas?: Record<string, PresenceView>;
        autonomo?: Record<string, boolean>;
        notas?: Record<string, string>;
        dmsDisponiveis?: DmDisponivelEscritorio[];
      };
      if (Array.isArray(data.clientes)) setClientes(data.clientes);
      if (data.presencas) setPresencas(data.presencas);
      if (data.autonomo) setAutonomo(data.autonomo);
      if (data.notas) setNotas(data.notas);
      if (Array.isArray(data.dmsDisponiveis)) setDmsDisponiveis(data.dmsDisponiveis);
    } catch {
      // mantém último estado
    }
  }, []);

  const handleToggleMesa = useCallback(
    async (slug: string, acao: 'ocupar_mesa' | 'liberar_mesa') => {
      try {
        const res = await fetch('/api/escritorio/estado', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, acao }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          clientes?: ClienteEscritorio[];
          presencas?: Record<string, PresenceView>;
          autonomo?: Record<string, boolean>;
          notas?: Record<string, string>;
          dmsDisponiveis?: DmDisponivelEscritorio[];
        };
        if (Array.isArray(data.clientes)) setClientes(data.clientes);
        if (data.presencas) setPresencas(data.presencas);
        if (data.autonomo) setAutonomo(data.autonomo);
        if (data.notas) setNotas(data.notas);
        if (Array.isArray(data.dmsDisponiveis)) setDmsDisponiveis(data.dmsDisponiveis);
      } catch {
        // ignore
      }
    },
    [],
  );

  useEffect(() => {
    // Se a página abriu com cache frio (0 clientes iniciais) ou sem lista de DMs, busca imediatamente
    if (clientesIniciais.length === 0 || dmsDisponiveis.length === 0) {
      void refreshEstado();
    }
    const timer = setInterval(refreshEstado, 8000);
    return () => clearInterval(timer);
  }, [clientesIniciais.length, dmsDisponiveis.length, refreshEstado]);

  // Mapeia cada slug para um ID numérico estável na sessão
  const slugToIdRef = useRef<Map<string, number>>(new Map());
  const nextIdRef = useRef<number>(1);

  const getIdForSlug = useCallback((slug: string): number => {
    const existing = slugToIdRef.current.get(slug);
    if (existing !== undefined) return existing;
    const id = nextIdRef.current++;
    slugToIdRef.current.set(slug, id);
    return id;
  }, []);

  // Filtra e ordena clientes visíveis nas mesas do escritório
  const clientesVisiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return clientes
      .filter((c) => {
        if (escopo === 'em_dev' && !c.emDesenvolvimento) return false;
        if (
          statusFiltro === 'urgentes' &&
          !(c.aguardando && (c.band === 'hot' || c.band === 'warm'))
        ) {
          return false;
        }
        if (statusFiltro === 'aguardando' && !c.aguardando && !(c.dmsAguardando > 0)) return false;
        if (statusFiltro === 'em_dia' && c.aguardando) return false;
        if (q) {
          const matchNome =
            c.nome.toLowerCase().includes(q) ||
            c.slug.toLowerCase().includes(q) ||
            (c.repoNome ?? '').toLowerCase().includes(q);
          const matchTag = c.etiquetas.some((e) => e.toLowerCase().includes(q));
          const matchContato = (c.contatosVinculados ?? []).some(
            (ct) =>
              ct.nome.toLowerCase().includes(q) ||
              (ct.papel ?? '').toLowerCase().includes(q) ||
              (ct.dmSlug ?? '').toLowerCase().includes(q),
          );
          if (!matchNome && !matchTag && !matchContato) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Urgentes primeiro, depois aguardando por tempo, depois uso 30d
        if (a.aguardando !== b.aguardando) return a.aguardando ? -1 : 1;
        if (a.aguardando && b.aguardando) {
          return b.waitingMs - a.waitingMs;
        }
        if ((a.dmsAguardando ?? 0) !== (b.dmsAguardando ?? 0)) {
          return (b.dmsAguardando ?? 0) - (a.dmsAguardando ?? 0);
        }
        return b.msgsCliente30d - a.msgsCliente30d || a.nome.localeCompare(b.nome);
      });
  }, [clientes, escopo, statusFiltro, busca]);

  // Projetos fora de desenvolvimento ativo (mesas ficam vazias)
  const clientesPausados = useMemo(
    () =>
      clientes
        .filter((c) => !c.emDesenvolvimento)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [clientes],
  );

  // Controle de som quando um cliente novo entra em aguardando
  const prevAguardandoSlugsRef = useRef<Set<string>>(
    new Set(clientesIniciais.filter((c) => c.aguardando).map((c) => c.slug)),
  );

  useEffect(() => {
    const currentSet = new Set(clientes.filter((c) => c.aguardando).map((c) => c.slug));
    let novoAguardando = false;
    for (const slug of currentSet) {
      if (!prevAguardandoSlugsRef.current.has(slug)) {
        novoAguardando = true;
        break;
      }
    }
    prevAguardandoSlugsRef.current = currentSet;
    if (novoAguardando && isSoundEnabled()) {
      playDoneSound();
    }
  }, [clientes]);

  // Sincroniza clientesVisiveis com os personagens do OfficeState
  const { activeAgentIds, agentMeta, agentTools, idToCliente } = useMemo(() => {
    const ids: number[] = [];
    const meta: Record<number, AgentLabelMeta> = {};
    const tools: Record<number, ToolActivity[]> = {};
    const byId = new Map<
      number,
      { cliente: ClienteEscritorio; palette: number; baiaIndex: number }
    >();

    clientesVisiveis.forEach((c, idx) => {
      const id = getIdForSlug(c.slug);
      const palette = paletteForSlug(c.slug);
      const baiaIndex = idx + 1;
      ids.push(id);
      byId.set(id, { cliente: c, palette, baiaIndex });

      const pres = presencas[c.slug];
      const isTyping = pres?.status === 'typing' || pres?.status === 'recording';
      const isDanger = c.aguardando && (c.band === 'hot' || c.band === 'warm');
      const isWarn = c.aguardando && !isDanger;

      let dotColor = '#22c55e'; // em dia = verde
      let pulse = false;
      if (isTyping) {
        dotColor = '#3b82f6';
        pulse = true;
      } else if (isDanger) {
        dotColor = '#ef4444';
        pulse = true;
      } else if (isWarn || c.aguardando) {
        dotColor = '#f59e0b';
      }

      meta[id] = {
        nome: c.nome,
        subLabel: c.aguardando && c.waitingLabel ? c.waitingLabel : undefined,
        dotColor,
        pulse,
        urgente: isDanger,
      };

      if (isTyping) {
        tools[id] = [
          {
            toolId: `pres-${c.slug}`,
            status: pres?.status === 'recording' ? 'Gravando áudio…' : 'Digitando no WhatsApp…',
            done: false,
          },
        ];
      } else if (c.aguardando) {
        const preview = c.ultimaPreview ?? 'Aguardando resposta';
        const resumo = preview.length > 44 ? `${preview.slice(0, 44)}…` : preview;
        tools[id] = [
          {
            toolId: `wait-${c.slug}`,
            status: resumo,
            done: false,
            permissionWait: isDanger,
          },
        ];
      } else {
        tools[id] = [
          {
            toolId: `ok-${c.slug}`,
            status:
              c.msgsCliente30d > 0
                ? `Baia #${baiaIndex} · Em dev (${c.msgsCliente30d} msgs/30d)`
                : `Baia #${baiaIndex} · Em dev`,
            done: true,
          },
        ];
      }
    });

    // Inclui também projetos pausados no mapa idToCliente caso o operador abra a ficha deles
    for (const c of clientesPausados) {
      const id = getIdForSlug(c.slug);
      if (!byId.has(id)) {
        byId.set(id, { cliente: c, palette: paletteForSlug(c.slug), baiaIndex: 0 });
      }
    }

    return {
      activeAgentIds: ids,
      agentMeta: meta,
      agentTools: tools,
      idToCliente: byId,
    };
  }, [clientesVisiveis, clientesPausados, presencas, getIdForSlug]);

  // Aplica adições/remoções e mantém TODOS os NPCs sentados em suas respectivas mesas!
  useEffect(() => {
    if (!layoutReady) return;
    const os = getOfficeState();
    const targetSet = new Set(activeAgentIds);

    // Remove personagens que saíram do filtro (liberando a mesa para ficar vazia)
    for (const [existingId, ch] of os.characters.entries()) {
      if (ch.isLeader || ch.isPlayerControlled || ch.isSubagent) continue;
      if (!targetSet.has(existingId)) {
        os.removeAgent(existingId);
      }
    }

    // Limpa marcação de assentos antes de fixar cada NPC em sua respectiva baia
    for (const seat of os.seats.values()) {
      seat.assigned = false;
    }

    // Adiciona ou atualiza cada cliente visível, fixando-o em sua respectiva baia
    for (const id of activeAgentIds) {
      const entry = idToCliente.get(id);
      if (!entry) continue;
      const { cliente, palette, baiaIndex } = entry;
      const pres = presencas[cliente.slug];
      const isTyping = pres?.status === 'typing' || pres?.status === 'recording';
      const preferredSeatUid =
        baiaIndex >= 1 && baiaIndex <= TOTAL_MESAS_ESCRITORIO
          ? `chair-ws-${baiaIndex}`
          : undefined;

      if (!os.characters.has(id)) {
        os.addAgent(
          id,
          palette,
          0,
          preferredSeatUid,
          true,
          cliente.repoNome ?? (cliente.tipo === 'dm' ? 'DM' : 'Grupo'),
        );
      }

      const ch = os.characters.get(id);
      if (!ch) continue;

      if (preferredSeatUid && os.seats.has(preferredSeatUid)) {
        const targetSeat = os.seats.get(preferredSeatUid)!;
        targetSeat.assigned = true;
        ch.seatId = preferredSeatUid;
      }

      // Garante que todo NPC ativo no escritório fique sentado em sua respectiva mesa
      os.setAgentActive(id, true);
      if (ch.seatId) {
        const seat = os.seats.get(ch.seatId);
        if (
          seat &&
          ch.path.length === 0 &&
          (ch.tileCol !== seat.seatCol ||
            ch.tileRow !== seat.seatRow ||
            ch.state !== CharacterState.TYPE)
        ) {
          ch.tileCol = seat.seatCol;
          ch.tileRow = seat.seatRow;
          ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
          ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
          ch.dir = seat.facingDir;
          ch.state = CharacterState.TYPE;
        }
      }

      if (isTyping) {
        os.setAgentTool(id, 'Write');
        os.clearPermissionBubble(id);
      } else if (cliente.aguardando) {
        os.setAgentTool(id, 'Write');
        if (cliente.band === 'hot' || cliente.band === 'warm') {
          os.showPermissionBubble(id);
        } else {
          ch.bubbleType = 'waiting';
          ch.bubbleTimer = 10;
        }
      } else {
        os.setAgentTool(id, 'Read');
        os.clearPermissionBubble(id);
        if (ch.bubbleType === 'waiting') {
          ch.bubbleType = null;
          ch.bubbleTimer = 0;
        }
      }
    }
  }, [layoutReady, activeAgentIds, idToCliente, presencas, getOfficeState]);

  const handleSelectAgent = useCallback(
    (id: number | null) => {
      const os = getOfficeState();
      os.selectedAgentId = id;
      setSelectedAgentId(id);
    },
    [getOfficeState],
  );

  const handleWalkToAgent = useCallback(
    (id: number) => {
      const os = getOfficeState();
      const ch = os.characters.get(id);
      if (!ch) return;
      os.walkPlayerTo(ch.tileCol, ch.tileRow);
    },
    [getOfficeState],
  );

  const handleToggleSound = useCallback(() => {
    const next = !somAtivo;
    setSomAtivo(next);
    setSoundEnabled(next);
    if (next) playDoneSound();
  }, [somAtivo]);

  const handleResetDefaultMap = useCallback(async () => {
    try {
      const res = await fetch('/api/escritorio/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
      if (res.ok) {
        const data = await res.json();
        await reloadLayout(data.layout);
      }
    } catch {
      // ignore
    }
  }, [reloadLayout]);

  const officeState = getOfficeState();
  const editorState = getEditorState();

  const selectedEntry = selectedAgentId !== null ? idToCliente.get(selectedAgentId) : undefined;

  // Calcula contadores rápidos do topo
  const contadores = useMemo(() => {
    const base = escopo === 'em_dev' ? clientes.filter((c) => c.emDesenvolvimento) : clientes;
    const urgentes = base.filter(
      (c) => c.aguardando && (c.band === 'hot' || c.band === 'warm'),
    ).length;
    const aguardando = base.filter((c) => c.aguardando).length;
    const emDia = base.length - aguardando;
    const mesasOcupadas = Math.min(TOTAL_MESAS_ESCRITORIO, clientesVisiveis.length);
    const mesasVazias = Math.max(0, TOTAL_MESAS_ESCRITORIO - mesasOcupadas);
    return { total: base.length, urgentes, aguardando, emDia, mesasOcupadas, mesasVazias };
  }, [clientes, escopo, clientesVisiveis.length]);

  // Verifica cor do móvel selecionado para o EditorToolbar
  const selectedFurnitureColor = useMemo(() => {
    const uid = editorState.selectedFurnitureUid;
    if (!uid) return null;
    const item = officeState.getLayout().furniture.find((f) => f.uid === uid);
    return item?.color ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.editorTick, editorState.selectedFurnitureUid, officeState]);

  const showRotateHint =
    editor.isEditMode &&
    (() => {
      if (editorState.selectedFurnitureUid) {
        const item = officeState
          .getLayout()
          .furniture.find((f) => f.uid === editorState.selectedFurnitureUid);
        if (item) {
          const entry = getCatalogEntry(item.type);
          if (entry && entry.canPlaceOnWalls) return true;
        }
      }
      if (
        editorState.activeTool === EditTool.FURNITURE_PLACE &&
        editorState.selectedFurnitureType
      ) {
        const entry = getCatalogEntry(editorState.selectedFurnitureType);
        if (entry && entry.canPlaceOnWalls) return true;
      }
      return false;
    })();

  return (
    <div
      className="escritorio-pixel-root flex h-full w-full flex-col overflow-hidden bg-canvas"
      style={
        {
          '--pixel-bg': '#1e1e2e',
          '--pixel-border': '#4a4a6a',
          '--pixel-border-light': '#6a6a8a',
          '--pixel-accent': '#5a8cff',
          '--pixel-green': '#4ade80',
          '--pixel-shadow': '2px 2px 0px #0a0a14',
          '--pixel-text': 'rgba(255, 255, 255, 0.9)',
          '--pixel-text-dim': 'rgba(255, 255, 255, 0.65)',
          '--pixel-btn-bg': 'rgba(255, 255, 255, 0.08)',
          '--pixel-btn-hover-bg': 'rgba(255, 255, 255, 0.16)',
          '--pixel-btn-disabled-opacity': 0.35,
          '--pixel-active-bg': 'rgba(90, 140, 255, 0.25)',
          '--pixel-agent-bg': '#2e7d32',
          '--pixel-agent-hover-bg': '#388e3c',
          '--pixel-agent-border': '#66bb6a',
          '--pixel-agent-text': 'rgba(255, 255, 255, 0.95)',
          '--pixel-close-text': 'rgba(255, 255, 255, 0.6)',
          '--pixel-close-hover': '#ef4444',
          '--pixel-status-permission': '#ef4444',
          '--pixel-status-active': '#3b82f6',
          '--pixel-vignette':
            'radial-gradient(ellipse at center, transparent 58%, rgba(8, 10, 18, 0.55) 100%)',
          '--pixel-controls-z': 48,
          '--pixel-overlay-z': 44,
          '--pixel-overlay-selected-z': 46,
          '--vscode-foreground': 'rgba(255, 255, 255, 0.92)',
        } as React.CSSProperties
      }
    >
      <style>{`
        @font-face {
          font-family: 'FS Pixel Sans';
          font-style: normal;
          font-weight: 400;
          font-display: swap;
          src: url('/fonts/FSPixelSansUnicode-Regular.ttf') format('truetype');
        }
        @keyframes pixel-agents-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.25); }
        }
        .pixel-agents-pulse {
          animation: pixel-agents-pulse 1.5s ease-in-out infinite;
        }
      `}</style>

      {/* Barra Superior do Escritório */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2 md:gap-3 md:px-4 md:py-2.5">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          {/* Switcher Escritório 2D vs Organograma */}
          <div className="inline-flex rounded-lg border border-line bg-elevated p-0.5">
            <button
              type="button"
              onClick={() => setAba('mapa')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors md:px-3 md:text-[12px] ${
                aba === 'mapa'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-faint hover:text-fg'
              }`}
            >
              🏢 Escritório 2D
            </button>
            <button
              type="button"
              onClick={() => setAba('organograma')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors md:px-3 md:text-[12px] ${
                aba === 'organograma'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-faint hover:text-fg'
              }`}
            >
              📊 Organograma ({clientesVisiveis.length})
            </button>
          </div>

          {/* Escopo: Em Dev vs Todos */}
          <div className="inline-flex rounded-lg border border-line bg-elevated p-0.5">
            <button
              type="button"
              onClick={() => setEscopo('em_dev')}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors md:px-2.5 ${
                escopo === 'em_dev'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-faint hover:text-fg'
              }`}
              title="Mostrar apenas projetos em desenvolvimento ativo (demais mesas ficam vazias)"
            >
              💻 Em Dev ({clientes.filter((c) => c.emDesenvolvimento).length})
            </button>
            <button
              type="button"
              onClick={() => setEscopo('todos')}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors md:px-2.5 ${
                escopo === 'todos'
                  ? 'bg-surface text-fg shadow-sm'
                  : 'text-fg-faint hover:text-fg'
              }`}
              title="Mostrar todos os projetos vinculados, inclusive pausados"
            >
              Todos ({clientes.length})
            </button>
          </div>

          <span
            className="hidden items-center gap-1.5 rounded-full border border-line bg-elevated px-2.5 py-0.5 text-[11px] text-fg-dim lg:inline-flex"
            title="Capacidade das baias individuais no escritório"
          >
            🪑 <strong className="font-mono text-fg">{contadores.mesasOcupadas}</strong>/
            {TOTAL_MESAS_ESCRITORIO} mesas ·{' '}
            <span className="text-fg-faint">{contadores.mesasVazias} vazias</span>
          </span>

          {/* Pílulas de filtro por SLA */}
          <div className="hidden items-center gap-1.5 md:flex">
            <button
              type="button"
              onClick={() => setStatusFiltro('todos')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                statusFiltro === 'todos'
                  ? 'border-accent bg-accent-soft text-fg'
                  : 'border-line text-fg-faint hover:text-fg'
              }`}
            >
              Todos <span className="font-mono text-[10px]">{contadores.total}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setStatusFiltro(statusFiltro === 'urgentes' ? 'todos' : 'urgentes')
              }
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                statusFiltro === 'urgentes'
                  ? 'border-red-500 bg-red-500/20 text-red-300'
                  : 'border-line text-fg-faint hover:text-fg'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-red-500" />
              Urgentes (&gt;4h){' '}
              <span className="font-mono text-[10px]">{contadores.urgentes}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setStatusFiltro(statusFiltro === 'aguardando' ? 'todos' : 'aguardando')
              }
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                statusFiltro === 'aguardando'
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                  : 'border-line text-fg-faint hover:text-fg'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Aguardando{' '}
              <span className="font-mono text-[10px]">{contadores.aguardando}</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFiltro(statusFiltro === 'em_dia' ? 'todos' : 'em_dia')}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                statusFiltro === 'em_dia'
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                  : 'border-line text-fg-faint hover:text-fg'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Em dia (Na Mesa) <span className="font-mono text-[10px]">{contadores.emDia}</span>
            </button>
          </div>
        </div>

        {/* Busca + Controles do Mapa */}
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar projeto ou contato…"
            className="w-36 rounded-lg border border-line bg-elevated px-2.5 py-1 text-[12px] text-fg placeholder:text-fg-faint focus:outline-none sm:w-52"
          />

          {aba === 'mapa' && (
            <>
              <button
                type="button"
                onClick={() => setMostrarRoster((v) => !v)}
                className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors md:px-2.5 ${
                  mostrarRoster
                    ? 'border-line bg-elevated text-fg'
                    : 'border-line text-fg-faint hover:text-fg'
                }`}
                title="Mostrar/ocultar lista lateral de personagens"
              >
                👥 Lista ({clientesVisiveis.length})
              </button>

              <button
                type="button"
                onClick={() => setMostrarAreas((v) => !v)}
                className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors md:px-2.5 ${
                  mostrarAreas
                    ? 'border-line bg-elevated text-fg'
                    : 'border-line text-fg-faint hover:text-fg'
                }`}
                title="Mostrar/ocultar nomes das salas no mapa"
              >
                🏷️ Salas
              </button>

              <button
                type="button"
                onClick={handleToggleSound}
                className={`hidden rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors sm:inline-flex ${
                  somAtivo
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                    : 'border-line text-fg-faint hover:text-fg'
                }`}
                title="Aviso sonoro quando um cliente entrar em espera"
              >
                {somAtivo ? '🔔 Som On' : '🔕 Som Off'}
              </button>

              <button
                type="button"
                onClick={editor.handleToggleEditMode}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors md:px-3 ${
                  editor.isEditMode
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : 'border-line bg-elevated text-fg-dim hover:text-fg'
                }`}
              >
                {editor.isEditMode ? '✓ Fechar' : '🛠️ Editar'}
              </button>
            </>
          )}
        </div>
      </header>

      {/* Corpo Principal */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {aba === 'organograma' ? (
          <OrganogramaClientesView
            itens={clientesVisiveis.map((c) => ({
              id: getIdForSlug(c.slug),
              palette: paletteForSlug(c.slug),
              cliente: c,
              autonomo: autonomo[c.slug],
            }))}
            selectedId={selectedAgentId}
            onSelectInOffice={(id) => {
              handleSelectAgent(id);
              setAba('mapa');
            }}
          />
        ) : (
          <>
            {/* Backdrop mobile para fechar o Roster ao tocar fora */}
            {mostrarRoster && (
              <div
                className="fixed inset-0 z-40 bg-black/50 md:hidden"
                onClick={() => setMostrarRoster(false)}
              />
            )}

            {/* Mini-Roster Lateral de Clientes no Escritório */}
            {mostrarRoster && (
              <aside className="flex h-full w-68 shrink-0 flex-col border-r border-line bg-surface max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-76 max-md:shadow-2xl">
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
                      🪑 Nas Mesas ({clientesVisiveis.length}/{TOTAL_MESAS_ESCRITORIO})
                    </span>
                    <div className="text-[10px] text-fg-faint">
                      {contadores.mesasVazias} baias vazias no escritório
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setExpandirTodosContatos((v) => !v)}
                      title="Expandir ou recolher contatos e DMs de todos os projetos"
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                        expandirTodosContatos
                          ? 'border-accent bg-accent-soft text-fg'
                          : 'border-line bg-elevated text-fg-faint hover:text-fg'
                      }`}
                    >
                      👥 Contatos {expandirTodosContatos ? '▴' : '▾'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMostrarRoster(false)}
                      className="rounded px-1.5 py-0.5 text-[11px] text-fg-faint hover:bg-elevated hover:text-fg md:hidden"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="flex-1 divide-y divide-line overflow-y-auto">
                  {clientesVisiveis.map((c, idx) => {
                    const id = getIdForSlug(c.slug);
                    const palette = paletteForSlug(c.slug);
                    const selecionado = selectedAgentId === id;
                    const m = agentMeta[id];
                    const baiaNum = idx + 1;
                    const contatos = c.contatosVinculados ?? [];
                    const dmsPendentes = c.dmsAguardando ?? 0;
                    const buscaAtiva = busca.trim().length > 0;
                    const aberto =
                      expandedProjetos[c.slug] !== undefined
                        ? expandedProjetos[c.slug]
                        : expandirTodosContatos || selecionado || dmsPendentes > 0 || buscaAtiva;

                    return (
                      <div key={c.slug} className="flex flex-col">
                        <div
                          onClick={() => {
                            if (selecionado) {
                              handleSelectAgent(null);
                              setCanalDrawerSelecionado(null);
                            } else {
                              handleSelectAgent(id);
                              setCanalDrawerSelecionado(null);
                              setExpandedProjetos((prev) => ({ ...prev, [c.slug]: true }));
                            }
                            if (typeof window !== 'undefined' && window.innerWidth < 768) {
                              setMostrarRoster(false);
                            }
                          }}
                          className={`flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors ${
                            selecionado
                              ? 'bg-accent-soft text-fg'
                              : 'hover:bg-elevated'
                          }`}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-[#161822]">
                            <CharSprite charIndex={palette} size={24} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: m?.dotColor ?? '#22c55e' }}
                              />
                              <span className="truncate text-[12px] font-medium text-fg">
                                {c.nome}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px] text-fg-faint">
                              <span className="truncate">
                                Baia #{baiaNum} ·{' '}
                                {c.aguardando && c.waitingLabel
                                  ? `Aguardando ${c.waitingLabel}`
                                  : dmsPendentes > 0
                                    ? `⚠️ ${dmsPendentes} DM aguardando`
                                    : c.repoNome
                                      ? c.repoNome
                                      : 'Em dev'}
                              </span>
                              {c.msgsCliente30d > 0 && (
                                <span className="shrink-0 font-mono">{c.msgsCliente30d}m</span>
                              )}
                            </div>
                          </div>

                          {contatos.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedProjetos((prev) => ({
                                  ...prev,
                                  [c.slug]: !aberto,
                                }));
                              }}
                              title="Mostrar/ocultar contatos e conversas fora do grupo"
                              className={`inline-flex shrink-0 items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                dmsPendentes > 0
                                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                                  : aberto
                                    ? 'border-line bg-elevated text-fg'
                                    : 'border-line bg-surface text-fg-faint hover:text-fg'
                              }`}
                            >
                              <span>{dmsPendentes > 0 ? '💬' : '👥'}</span>
                              <span className="font-mono">{contatos.length}</span>
                              <span>{aberto ? '▴' : '▾'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectAgent(id);
                              handleWalkToAgent(id);
                            }}
                            title="Ir até a mesa com seu personagem"
                            className="rounded p-1 text-[11px] text-fg-faint opacity-60 hover:bg-elevated hover:text-fg hover:opacity-100"
                          >
                            🚶
                          </button>
                        </div>

                        {/* Dropdown de Contatos do Grupo + DMs Monitoradas */}
                        {aberto && contatos.length > 0 && (
                          <div className="border-t border-line/60 bg-elevated/35 pb-1.5 pl-6 pr-2.5 pt-1">
                            {contatos.map((ct, cIdx) => {
                              const ehUltimo = cIdx === contatos.length - 1;
                              const temDm = Boolean(ct.dmSlug);
                              const dmAtivaNoDrawer =
                                selecionado &&
                                temDm &&
                                canalDrawerSelecionado !== null &&
                                (ct.dmSlug === canalDrawerSelecionado ||
                                  ct.dmSlugs.includes(canalDrawerSelecionado));

                              return (
                                <div
                                  key={ct.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectAgent(id);
                                    if (temDm && ct.dmSlug) {
                                      setCanalDrawerSelecionado(ct.dmSlug);
                                    } else {
                                      setCanalDrawerSelecionado(null);
                                    }
                                    if (
                                      typeof window !== 'undefined' &&
                                      window.innerWidth < 768
                                    ) {
                                      setMostrarRoster(false);
                                    }
                                  }}
                                  className={`group flex cursor-pointer flex-col rounded px-2 py-1 text-[11px] transition-colors ${
                                    dmAtivaNoDrawer
                                      ? 'bg-accent-soft text-fg'
                                      : ct.aguardando
                                        ? 'bg-amber-500/10 text-fg hover:bg-amber-500/20'
                                        : 'text-fg-dim hover:bg-elevated hover:text-fg'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1.5">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      <span className="font-mono text-[10px] text-fg-faint">
                                        {ehUltimo ? '└─' : '├─'}
                                      </span>
                                      <span className="shrink-0 text-[11px]">
                                        {temDm ? '💬' : '👤'}
                                      </span>
                                      <span className="truncate font-medium text-fg">
                                        {ct.nome}
                                      </span>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1">
                                      {ct.aguardando ? (
                                        <span className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-red-300">
                                          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                                          {ct.waitingLabel ?? 'DM'}
                                        </span>
                                      ) : temDm ? (
                                        <span
                                          className="rounded border border-line bg-surface px-1 py-0.2 font-mono text-[9px] text-fg-faint"
                                          title={`Chat individual monitorado (${ct.dmSlug})`}
                                        >
                                          {ct.atividadeLabel
                                            ? `DM · ${ct.atividadeLabel}`
                                            : `DM · ${ct.mensagensDm}m`}
                                        </span>
                                      ) : (
                                        <span className="text-[9px] text-fg-faint">grupo</span>
                                      )}

                                      {temDm && ct.dmSlug && (
                                        <Link
                                          href={`/g/${encodeURIComponent(ct.dmSlug)}`}
                                          onClick={(e) => e.stopPropagation()}
                                          title={`Abrir conversa individual de ${ct.nome}`}
                                          className="rounded px-1 text-[10px] text-fg-faint hover:bg-surface hover:text-fg"
                                        >
                                          ↗
                                        </Link>
                                      )}
                                    </div>
                                  </div>

                                  {temDm && ct.ultimaPreview && (
                                    <div className="mt-0.5 truncate pl-6 text-[10px] text-fg-faint">
                                      {ct.ultimaPreview}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Seção de Projetos Pausados / Fora de Desenvolvimento (Mesas Vazias) */}
                  {escopo === 'em_dev' && clientesPausados.length > 0 && (
                    <div className="bg-elevated/40">
                      <button
                        type="button"
                        onClick={() => setMostrarPausados((v) => !v)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-faint hover:bg-elevated"
                      >
                        <span>
                          💤 Fora de Dev / Mesa Vazia ({clientesPausados.length})
                        </span>
                        <span>{mostrarPausados ? '▾' : '▸'}</span>
                      </button>

                      {mostrarPausados && (
                        <div className="divide-y divide-line border-t border-line">
                          {clientesPausados.map((c) => {
                            const id = getIdForSlug(c.slug);
                            const selecionado = selectedAgentId === id;
                            return (
                              <div
                                key={c.slug}
                                onClick={() => handleSelectAgent(selecionado ? null : id)}
                                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[11px] transition-colors ${
                                  selecionado
                                    ? 'bg-accent-soft text-fg'
                                    : 'text-fg-faint hover:bg-elevated hover:text-fg'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium">{c.nome}</div>
                                  <div className="truncate text-[10px] opacity-75">
                                    Mesa vazia · {c.repoNome ?? '0 msgs (30d)'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleMesa(c.slug, 'ocupar_mesa');
                                  }}
                                  className="shrink-0 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/25"
                                  title="Colocar este projeto em uma mesa do escritório"
                                >
                                  + Mesa
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </aside>
            )}

            {/* Palco 2D Pixel Office */}
            <div
              ref={containerRef}
              className="relative min-w-0 flex-1 overflow-hidden bg-[#12131c]"
            >
              {!layoutReady ? (
                <CenaLoaderEscritorio
                  progress={loadingProgress}
                  step={loadingStep}
                  totalProjetos={clientesVisiveis.length}
                />
              ) : (
                <>
                  <OfficeCanvas
                    officeState={officeState}
                    onClick={handleSelectAgent}
                    isEditMode={editor.isEditMode}
                    editorState={editorState}
                    onEditorTileAction={editor.handleEditorTileAction}
                    onEditorEraseAction={editor.handleEditorEraseAction}
                    onEditorSelectionChange={editor.handleEditorSelectionChange}
                    onDeleteSelected={editor.handleDeleteSelected}
                    onRotateSelected={editor.handleRotateSelected}
                    onDragMove={editor.handleDragMove}
                    editorTick={editor.editorTick}
                    zoom={editor.zoom}
                    onZoomChange={editor.handleZoomChange}
                    panRef={editor.panRef}
                  />

                  <AreaLabelsOverlay
                    officeState={officeState}
                    containerRef={containerRef}
                    zoom={editor.zoom}
                    panRef={editor.panRef}
                    visible={mostrarAreas && !editor.isEditMode}
                  />

                  <AgentLabels
                    officeState={officeState}
                    agents={activeAgentIds}
                    agentMeta={agentMeta}
                    containerRef={containerRef}
                    zoom={editor.zoom}
                    panRef={editor.panRef}
                    subagentCharacters={emptySubagents}
                    onSelectAgent={(id) => handleSelectAgent(id)}
                    playerLabel="Você"
                  />

                  <ZoomControls zoom={editor.zoom} onZoomChange={editor.handleZoomChange} />

                  {/* Vignette suave */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'var(--pixel-vignette)',
                      pointerEvents: 'none',
                      zIndex: 38,
                    }}
                  />

                  <ToolOverlay
                    officeState={officeState}
                    agents={activeAgentIds}
                    agentTools={agentTools}
                    subagentCharacters={emptySubagents}
                    containerRef={containerRef}
                    zoom={editor.zoom}
                    panRef={editor.panRef}
                    onCloseAgent={() => {}}
                    onWalkTo={handleWalkToAgent}
                  />

                  {/* Dica de Controles de Movimento (canto inferior esquerdo) */}
                  {!editor.isEditMode && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 12,
                        left: 12,
                        zIndex: 45,
                        pointerEvents: 'none',
                      }}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#141622]/85 px-2.5 py-1 text-[10px] text-white/75 shadow-lg backdrop-blur-sm sm:gap-3 sm:px-3 sm:py-1.5 sm:text-[11px]"
                    >
                      <span className="hidden sm:inline">
                        <strong className="text-white">WASD / Setas</strong> Andar ·{' '}
                      </span>
                      <span>
                        <strong className="text-white">Arrastar</strong> Mover mapa
                      </span>
                      <span>·</span>
                      <span>
                        <strong className="text-white">Toque no chão</strong> Ir até lá
                      </span>
                      <span className="hidden sm:inline">
                        · <strong className="text-white">Clique num cliente</strong> Abrir ficha
                      </span>
                    </div>
                  )}

                  {/* Barra Superior de Ações do Editor (Undo / Redo / Salvar / Restaurar Padrão) */}
                  {editor.isEditMode && (
                    <>
                      <div
                        style={{
                          position: 'absolute',
                          top: 10,
                          left: 12,
                          zIndex: 'var(--pixel-controls-z)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <button
                          type="button"
                          onClick={editor.handleUndo}
                          disabled={editorState.undoStack.length === 0}
                          className="rounded border border-white/20 bg-[#1e1e2e] px-2.5 py-1 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40"
                          title="Desfazer (Ctrl+Z)"
                        >
                          ↶ Desfazer
                        </button>
                        <button
                          type="button"
                          onClick={editor.handleRedo}
                          disabled={editorState.redoStack.length === 0}
                          className="rounded border border-white/20 bg-[#1e1e2e] px-2.5 py-1 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40"
                          title="Refazer (Ctrl+Y)"
                        >
                          ↷ Refazer
                        </button>
                        <button
                          type="button"
                          onClick={editor.handleSave}
                          className="rounded border border-emerald-500/50 bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          💾 Salvar Mapa
                        </button>
                        <button
                          type="button"
                          onClick={handleResetDefaultMap}
                          className="rounded border border-white/20 bg-[#1e1e2e] px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
                          title="Restaurar mapa original de fábrica"
                        >
                          ↺ Restaurar Padrão
                        </button>
                        {showRotateHint && (
                          <span className="rounded border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs text-amber-200">
                            Pressione <b>R</b> para girar · <b>T</b> para alternar estado ·{' '}
                            <b>Del</b> para remover
                          </span>
                        )}
                      </div>

                      <EditorToolbar
                        activeTool={editorState.activeTool}
                        selectedTileType={editorState.selectedTileType}
                        selectedFurnitureType={editorState.selectedFurnitureType}
                        selectedFurnitureUid={editorState.selectedFurnitureUid}
                        selectedFurnitureColor={selectedFurnitureColor}
                        floorColor={editorState.floorColor}
                        wallColor={editorState.wallColor}
                        onToolChange={editor.handleToolChange}
                        onTileTypeChange={editor.handleTileTypeChange}
                        onFloorColorChange={editor.handleFloorColorChange}
                        onWallColorChange={editor.handleWallColorChange}
                        onSelectedFurnitureColorChange={editor.handleSelectedFurnitureColorChange}
                        onFurnitureTypeChange={editor.handleFurnitureTypeChange}
                        loadedAssets={loadedAssets}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Gaveta Lateral do Cliente Selecionado */}
        {selectedEntry && selectedAgentId !== null && (
          <PainelClienteEscritorio
            cliente={selectedEntry.cliente}
            palette={selectedEntry.palette}
            presenca={presencas[selectedEntry.cliente.slug]}
            autonomo={autonomo[selectedEntry.cliente.slug]}
            notaInicial={notas[selectedEntry.cliente.slug] ?? ''}
            seatLabel={
              selectedEntry.baiaIndex > 0
                ? `Baia #${selectedEntry.baiaIndex} · Sentado em sua mesa de desenvolvimento`
                : 'Fora de desenvolvimento · Mesa vazia'
            }
            canalSelecionado={canalDrawerSelecionado}
            onSelectCanal={setCanalDrawerSelecionado}
            dmsDisponiveis={dmsDisponiveis}
            onClose={() => {
              handleSelectAgent(null);
              setCanalDrawerSelecionado(null);
            }}
            onWalkTo={() => {
              if (aba !== 'mapa') setAba('mapa');
              handleWalkToAgent(selectedAgentId);
            }}
            onRefreshEstado={refreshEstado}
            onToggleMesa={handleToggleMesa}
          />
        )}
      </div>
    </div>
  );
}
