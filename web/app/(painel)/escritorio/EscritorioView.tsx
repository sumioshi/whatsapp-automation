'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClienteEscritorio, DmDisponivelEscritorio } from '@/lib/escritorio-estado';
import { FreioPorChat, interpretarEventoMensagem } from '@/lib/escritorio-notificacao';
import type { OrcaSnapshot } from '@/lib/orca-bridge';
import type { PresenceView } from '@/lib/presence';
import { AMBIENT_STATIONS, type AmbientStation, getAmbientMusic } from './ambientMusic';
import { AgentLabels, type AgentLabelMeta } from './components/AgentLabels';
import { AreaLabelsOverlay } from './components/AreaLabelsOverlay';
import { CenaLoaderEscritorio } from './components/CenaLoaderEscritorio';
import { CharSprite } from './components/CharSprite';
import { ChatBubblesOverlay, type ChatBubbleInfo } from './components/ChatBubblesOverlay';
import { OrganogramaClientesView } from './components/OrganogramaClientesView';
import { PainelClienteEscritorio } from './components/PainelClienteEscritorio';
import { PlayerAvatarModal } from './components/PlayerAvatarModal';
import { QuickActionHud } from './components/QuickActionHud';
import { ZoomControls } from './components/ZoomControls';
import { PALETTE_COUNT } from './constants';
import { useEditorActions } from './hooks/useEditorActions';
import { useEditorKeyboard } from './hooks/useEditorKeyboard';
import { useLeaderKeyboard } from './hooks/useLeaderKeyboard';
import { useOfficeAssets } from './hooks/useOfficeAssets';
import {
  type CicloIluminacaoModo,
  type FaseIluminacao,
  getInfoFase,
  resolverFase,
} from './lib/timeCycle';
import {
  isSoundEnabled,
  playDoneSound,
  playIncomingMessageSound,
  playKeyClickSound,
  playUrgentAlertSound,
  setSoundEnabled,
  unlockAudio,
} from './notificationSound';
import { OfficeCanvas } from './office/components/OfficeCanvas';
import { type SubagentCharacter, ToolOverlay } from './office/components/ToolOverlay';
import { EditorState } from './office/editor/editorState';
import { EditorToolbar } from './office/editor/EditorToolbar';
import { OfficeState, PLAYER_ID } from './office/engine/officeState';
import { getCatalogEntry } from './office/layout/furnitureCatalog';
import { findPath } from './office/layout/tileMap';
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

/** Quanto tempo o balão de mensagem recém-chegada fica em destaque */
const FLASH_BALAO_MS = 6_000;

interface FlashBalao {
  autor?: string;
  texto: string;
  ate: number;
}

/** Cliente com mensagem sem resposta, no grupo ou em DM vinculada */
function temAguardando(c: ClienteEscritorio): boolean {
  return c.aguardando || (c.dmsAguardando ?? 0) > 0;
}

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
  const [abaDrawerInicial, setAbaDrawerInicial] = useState<'whatsapp' | 'orca'>('whatsapp');
  const [orcaSnapshot, setOrcaSnapshot] = useState<OrcaSnapshot | null>(null);
  const [expandedProjetos, setExpandedProjetos] = useState<Record<string, boolean>>({});
  const [expandirTodosContatos, setExpandirTodosContatos] = useState(false);

  // Ciclo Dinâmico de Iluminação (Dia / Tarde / Noite)
  const [cicloModo, setCicloModo] = useState<CicloIluminacaoModo>('auto');
  const [faseIluminacao, setFaseIluminacao] = useState<FaseIluminacao>('dia');

  // Balões de fala flutuantes sobre os NPCs
  const [mostrarBaloes, setMostrarBaloes] = useState(true);

  // Mensagem recém-chegada por slug de projeto: balão em destaque por alguns segundos,
  // preenchido na hora pelo SSE (sem esperar o refresh do estado)
  const [flashes, setFlashes] = useState<Record<string, FlashBalao>>({});
  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const freioSomRef = useRef(new FreioPorChat());
  // Último handler de mensagem nova, pra assinatura SSE não precisar reassinar a cada render
  const aoReceberMensagemRef = useRef<(payload: unknown) => void>(() => {});
  const clientesRef = useRef<ClienteEscritorio[]>(clientesIniciais);
  useEffect(() => {
    clientesRef.current = clientes;
  }, [clientes]);
  useEffect(() => {
    const timers = flashTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // Som só sai depois de um gesto do usuário (política dos navegadores): destrava uma vez
  useEffect(() => {
    const destravar = () => unlockAudio();
    window.addEventListener('pointerdown', destravar, { once: true });
    window.addEventListener('keydown', destravar, { once: true });
    return () => {
      window.removeEventListener('pointerdown', destravar);
      window.removeEventListener('keydown', destravar);
    };
  }, []);

  // Decoração de Natal & Luzes Aconchegantes + Rádio Ambiente Lo-Fi / Campo / Natal
  const [natalAtivo, setNatalAtivo] = useState(true);
  const [musicaAtiva, setMusicaAtiva] = useState(false);
  const [estacaoMusica, setEstacaoMusica] = useState<AmbientStation>('lofi');

  // Customizador do Avatar do Jogador ("Você")
  const [playerPalette, setPlayerPalette] = useState<number>(5);
  const [mostrarAvatarModal, setMostrarAvatarModal] = useState(false);
  const [mostrarDicasTeclado, setMostrarDicasTeclado] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useLeaderKeyboard(getOfficeState, editor.isEditMode || aba !== 'mapa');

  // Atualização periódica e via tempo real (SSE) do estado dos clientes
  const refreshEstado = useCallback(async (forceFresh = false) => {
    try {
      const url = forceFresh ? '/api/escritorio/estado?fresh=1' : '/api/escritorio/estado';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as {
        clientes?: ClienteEscritorio[];
        presencas?: Record<string, PresenceView>;
        autonomo?: Record<string, boolean>;
        notas?: Record<string, string>;
        dmsDisponiveis?: DmDisponivelEscritorio[];
      };
      if (Array.isArray(data.clientes)) setClientes(data.clientes);
      if (data.presencas && Object.keys(data.presencas).length > 0) {
        setPresencas((prev) => ({ ...prev, ...data.presencas }));
      }
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

  const refreshOrca = useCallback(async () => {
    try {
      const res = await fetch('/api/escritorio/orca', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { snapshot?: OrcaSnapshot };
      if (data?.snapshot) {
        setOrcaSnapshot(data.snapshot);
      }
    } catch {
      // mantém último snapshot
    }
  }, []);

  useEffect(() => {
    // Se a página abriu com cache frio (0 clientes iniciais) ou sem lista de DMs, busca imediatamente
    if (clientesIniciais.length === 0 || dmsDisponiveis.length === 0) {
      void refreshEstado(true);
    }
    void refreshOrca();
    const timer = setInterval(() => void refreshEstado(false), 6000);
    const orcaTimer = setInterval(refreshOrca, 6000);
    return () => {
      clearInterval(timer);
      clearInterval(orcaTimer);
    };
  }, [clientesIniciais.length, dmsDisponiveis.length, refreshEstado, refreshOrca]);

  // Assinatura SSE em tempo real (/api/events) para atualizar instantaneamente quando chegar mensagem ou presença no WhatsApp
  useEffect(() => {
    let es: EventSource | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerInstantRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void refreshEstado(true);
      }, 150);
    };

    try {
      es = new EventSource('/api/events?todos=1&ocultar=coletor');
      es.addEventListener('message', (ev) => {
        try {
          aoReceberMensagemRef.current(JSON.parse((ev as MessageEvent).data));
        } catch {
          // payload fora do padrão: o refresh abaixo ainda atualiza o estado
        }
        triggerInstantRefresh();
      });
      es.addEventListener('presence', (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as {
            groupSlug?: string;
            slug?: string;
            status?: 'typing' | 'recording' | 'online' | 'offline';
            state?: string;
            participantName?: string;
            participante?: string | null;
            lastSeen?: number | null;
          };
          const slug = payload?.groupSlug ?? payload?.slug;
          const rawStatus =
            payload?.status ??
            (payload?.state === 'composing'
              ? 'typing'
              : payload?.state === 'recording'
                ? 'recording'
                : payload?.state === 'available'
                  ? 'online'
                  : 'offline');
          if (slug && rawStatus) {
            setPresencas((prev) => ({
              ...prev,
              [slug]: {
                status: rawStatus,
                lastSeen: payload.lastSeen ?? Date.now(),
                participante: payload.participante ?? payload.participantName ?? null,
              },
            }));
          }
        } catch {
          // ignore
        }
      });
      es.addEventListener('presence-snapshot', (ev) => {
        try {
          const snapshot = JSON.parse((ev as MessageEvent).data) as Record<string, PresenceView>;
          if (snapshot && typeof snapshot === 'object') {
            setPresencas(snapshot);
          }
        } catch {
          // ignore
        }
      });
    } catch {
      // fallback para polling
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      es?.close();
    };
  }, [refreshEstado]);

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

  // Mensagem nova de cliente (grupo ou DM vinculada): balão em destaque, NPC reage e som toca,
  // tudo na hora do evento. O refresh do estado cuida do vermelho e da ordenação em seguida.
  const aoReceberMensagem = useCallback(
    (payload: unknown) => {
      const msg = interpretarEventoMensagem(payload, clientesRef.current);
      if (!msg) return;
      const { slugProjeto } = msg;
      const ate = Date.now() + FLASH_BALAO_MS;

      setFlashes((prev) => ({ ...prev, [slugProjeto]: { autor: msg.autor, texto: msg.previa, ate } }));
      const timers = flashTimersRef.current;
      const anterior = timers.get(slugProjeto);
      if (anterior) clearTimeout(anterior);
      timers.set(
        slugProjeto,
        setTimeout(() => {
          timers.delete(slugProjeto);
          setFlashes((prev) => {
            if (prev[slugProjeto]?.ate !== ate) return prev;
            const { [slugProjeto]: _removido, ...resto } = prev;
            return resto;
          });
        }, FLASH_BALAO_MS),
      );

      getOfficeState().reagirMensagem(getIdForSlug(slugProjeto));

      if (isSoundEnabled() && freioSomRef.current.permitir(slugProjeto)) {
        const cli = clientesRef.current.find((c) => c.slug === slugProjeto);
        if (cli && (cli.band === 'hot' || cli.band === 'warm')) {
          void playUrgentAlertSound();
        } else {
          void playIncomingMessageSound();
        }
      }
    },
    [getIdForSlug, getOfficeState],
  );
  useEffect(() => {
    aoReceberMensagemRef.current = aoReceberMensagem;
  }, [aoReceberMensagem]);

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
        if (statusFiltro === 'em_dia' && (c.aguardando || (c.dmsAguardando ?? 0) > 0)) return false;
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

  // Carrega e sincroniza ciclo de iluminação dinâmico + decoração de natal + estação musical
  useEffect(() => {
    const salvo = localStorage.getItem('escritorio_ciclo') as CicloIluminacaoModo | null;
    if (salvo && ['auto', 'dia', 'tarde', 'noite'].includes(salvo)) {
      setCicloModo(salvo);
    }
    const natalSalvo = localStorage.getItem('escritorio_natal');
    if (natalSalvo !== null) {
      setNatalAtivo(natalSalvo === 'true');
    }
    const estacaoSalva = localStorage.getItem('escritorio_estacao_musica') as AmbientStation | null;
    if (estacaoSalva && ['lofi', 'campo', 'natal'].includes(estacaoSalva)) {
      setEstacaoMusica(estacaoSalva);
    }
    return () => {
      getAmbientMusic().stop();
    };
  }, []);

  const handleToggleNatal = useCallback(() => {
    playKeyClickSound();
    setNatalAtivo((prev) => {
      const next = !prev;
      localStorage.setItem('escritorio_natal', String(next));
      return next;
    });
  }, []);

  const handleToggleMusica = useCallback(() => {
    const ctrl = getAmbientMusic();
    if (musicaAtiva) {
      ctrl.stop();
      setMusicaAtiva(false);
    } else {
      const ok = ctrl.start(estacaoMusica);
      setMusicaAtiva(ok);
    }
  }, [musicaAtiva, estacaoMusica]);

  const handleCycleEstacaoMusica = useCallback(() => {
    const ordem: AmbientStation[] = ['lofi', 'campo', 'natal'];
    const prox = ordem[(ordem.indexOf(estacaoMusica) + 1) % ordem.length];
    setEstacaoMusica(prox);
    localStorage.setItem('escritorio_estacao_musica', prox);
    const ctrl = getAmbientMusic();
    ctrl.setStation(prox);
    if (!musicaAtiva) {
      const ok = ctrl.start(prox);
      setMusicaAtiva(ok);
    }
  }, [estacaoMusica, musicaAtiva]);

  useEffect(() => {
    const atualiza = () => {
      setFaseIluminacao(resolverFase(cicloModo));
    };
    atualiza();
    const interval = setInterval(atualiza, 30000);
    return () => clearInterval(interval);
  }, [cicloModo]);

  const handleCycleIluminacao = useCallback(() => {
    playKeyClickSound();
    const proximo: Record<CicloIluminacaoModo, CicloIluminacaoModo> = {
      auto: 'dia',
      dia: 'tarde',
      tarde: 'noite',
      noite: 'auto',
    };
    setCicloModo((prev) => {
      const novo = proximo[prev];
      localStorage.setItem('escritorio_ciclo', novo);
      return novo;
    });
  }, []);

  // Carrega e sincroniza paleta do avatar do jogador ("Você")
  useEffect(() => {
    const salvo = localStorage.getItem('escritorio_player_palette');
    if (salvo !== null) {
      const num = parseInt(salvo, 10);
      if (!isNaN(num) && num >= 0 && num < PALETTE_COUNT) {
        setPlayerPalette(num);
        getOfficeState().setPlayerPalette(num);
      }
    }
  }, [getOfficeState]);

  const handleSelectPlayerPalette = useCallback(
    (pal: number) => {
      playKeyClickSound();
      setPlayerPalette(pal);
      getOfficeState().setPlayerPalette(pal);
      localStorage.setItem('escritorio_player_palette', String(pal));
    },
    [getOfficeState],
  );

  // Controle de som retrô quando um cliente entra em aguardando (no grupo ou em DM vinculada)
  const prevAguardandoSlugsRef = useRef<Set<string>>(
    new Set(clientesIniciais.filter(temAguardando).map((c) => c.slug)),
  );

  useEffect(() => {
    const currentSet = new Set(clientes.filter(temAguardando).map((c) => c.slug));
    let novoAguardando = false;
    let novoUrgente = false;
    for (const slug of currentSet) {
      if (!prevAguardandoSlugsRef.current.has(slug)) {
        novoAguardando = true;
        const cli = clientes.find((c) => c.slug === slug);
        if (cli && (cli.band === 'hot' || cli.band === 'warm')) {
          novoUrgente = true;
        }
      }
    }
    prevAguardandoSlugsRef.current = currentSet;
    if (novoAguardando && isSoundEnabled()) {
      if (novoUrgente) {
        playUrgentAlertSound();
      } else {
        playDoneSound();
      }
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
      const temMensagemSemResposta = c.aguardando || (c.dmsAguardando ?? 0) > 0;
      // Qualquer mensagem sem resposta do cliente deixa o NPC imediatamente VERMELHO e pulsante
      const isDanger = temMensagemSemResposta;

      let dotColor = '#22c55e'; // em dia = verde
      let pulse = false;
      if (isTyping) {
        dotColor = '#3b82f6';
        pulse = true;
      } else if (isDanger) {
        dotColor = '#ef4444';
        pulse = true;
      }

      const dmPendente = (c.contatosVinculados ?? []).find((ct) => ct.aguardando);
      const subLabel = c.aguardando
        ? c.waitingLabel ?? 'sem resposta'
        : dmPendente
          ? `DM: ${dmPendente.waitingLabel ?? 'sem resposta'}`
          : undefined;

      meta[id] = {
        nome: c.nome,
        subLabel,
        dotColor,
        pulse,
        urgente: isDanger,
      };

      const orcaProj = orcaSnapshot?.bySlug?.[c.slug];
      const orcaWorkingAgent = orcaProj?.agents.find((a) => a.state === 'working');

      if (orcaWorkingAgent) {
        tools[id] = [
          {
            toolId: `orca-${c.slug}`,
            status: `🐋 ${orcaWorkingAgent.agentType}: ${orcaWorkingAgent.toolName || 'Codando no Orca…'}`,
            done: false,
          },
        ];
      } else if (isTyping) {
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
              orcaProj && orcaProj.liveTerminalCount > 0
                ? `🐋 ${orcaProj.repoLabel} · ${orcaProj.liveTerminalCount} term ativo`
                : c.msgsCliente30d > 0
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
  }, [clientesVisiveis, clientesPausados, presencas, orcaSnapshot, getIdForSlug]);

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

      const temTrabalho = cliente.aguardando || isTyping;
      if (temTrabalho) {
        // Garante que o NPC ocupado fique sentado em sua mesa produzindo
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
      } else {
        // NPC 'Em dia': fica sentado na mesa quando não estiver no lounge
        if (ch.seatId) {
          const seat = os.seats.get(ch.seatId);
          if (
            seat &&
            ch.path.length === 0 &&
            ch.state !== CharacterState.WALK &&
            (ch.tileCol !== seat.seatCol || ch.tileRow !== seat.seatRow) &&
            ch.state !== CharacterState.IDLE
          ) {
            ch.tileCol = seat.seatCol;
            ch.tileRow = seat.seatRow;
            ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
            ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
            ch.dir = seat.facingDir;
            ch.state = CharacterState.TYPE;
          }
        }
      }

      if (isTyping) {
        os.setAgentTool(id, 'Write');
        os.clearPermissionBubble(id);
      } else if (cliente.aguardando || (cliente.dmsAguardando ?? 0) > 0) {
        os.setAgentTool(id, 'Write');
        os.showPermissionBubble(id);
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

  // Pausa periódica para Café & Lounge de personagens 'Em dia'
  useEffect(() => {
    if (!layoutReady || aba !== 'mapa') return;
    const interval = setInterval(() => {
      const os = getOfficeState();
      // Candidatos: personagens 'em dia' (não aguardando, sem presença ativa) que estejam sentados na mesa
      const candidatos = activeAgentIds.filter((id) => {
        const entry = idToCliente.get(id);
        if (!entry) return false;
        const { cliente } = entry;
        const pres = presencas[cliente.slug];
        const isTyping = pres?.status === 'typing' || pres?.status === 'recording';
        if (cliente.aguardando || isTyping) return false;
        const ch = os.characters.get(id);
        return ch && ch.state === CharacterState.TYPE && ch.seatId && ch.path.length === 0;
      });

      if (candidatos.length === 0) return;
      const idSorteado = candidatos[Math.floor(Math.random() * candidatos.length)];
      const ch = os.characters.get(idSorteado);
      if (!ch || !ch.seatId) return;

      // Posições na Copa & Café, Lounge de Ping-Pong/Arcade e Promenade Central
      const loungeSpots = [
        { col: 3, row: 4 },
        { col: 6, row: 6 },
        { col: 39, row: 5 },
        { col: 41, row: 5 },
        { col: 46, row: 4 },
        { col: 24, row: 32 },
      ];
      const spot = loungeSpots[Math.floor(Math.random() * loungeSpots.length)];
      const pathIda = findPath(ch.tileCol, ch.tileRow, spot.col, spot.row, os.tileMap, os.blockedTiles);
      if (pathIda.length > 0) {
        ch.path = pathIda;
        ch.moveProgress = 0;
        ch.state = CharacterState.WALK;
        ch.frame = 0;
        ch.frameTimer = 0;

        // Fica na copa tomando café por 12 segundos e depois retorna para a sua mesa
        setTimeout(() => {
          const currentCh = os.characters.get(idSorteado);
          if (!currentCh || !currentCh.seatId) return;
          const seat = os.seats.get(currentCh.seatId);
          if (!seat) return;
          const pathVolta = findPath(
            currentCh.tileCol,
            currentCh.tileRow,
            seat.seatCol,
            seat.seatRow,
            os.tileMap,
            os.blockedTiles,
          );
          if (pathVolta.length > 0) {
            currentCh.path = pathVolta;
            currentCh.moveProgress = 0;
            currentCh.state = CharacterState.WALK;
          } else {
            currentCh.tileCol = seat.seatCol;
            currentCh.tileRow = seat.seatRow;
            currentCh.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2;
            currentCh.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2;
            currentCh.dir = seat.facingDir;
            currentCh.state = CharacterState.TYPE;
          }
        }, 12000);
      }
    }, 24000);

    return () => clearInterval(interval);
  }, [layoutReady, aba, activeAgentIds, idToCliente, presencas, getOfficeState]);

  // Balões de fala com preview da última mensagem dos clientes
  const chatBubbles = useMemo<Record<number, ChatBubbleInfo>>(() => {
    const result: Record<number, ChatBubbleInfo> = {};
    for (const c of clientesVisiveis) {
      const id = getIdForSlug(c.slug);
      const pres = presencas[c.slug];
      const dmPendente = (c.contatosVinculados ?? []).find((ct) => ct.aguardando);
      const temMensagemSemResposta = c.aguardando || Boolean(dmPendente);
      // Toda mensagem aguardando resposta fica vermelha imediatamente no balão do NPC
      const isUrgente = temMensagemSemResposta;
      let autor: string | undefined;
      const rawPreview = c.aguardando
        ? c.ultimaPreview
        : dmPendente?.ultimaPreview ?? c.ultimaPreview;
      let texto: string | null = rawPreview;
      if (rawPreview && rawPreview.includes(': ')) {
        const parts = rawPreview.split(': ');
        autor = parts[0];
        texto = parts.slice(1).join(': ');
      } else if (dmPendente && !c.aguardando) {
        autor = `${dmPendente.nome} (DM)`;
      }
      result[id] = {
        id,
        slug: c.slug,
        nome: c.nome,
        autor,
        texto,
        aguardando: temMensagemSemResposta,
        waitingMs: c.aguardando ? c.waitingMs : (dmPendente?.waitingMs ?? 0),
        urgente: isUrgente,
        presenca: pres,
        flash: flashes[c.slug],
      };
    }
    return result;
  }, [clientesVisiveis, presencas, getIdForSlug, flashes]);

  const handleSelectAgent = useCallback(
    (id: number | null) => {
      if (id !== null) {
        playKeyClickSound();
      }
      const os = getOfficeState();
      os.selectedAgentId = id;
      setSelectedAgentId(id);
    },
    [getOfficeState],
  );

  const handleWalkToAgent = useCallback(
    (id: number) => {
      playKeyClickSound();
      const os = getOfficeState();
      const ch = os.characters.get(id);
      if (!ch) return;
      os.walkPlayerTo(ch.tileCol, ch.tileRow);
    },
    [getOfficeState],
  );

  const handleCenterPlayer = useCallback(() => {
    playKeyClickSound();
    const os = getOfficeState();
    const player = os.characters.get(PLAYER_ID);
    if (!player) {
      editor.panRef.current = { x: 0, y: 0 };
      return;
    }
    const layout = os.getLayout();
    const mapW = layout.cols * TILE_SIZE * editor.zoom;
    const mapH = layout.rows * TILE_SIZE * editor.zoom;
    editor.panRef.current = {
      x: Math.round(mapW / 2 - player.x * editor.zoom),
      y: Math.round(mapH / 2 - player.y * editor.zoom),
    };
  }, [getOfficeState, editor.panRef, editor.zoom]);

  // Atalhos globais de teclado: '/' foca busca, 'Escape' fecha seleção/busca/modo edição
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === '/' && !isEditable && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        if (mostrarAvatarModal) return;
        if (isEditable && target === searchInputRef.current) {
          if (busca) setBusca('');
          searchInputRef.current?.blur();
          return;
        }
        if (editor.isEditMode) {
          editor.handleToggleEditMode();
          return;
        }
        if (selectedAgentId !== null) {
          handleSelectAgent(null);
          setCanalDrawerSelecionado(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mostrarAvatarModal, busca, editor, selectedAgentId, handleSelectAgent]);

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

  // Calcula contadores rápidos do topo (sincronizados com o alerta vermelho imediato de sem-resposta)
  const contadores = useMemo(() => {
    const base = escopo === 'em_dev' ? clientes.filter((c) => c.emDesenvolvimento) : clientes;
    const urgentes = base.filter(
      (c) => c.aguardando && (c.band === 'hot' || c.band === 'warm'),
    ).length;
    const aguardando = base.filter((c) => c.aguardando || (c.dmsAguardando ?? 0) > 0).length;
    const emDia = Math.max(0, base.length - aguardando);
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
      className="escritorio-pixel-root flex h-full w-full flex-col overflow-hidden bg-bg text-fg"
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

      {/* Barra Superior do Escritório — Agrupada com Hierarquia Visual e Acessibilidade */}
      <header
        aria-label="Barra de controle do Escritório"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2 md:gap-2.5 md:px-4"
      >
        {/* Zona Esquerda: Modo de Visão + Escopo + Filtros de SLA */}
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          {/* 1. Switcher Escritório 2D vs Organograma */}
          <div
            role="tablist"
            aria-label="Modo de visualização"
            className="inline-flex h-8 items-center rounded-lg border border-line bg-elevated p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={aba === 'mapa'}
              onClick={() => setAba('mapa')}
              className={`inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:text-xs ${
                aba === 'mapa'
                  ? 'border border-line bg-surface text-fg shadow-xs'
                  : 'text-fg-dim hover:text-fg'
              }`}
            >
              <span aria-hidden="true">🏢</span>
              <span>Escritório 2D</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={aba === 'organograma'}
              onClick={() => setAba('organograma')}
              className={`inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:text-xs ${
                aba === 'organograma'
                  ? 'border border-line bg-surface text-fg shadow-xs'
                  : 'text-fg-dim hover:text-fg'
              }`}
            >
              <span aria-hidden="true">📊</span>
              <span>Organograma</span>
              <span className="rounded bg-surface-2 px-1.5 py-0.2 font-mono text-[10px] font-bold tabular-nums text-fg-dim">
                {clientesVisiveis.length}
              </span>
            </button>
          </div>

          {/* 2. Escopo: Em Dev vs Todos */}
          <div
            role="group"
            aria-label="Escopo de projetos nas mesas"
            className="inline-flex h-8 items-center rounded-lg border border-line bg-elevated p-0.5"
          >
            <button
              type="button"
              aria-pressed={escopo === 'em_dev'}
              onClick={() => setEscopo('em_dev')}
              className={`inline-flex h-full items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:px-2.5 ${
                escopo === 'em_dev'
                  ? 'border border-line bg-surface text-fg shadow-xs'
                  : 'text-fg-dim hover:text-fg'
              }`}
              title="Mostrar apenas projetos em desenvolvimento ativo (demais mesas ficam vazias)"
            >
              <span aria-hidden="true">💻</span>
              <span>Em Dev</span>
              <span className="font-mono text-[10px] tabular-nums opacity-75">
                {clientes.filter((c) => c.emDesenvolvimento).length}
              </span>
            </button>
            <button
              type="button"
              aria-pressed={escopo === 'todos'}
              onClick={() => setEscopo('todos')}
              className={`inline-flex h-full items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:px-2.5 ${
                escopo === 'todos'
                  ? 'border border-line bg-surface text-fg shadow-xs'
                  : 'text-fg-dim hover:text-fg'
              }`}
              title="Mostrar todos os projetos vinculados, inclusive pausados"
            >
              <span>Todos</span>
              <span className="font-mono text-[10px] tabular-nums opacity-75">
                {clientes.length}
              </span>
            </button>
          </div>

          <div className="hidden h-5 w-px bg-line lg:block" aria-hidden="true" />

          {/* 3. Barra Unificada de Filtros de Atendimento (SLA) */}
          <div
            role="group"
            aria-label="Filtrar clientes por status de resposta"
            className="hidden h-8 items-center rounded-lg border border-line bg-elevated p-0.5 md:inline-flex"
          >
            <button
              type="button"
              aria-pressed={statusFiltro === 'todos'}
              onClick={() => setStatusFiltro('todos')}
              className={`inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                statusFiltro === 'todos'
                  ? 'border border-line bg-surface text-fg shadow-xs'
                  : 'text-fg-dim hover:text-fg'
              }`}
            >
              <span>Todos</span>
              <span className="font-mono text-[10px] tabular-nums opacity-80">
                {contadores.total}
              </span>
            </button>

            <button
              type="button"
              aria-pressed={statusFiltro === 'aguardando'}
              onClick={() =>
                setStatusFiltro(statusFiltro === 'aguardando' ? 'todos' : 'aguardando')
              }
              title="Filtrar projetos com mensagem de grupo ou DM aguardando resposta"
              className={`inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                statusFiltro === 'aguardando'
                  ? 'border border-danger/50 bg-danger-bg text-danger shadow-xs'
                  : 'text-fg-dim hover:text-fg'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full bg-red-500 ${
                  contadores.aguardando > 0 ? 'animate-pulse' : 'opacity-60'
                }`}
                aria-hidden="true"
              />
              <span>Sem Resposta</span>
              <span className="font-mono text-[10px] font-bold tabular-nums">
                {contadores.aguardando}
              </span>
            </button>

            <button
              type="button"
              aria-pressed={statusFiltro === 'urgentes'}
              onClick={() =>
                setStatusFiltro(statusFiltro === 'urgentes' ? 'todos' : 'urgentes')
              }
              title="Filtrar clientes aguardando retorno há mais de 4 horas"
              className={`inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                statusFiltro === 'urgentes'
                  ? 'border border-danger bg-danger-bg text-danger shadow-xs'
                  : 'text-fg-dim hover:text-fg'
              }`}
            >
              <span className="text-[10px]" aria-hidden="true">
                🔥
              </span>
              <span>Críticos +4h</span>
              <span className="font-mono text-[10px] font-bold tabular-nums">
                {contadores.urgentes}
              </span>
            </button>

            <button
              type="button"
              aria-pressed={statusFiltro === 'em_dia'}
              onClick={() => setStatusFiltro(statusFiltro === 'em_dia' ? 'todos' : 'em_dia')}
              title="Filtrar clientes com atendimento em dia"
              className={`inline-flex h-full items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                statusFiltro === 'em_dia'
                  ? 'border border-ok/50 bg-ok-bg text-ok shadow-xs'
                  : 'text-fg-dim hover:text-fg'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>Em Dia</span>
              <span className="font-mono text-[10px] tabular-nums opacity-80">
                {contadores.emDia}
              </span>
            </button>
          </div>

          {/* 4. Indicadores de Capacidade & Orca */}
          <span
            className="hidden h-8 items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 text-[11px] font-medium tabular-nums text-fg 2xl:inline-flex"
            title="Capacidade das baias individuais no escritório"
          >
            <span aria-hidden="true">🪑</span>
            <strong className="font-mono text-fg">{contadores.mesasOcupadas}</strong>/
            {TOTAL_MESAS_ESCRITORIO} mesas
          </span>

          {orcaSnapshot?.available && (
            <span
              className="hidden h-8 items-center gap-1.5 rounded-lg border border-ok/40 bg-ok-bg px-2.5 text-[11px] font-semibold tabular-nums text-ok xl:inline-flex"
              title={`Conectado ao Orca (${orcaSnapshot.source === 'local-cli' ? 'CLI Local' : 'Remote Sync'}) · ${orcaSnapshot.allWorktreesCount} worktrees`}
            >
              <span aria-hidden="true">🐋</span>
              <span>Orca</span>
              <strong className="font-mono">{orcaSnapshot.activeAgentsCount} ativos</strong>
            </span>
          )}
        </div>

        {/* Zona Direita: Busca + Camadas do Mapa + Ambiente/Áudio + Ações */}
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          {/* Campo de Busca com atalho '/' e botão Limpar */}
          <div role="search" className="relative flex items-center">
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 text-fg-dim"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar projeto, repositório ou contato (atalho: tecla /)"
              placeholder="Buscar projeto ou contato…"
              className="h-8 w-40 rounded-lg border border-line bg-elevated pr-7 pl-7 text-[12px] font-medium text-fg placeholder:text-fg-faint transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-52"
            />
            {busca ? (
              <button
                type="button"
                onClick={() => {
                  setBusca('');
                  searchInputRef.current?.focus();
                }}
                aria-label="Limpar busca"
                title="Limpar busca (Esc)"
                className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded text-[11px] text-fg-dim hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                ✕
              </button>
            ) : (
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute right-2 hidden rounded border border-line bg-surface px-1 font-mono text-[10px] font-medium text-fg-dim sm:inline-block"
              >
                /
              </kbd>
            )}
          </div>

          {aba === 'mapa' && (
            <>
              {/* Grupo 1: Camadas de Visão do Mapa (Lista Lateral, Salas, Balões) */}
              <div
                role="group"
                aria-label="Camadas visuais do mapa"
                className="inline-flex h-8 items-center rounded-lg border border-line bg-elevated p-0.5"
              >
                <button
                  type="button"
                  aria-pressed={mostrarRoster}
                  onClick={() => setMostrarRoster((v) => !v)}
                  className={`inline-flex h-full items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:px-2.5 ${
                    mostrarRoster
                      ? 'border border-line bg-surface text-fg shadow-xs'
                      : 'text-fg-dim hover:text-fg'
                  }`}
                  title="Mostrar/ocultar lista lateral de projetos e contatos"
                >
                  <span aria-hidden="true">👥</span>
                  <span>Lista</span>
                  <span className="font-mono text-[10px] tabular-nums opacity-75">
                    {clientesVisiveis.length}
                  </span>
                </button>

                <button
                  type="button"
                  aria-pressed={mostrarAreas}
                  onClick={() => setMostrarAreas((v) => !v)}
                  className={`inline-flex h-full items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    mostrarAreas
                      ? 'border border-line bg-surface text-fg shadow-xs'
                      : 'text-fg-dim hover:text-fg'
                  }`}
                  title="Mostrar/ocultar placas com os nomes das salas no mapa"
                >
                  <span aria-hidden="true">🏷️</span>
                  <span className="hidden lg:inline">Salas</span>
                </button>

                <button
                  type="button"
                  aria-pressed={mostrarBaloes}
                  onClick={() => {
                    playKeyClickSound();
                    setMostrarBaloes((v) => !v);
                  }}
                  className={`inline-flex h-full items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    mostrarBaloes
                      ? 'border border-line bg-surface text-fg shadow-xs'
                      : 'text-fg-dim hover:text-fg'
                  }`}
                  title="Mostrar/ocultar balões de mensagens recentes e digitação dos NPCs"
                >
                  <span aria-hidden="true">💬</span>
                  <span className="hidden lg:inline">Balões</span>
                </button>
              </div>

              {/* Grupo 2: Ambiente, Clima & Áudio (Iluminação, Natal, Rádio Chill, Alerta Sonoro) */}
              <div
                role="group"
                aria-label="Ambiente, iluminação e som"
                className="inline-flex h-8 items-center rounded-lg border border-line bg-elevated p-0.5"
              >
                {/* Ciclo Dia / Tarde / Noite */}
                {(() => {
                  const infoFase = getInfoFase(faseIluminacao);
                  return (
                    <button
                      type="button"
                      onClick={handleCycleIluminacao}
                      aria-label={`Iluminação atual: ${infoFase.rotulo} (${cicloModo}). Clique para alternar`}
                      className="inline-flex h-full items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-fg transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      title={`Iluminação: ${infoFase.rotulo} (${infoFase.descricao}) · Modo: ${cicloModo}. Clique para alternar.`}
                    >
                      <span aria-hidden="true">{infoFase.icone}</span>
                      <span className="hidden 2xl:inline">
                        {cicloModo === 'auto' ? `Auto (${infoFase.rotulo})` : infoFase.rotulo}
                      </span>
                    </button>
                  );
                })()}

                {/* Decoração de Natal & Luzes */}
                <button
                  type="button"
                  aria-pressed={natalAtivo}
                  aria-label={natalAtivo ? 'Desativar decoração de Natal' : 'Ativar decoração de Natal'}
                  onClick={handleToggleNatal}
                  className={`inline-flex h-full items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    natalAtivo
                      ? 'border border-ok/40 bg-ok-bg text-ok shadow-xs'
                      : 'text-fg-dim hover:bg-surface hover:text-fg'
                  }`}
                  title="Ativar/desativar árvores de Natal iluminadas, pisca-piscas e presentes no parque"
                >
                  <span aria-hidden="true">🎄</span>
                  <span className="hidden 2xl:inline">{natalAtivo ? 'Natal' : 'Natal Off'}</span>
                </button>

                <div className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />

                {/* Rádio Ambiente Relax & Progresso (Lo-Fi / Campo / Natal) */}
                {(() => {
                  const st =
                    AMBIENT_STATIONS.find((s) => s.id === estacaoMusica) ?? AMBIENT_STATIONS[0];
                  return (
                    <div className="inline-flex h-full items-center">
                      <button
                        type="button"
                        aria-pressed={musicaAtiva}
                        onClick={handleToggleMusica}
                        className={`inline-flex h-full items-center gap-1 rounded-l-md px-2 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          musicaAtiva
                            ? 'bg-accent text-accent-ink shadow-xs'
                            : 'text-fg-dim hover:bg-surface hover:text-fg'
                        }`}
                        title={
                          musicaAtiva
                            ? `Pausar música ambiente (${st.label}: ${st.desc})`
                            : `Tocar música relaxante de fundo (${st.label}: ${st.desc})`
                        }
                      >
                        <span aria-hidden="true">{musicaAtiva ? '🎵' : '🎧'}</span>
                        <span className="hidden sm:inline">
                          {musicaAtiva ? st.shortLabel : 'Rádio'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCycleEstacaoMusica}
                        aria-label={`Trocar estação musical (atual: ${st.label})`}
                        className="inline-flex h-full items-center rounded-r-md border-l border-line px-1.5 text-[10px] font-semibold text-fg-dim transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        title={`Trocar estilo musical (atual: ${st.emoji} ${st.label})`}
                      >
                        <span aria-hidden="true">{st.emoji} ▾</span>
                      </button>
                    </div>
                  );
                })()}

                {/* Alerta Sonoro de Mensagem */}
                <button
                  type="button"
                  aria-pressed={somAtivo}
                  aria-label={
                    somAtivo
                      ? 'Alerta sonoro ativado. Clique para silenciar'
                      : 'Alerta sonoro silenciado. Clique para ativar'
                  }
                  onClick={handleToggleSound}
                  className={`hidden h-full items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:inline-flex ${
                    somAtivo
                      ? 'border border-warn-mark/60 bg-warn-bg text-warn shadow-xs'
                      : 'text-fg-dim hover:bg-surface hover:text-fg'
                  }`}
                  title="Aviso sonoro quando um cliente entrar em espera"
                >
                  <span aria-hidden="true">{somAtivo ? '🔔' : '🔕'}</span>
                  <span className="hidden xl:inline">{somAtivo ? 'Som' : 'Mudo'}</span>
                </button>
              </div>

              {/* Grupo 3: Avatar ("Você") & Modo Editor do Mapa */}
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={mostrarAvatarModal}
                onClick={() => {
                  playKeyClickSound();
                  setMostrarAvatarModal(true);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 text-[11px] font-semibold text-fg transition-colors hover:border-line-2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                title="Personalizar seu personagem ('Você') no mapa"
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line bg-[#161822]">
                  <CharSprite charIndex={playerPalette} size={16} />
                </div>
                <span className="hidden sm:inline">Você</span>
              </button>

              <button
                type="button"
                aria-pressed={editor.isEditMode}
                onClick={editor.handleToggleEditMode}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:px-3 ${
                  editor.isEditMode
                    ? 'border-accent bg-accent text-accent-ink shadow-xs'
                    : 'border-line bg-elevated text-fg hover:border-line-2 hover:bg-surface'
                }`}
                title={
                  editor.isEditMode
                    ? 'Sair do modo de edição do mapa (Esc)'
                    : 'Editar móveis, paredes e pisos do escritório'
                }
              >
                <span aria-hidden="true">{editor.isEditMode ? '✓' : '🛠️'}</span>
                <span>{editor.isEditMode ? 'Concluir' : 'Editar'}</span>
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
                aria-hidden="true"
                className="fixed inset-0 z-40 bg-black/50 md:hidden"
                onClick={() => setMostrarRoster(false)}
              />
            )}

            {/* Mini-Roster Lateral de Clientes no Escritório */}
            {mostrarRoster && (
              <aside
                aria-label="Lista de projetos e clientes nas mesas"
                className="flex h-full w-72 shrink-0 flex-col border-r border-line bg-surface max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-76 max-md:shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-2.5">
                  <div>
                    <span className="text-[11px] font-bold tracking-wider uppercase text-fg">
                      🪑 Nas Mesas ({clientesVisiveis.length}/{TOTAL_MESAS_ESCRITORIO})
                    </span>
                    <div className="text-[11px] font-medium tabular-nums text-fg-dim">
                      {contadores.mesasVazias} baias vazias no escritório
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={expandirTodosContatos}
                      onClick={() => setExpandirTodosContatos((v) => !v)}
                      title="Expandir ou recolher contatos e DMs de todos os projetos"
                      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        expandirTodosContatos
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-line bg-surface text-fg-dim hover:bg-elevated hover:text-fg'
                      }`}
                    >
                      <span aria-hidden="true">👥</span>
                      <span>Contatos {expandirTodosContatos ? '▴' : '▾'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMostrarRoster(false)}
                      aria-label="Fechar lista lateral"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-xs text-fg-dim hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
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

                    const toggleProjeto = () => {
                      if (selecionado) {
                        handleSelectAgent(null);
                        setCanalDrawerSelecionado(null);
                      } else {
                        setAbaDrawerInicial('whatsapp');
                        handleSelectAgent(id);
                        setCanalDrawerSelecionado(null);
                        setExpandedProjetos((prev) => ({ ...prev, [c.slug]: true }));
                      }
                      if (typeof window !== 'undefined' && window.innerWidth < 768) {
                        setMostrarRoster(false);
                      }
                    };

                    return (
                      <div key={c.slug} className="flex flex-col">
                        <div
                          role="button"
                          tabIndex={0}
                          aria-pressed={selecionado}
                          aria-label={`${c.nome}, Baia #${baiaNum}, ${
                            c.aguardando
                              ? `aguardando resposta há ${c.waitingLabel ?? 'pendente'}`
                              : dmsPendentes > 0
                                ? `${dmsPendentes} DM aguardando`
                                : 'em dia'
                          }`}
                          onClick={toggleProjeto}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleProjeto();
                            }
                          }}
                          className={`flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                            selecionado
                              ? 'bg-selected text-fg ring-1 ring-inset ring-accent/40'
                              : 'hover:bg-surface-2'
                          }`}
                        >
                          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-[#161822]">
                            <CharSprite charIndex={palette} size={24} />
                            {selecionado && (
                              <span
                                aria-hidden="true"
                                className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full border border-surface bg-accent"
                              />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  m?.pulse ? 'animate-pulse' : ''
                                }`}
                                style={{ background: m?.dotColor ?? '#22c55e' }}
                              />
                              <span className="truncate text-[12.5px] font-semibold text-fg">
                                {c.nome}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center justify-between gap-1 text-[11px] font-medium text-fg-dim">
                              <span className="truncate">
                                Baia #{baiaNum} ·{' '}
                                {c.aguardando && c.waitingLabel
                                  ? `Sem resposta (${c.waitingLabel})`
                                  : dmsPendentes > 0
                                    ? `🔴 ${dmsPendentes} DM sem resposta`
                                    : c.repoNome
                                      ? c.repoNome
                                      : 'Em dev'}
                              </span>
                              {c.msgsCliente30d > 0 && (
                                <span className="shrink-0 font-mono text-[10.5px] font-semibold tabular-nums text-fg-dim">
                                  {c.msgsCliente30d}m
                                </span>
                              )}
                            </div>

                            {(() => {
                              const orcaProj = orcaSnapshot?.bySlug?.[c.slug];
                              if (!orcaProj || orcaProj.liveTerminalCount === 0) return null;
                              const ag = orcaProj.agents[0];
                              const working = orcaProj.status === 'working';
                              const monitoring = orcaProj.status === 'monitoring';
                              return (
                                <div className="mt-1 flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAbaDrawerInicial('orca');
                                      handleSelectAgent(id);
                                      if (
                                        typeof window !== 'undefined' &&
                                        window.innerWidth < 768
                                      ) {
                                        setMostrarRoster(false);
                                      }
                                    }}
                                    title="Abrir chat e terminal deste agente no Orca"
                                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                      working
                                        ? 'border-ok/40 bg-ok-bg text-ok'
                                        : monitoring
                                          ? 'border-accent-line bg-accent-soft text-info'
                                          : 'border-line-2 bg-elevated text-fg-dim hover:text-fg'
                                    }`}
                                  >
                                    <span aria-hidden="true">🐋</span>
                                    <span className="uppercase">{ag?.agentType ?? 'orca'}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {working
                                        ? `⚡ ${ag?.toolName || 'Codando'}`
                                        : monitoring
                                          ? '👁️ Plantão'
                                          : `${orcaProj.liveTerminalCount} term`}
                                    </span>
                                  </button>
                                </div>
                              );
                            })()}
                          </div>

                          {contatos.length > 0 && (
                            <button
                              type="button"
                              aria-expanded={aberto}
                              aria-label={`${
                                aberto ? 'Recolher' : 'Expandir'
                              } ${contatos.length} contatos de ${c.nome}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedProjetos((prev) => ({
                                  ...prev,
                                  [c.slug]: !aberto,
                                }));
                              }}
                              title="Mostrar/ocultar contatos e conversas fora do grupo"
                              className={`inline-flex h-6 shrink-0 items-center gap-0.5 rounded border px-1.5 text-[10px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                dmsPendentes > 0
                                  ? 'border-danger/50 bg-danger-bg text-danger'
                                  : aberto
                                    ? 'border-line-2 bg-elevated text-fg'
                                    : 'border-line bg-surface-2 text-fg-dim hover:text-fg'
                              }`}
                            >
                              <span aria-hidden="true">{dmsPendentes > 0 ? '💬' : '👥'}</span>
                              <span className="font-mono">{contatos.length}</span>
                              <span aria-hidden="true">{aberto ? '▴' : '▾'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            aria-label={`Caminhar até a mesa de ${c.nome}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectAgent(id);
                              handleWalkToAgent(id);
                            }}
                            title="Ir até a mesa com seu personagem"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs text-fg-dim transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            🚶
                          </button>
                        </div>

                        {/* Dropdown de Contatos do Grupo + DMs Monitoradas */}
                        {aberto && contatos.length > 0 && (
                          <div className="border-t border-line bg-surface-2 pt-1 pr-2.5 pb-1.5 pl-6">
                            {contatos.map((ct, cIdx) => {
                              const ehUltimo = cIdx === contatos.length - 1;
                              const temDm = Boolean(ct.dmSlug);
                              const dmAtivaNoDrawer =
                                selecionado &&
                                temDm &&
                                canalDrawerSelecionado !== null &&
                                (ct.dmSlug === canalDrawerSelecionado ||
                                  ct.dmSlugs.includes(canalDrawerSelecionado));

                              const selectContato = () => {
                                handleSelectAgent(id);
                                if (temDm && ct.dmSlug) {
                                  setCanalDrawerSelecionado(ct.dmSlug);
                                } else {
                                  setCanalDrawerSelecionado(null);
                                }
                                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                                  setMostrarRoster(false);
                                }
                              };

                              return (
                                <div
                                  key={ct.id}
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`Contato ${ct.nome} (${temDm ? 'DM' : 'Grupo'})`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectContato();
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      selectContato();
                                    }
                                  }}
                                  className={`group flex cursor-pointer flex-col rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                    dmAtivaNoDrawer
                                      ? 'bg-selected font-semibold text-fg ring-1 ring-inset ring-accent/40'
                                      : ct.aguardando
                                        ? 'bg-danger-bg/60 text-fg hover:bg-danger-bg'
                                        : 'text-fg-dim hover:bg-elevated hover:text-fg'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1.5">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      <span
                                        aria-hidden="true"
                                        className="font-mono text-[10px] text-fg-dim"
                                      >
                                        {ehUltimo ? '└─' : '├─'}
                                      </span>
                                      <span aria-hidden="true" className="shrink-0 text-[11px]">
                                        {temDm ? '💬' : '👤'}
                                      </span>
                                      <span className="truncate font-semibold text-fg">
                                        {ct.nome}
                                      </span>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1">
                                      {ct.aguardando ? (
                                        <span className="inline-flex items-center gap-1 rounded border border-danger/30 bg-danger-bg px-1.5 py-0.2 font-mono text-[9.5px] font-bold tabular-nums text-danger">
                                          <span
                                            aria-hidden="true"
                                            className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"
                                          />
                                          {ct.waitingLabel ?? 'DM'}
                                        </span>
                                      ) : temDm ? (
                                        <span
                                          className="rounded border border-line bg-surface px-1.5 py-0.2 font-mono text-[9.5px] font-medium tabular-nums text-fg-dim"
                                          title={`Chat individual monitorado (${ct.dmSlug})`}
                                        >
                                          {ct.atividadeLabel
                                            ? `DM · ${ct.atividadeLabel}`
                                            : `DM · ${ct.mensagensDm}m`}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-medium text-fg-dim">
                                          grupo
                                        </span>
                                      )}

                                      {temDm && ct.dmSlug && (
                                        <Link
                                          href={`/g/${encodeURIComponent(ct.dmSlug)}`}
                                          onClick={(e) => e.stopPropagation()}
                                          aria-label={`Abrir conversa completa de ${ct.nome}`}
                                          title={`Abrir conversa individual de ${ct.nome}`}
                                          className="rounded px-1 text-[10px] font-semibold text-fg-dim hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                        >
                                          ↗
                                        </Link>
                                      )}
                                    </div>
                                  </div>

                                  {temDm && ct.ultimaPreview && (
                                    <div className="mt-0.5 truncate pl-6 text-[10.5px] font-normal text-fg-dim">
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
                    <div className="bg-surface-2">
                      <button
                        type="button"
                        aria-expanded={mostrarPausados}
                        onClick={() => setMostrarPausados((v) => !v)}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[11px] font-bold tracking-wider uppercase text-fg-dim transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                      >
                        <span>
                          💤 Fora de Dev / Mesa Vazia ({clientesPausados.length})
                        </span>
                        <span aria-hidden="true">{mostrarPausados ? '▾' : '▸'}</span>
                      </button>

                      {mostrarPausados && (
                        <div className="divide-y divide-line border-t border-line">
                          {clientesPausados.map((c) => {
                            const id = getIdForSlug(c.slug);
                            const selecionado = selectedAgentId === id;
                            return (
                              <div
                                key={c.slug}
                                role="button"
                                tabIndex={0}
                                aria-pressed={selecionado}
                                onClick={() => handleSelectAgent(selecionado ? null : id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleSelectAgent(selecionado ? null : id);
                                  }
                                }}
                                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                                  selecionado
                                    ? 'bg-selected text-fg ring-1 ring-inset ring-accent/40'
                                    : 'text-fg-dim hover:bg-elevated hover:text-fg'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-semibold text-fg">{c.nome}</div>
                                  <div className="truncate text-[10.5px] text-fg-dim">
                                    Mesa vazia · {c.repoNome ?? '0 msgs (30d)'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleMesa(c.slug, 'ocupar_mesa');
                                  }}
                                  className="shrink-0 rounded border border-ok/40 bg-ok-bg px-2 py-0.5 text-[10px] font-semibold text-ok transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                    faseIluminacao={faseIluminacao}
                    natalAtivo={natalAtivo}
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

                  <ChatBubblesOverlay
                    officeState={officeState}
                    bubbles={chatBubbles}
                    containerRef={containerRef}
                    zoom={editor.zoom}
                    panRef={editor.panRef}
                    visible={mostrarBaloes && !editor.isEditMode}
                    onSelectAgent={(id) => handleSelectAgent(id)}
                  />

                  <ZoomControls
                    zoom={editor.zoom}
                    onZoomChange={editor.handleZoomChange}
                    onCenterPlayer={handleCenterPlayer}
                  />

                  {/* Vignette suave */}
                  <div
                    aria-hidden="true"
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

                  {/* Barra Flutuante de Ações Rápidas (1-Click HUD) */}
                  {selectedEntry && selectedAgentId !== null && !editor.isEditMode && (
                    <QuickActionHud
                      cliente={selectedEntry.cliente}
                      palette={selectedEntry.palette}
                      baiaIndex={selectedEntry.baiaIndex}
                      onWalkTo={() => handleWalkToAgent(selectedAgentId)}
                      onOpenDrawer={() => {
                        setAbaDrawerInicial('whatsapp');
                      }}
                      onOpenOrca={() => {
                        setAbaDrawerInicial('orca');
                      }}
                      onClose={() => handleSelectAgent(null)}
                    />
                  )}

                  {/* Dica de Controles de Movimento (canto inferior esquerdo — recolhível e semântico) */}
                  {!editor.isEditMode && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 12,
                        left: 12,
                        zIndex: 45,
                      }}
                      className="flex items-center gap-2 rounded-xl border border-white/15 bg-[#121420]/90 px-2.5 py-1.5 text-[10.5px] text-white/80 shadow-xl backdrop-blur-md sm:text-[11px]"
                    >
                      {mostrarDicasTeclado ? (
                        <>
                          <span className="hidden items-center gap-1 sm:inline-flex">
                            <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                              WASD
                            </kbd>
                            <span>Andar</span>
                            <span className="mx-0.5 text-white/30" aria-hidden="true">
                              ·
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                              Arrastar
                            </kbd>
                            <span>Câmera</span>
                          </span>
                          <span className="text-white/30" aria-hidden="true">
                            ·
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                              Clique
                            </kbd>
                            <span>Andar / Abrir Ficha</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setMostrarDicasTeclado(false)}
                            aria-label="Ocultar legenda de controles"
                            title="Ocultar legenda de controles"
                            className="ml-1 flex h-5 w-5 items-center justify-center rounded text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMostrarDicasTeclado(true)}
                          aria-label="Mostrar atalhos e controles do mapa"
                          title="Mostrar controles do mapa"
                          className="inline-flex items-center gap-1 px-1 py-0.5 font-semibold text-white/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                          <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.2 font-mono text-[10px] text-white">
                            ?
                          </kbd>
                          <span>Controles</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Barra Superior de Ações do Editor (Undo / Redo / Salvar / Restaurar Padrão) */}
                  {editor.isEditMode && (
                    <>
                      <div
                        role="toolbar"
                        aria-label="Ações de edição do mapa"
                        style={{
                          position: 'absolute',
                          top: 12,
                          left: 12,
                          zIndex: 'var(--pixel-controls-z)',
                        }}
                        className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/15 bg-[#141624]/95 p-1.5 shadow-2xl backdrop-blur-md"
                      >
                        <button
                          type="button"
                          onClick={editor.handleUndo}
                          disabled={editorState.undoStack.length === 0}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:pointer-events-none disabled:opacity-35"
                          title="Desfazer (Ctrl+Z)"
                        >
                          <span aria-hidden="true">↶</span>
                          <span>Desfazer</span>
                        </button>
                        <button
                          type="button"
                          onClick={editor.handleRedo}
                          disabled={editorState.redoStack.length === 0}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:pointer-events-none disabled:opacity-35"
                          title="Refazer (Ctrl+Y)"
                        >
                          <span aria-hidden="true">↷</span>
                          <span>Refazer</span>
                        </button>
                        <div className="mx-0.5 h-5 w-px bg-white/15" aria-hidden="true" />
                        <button
                          type="button"
                          onClick={editor.handleSave}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-600 px-3 text-xs font-semibold text-white shadow transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        >
                          <span aria-hidden="true">💾</span>
                          <span>Salvar Mapa</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleResetDefaultMap}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          title="Restaurar mapa original de fábrica"
                        >
                          <span aria-hidden="true">↺</span>
                          <span>Restaurar Padrão</span>
                        </button>
                        {showRotateHint && (
                          <span className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 text-xs text-amber-200">
                            <kbd className="rounded border border-amber-400/40 bg-amber-500/20 px-1 font-mono text-[10px] font-bold">
                              R
                            </kbd>{' '}
                            girar ·{' '}
                            <kbd className="rounded border border-amber-400/40 bg-amber-500/20 px-1 font-mono text-[10px] font-bold">
                              T
                            </kbd>{' '}
                            estado ·{' '}
                            <kbd className="rounded border border-amber-400/40 bg-amber-500/20 px-1 font-mono text-[10px] font-bold">
                              Del
                            </kbd>{' '}
                            remover
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
            orcaInfo={orcaSnapshot?.bySlug?.[selectedEntry.cliente.slug] ?? null}
            orcaAvailable={Boolean(orcaSnapshot?.available)}
            onRefreshOrca={refreshOrca}
            abaInicial={abaDrawerInicial}
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

      {/* Modal de Personalização do Avatar ("Você") */}
      <PlayerAvatarModal
        currentPalette={playerPalette}
        isOpen={mostrarAvatarModal}
        onSelectPalette={handleSelectPlayerPalette}
        onClose={() => setMostrarAvatarModal(false)}
      />
    </div>
  );
}
