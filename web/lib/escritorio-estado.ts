import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { type CaixaEntrada, caixaDeEntrada } from './caixa-de-entrada';
import { type ClienteLinha, ordenarCards, primeiraLinha, rotuloTempo, tipoDoSlug } from './clientes';
import { cloudEnabled, cloudJson } from './cloud';
import { CONTRATO_PADRAO } from './contratos';
import type { Dashboard, LinhaDashboard } from './dashboard';
import { montarDashboardAtual } from './dashboard-atual';
import { type GroupSummary, listGroups } from './data';
import { writeJsonAtomic } from './json-store';
import { type LinksMap, readLinks } from './links';
import { safeDataPath } from './paths';
import type { PresenceView } from './presence';
import type { SlaBand } from './sla';
import { readTriage, type TriageState } from './triage';

let envLoaded = false;

/**
 * Carrega variáveis `WAC_CLOUD_*` do `.env` da raiz do monorepo caso o `next dev`
 * tenha sido iniciado de dentro de `web/` sem herdá-las.
 */
export function ensureRootCloudEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  if (process.env.WAC_CLOUD_URL) return;

  const candidates = [
    resolve(/* turbopackIgnore: true */ process.cwd(), '..', '.env'),
    resolve(/* turbopackIgnore: true */ process.cwd(), '.env'),
  ];

  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (key.startsWith('WAC_') && !process.env[key]) {
          process.env[key] = val;
        }
      }
      break;
    } catch {
      // ignora erro de leitura
    }
  }
}

export interface ContatoCustomConfig {
  id?: string;
  nome: string;
  papel?: string;
  dmSlug?: string | null;
}

export interface ContatoProjetoEscritorio {
  id: string;
  nome: string;
  papel?: string;
  /** Slug principal da DM monitorada, se houver (ex.: "dm-5511999999999") */
  dmSlug: string | null;
  /** Todos os slugs de DM associados a esta pessoa (ex.: telefone + LID) */
  dmSlugs: string[];
  aguardando: boolean;
  waitingMs: number;
  waitingLabel: string | null;
  band: SlaBand | null;
  ultimaPreview: string | null;
  ultimaTimestamp: string | null;
  atividadeLabel: string | null;
  mensagensDm: number;
  custom?: boolean;
}

export interface DmDisponivelEscritorio {
  slug: string;
  nome: string;
  ultimaTimestamp: string | null;
  atividadeLabel: string | null;
  mensagens: number;
}

export interface ClienteAssentosConfig {
  /** Slugs explicitamente colocados em mesa pelo operador */
  fixados?: string[];
  /** Slugs explicitamente removidos de mesa ("não desenvolvendo") pelo operador */
  ocultos?: string[];
  /** Mapa opcional slug -> seatUid preferido */
  assentosPorSlug?: Record<string, string>;
  /** Contatos e DMs extras vinculados manualmente pelo operador por slug de projeto */
  contatosExtrasPorProjeto?: Record<string, ContatoCustomConfig[]>;
}

export interface ClienteEscritorio extends ClienteLinha {
  /** Se o projeto está em desenvolvimento ativo (deve ocupar uma mesa no escritório) */
  emDesenvolvimento: boolean;
  /** Nome amigável do projeto/cliente vindo do links.json */
  projetoNome: string | null;
  /** Nome da pasta do repositório vinculado */
  repoNome: string | null;
  /** Repositório GitHub (owner/repo) se vinculado */
  github: string | null;
  /** Marcado manualmente pelo operador para ocupar mesa */
  fixadoMesa: boolean;
  /** Marcado manualmente pelo operador como fora de desenvolvimento (mesa vazia) */
  ocultoMesa: boolean;
  /** Contatos do grupo e DMs individuais monitoradas vinculadas ao projeto */
  contatosVinculados: ContatoProjetoEscritorio[];
  /** Quantidade de DMs vinculadas que estão aguardando resposta fora do grupo */
  dmsAguardando: number;
}

const ASSENTOS_FILE = () => safeDataPath('.escritorio-assentos.json');

export async function lerConfigAssentos(): Promise<ClienteAssentosConfig> {
  try {
    const raw = await readFile(ASSENTOS_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ClienteAssentosConfig) : {};
  } catch {
    return {};
  }
}

export async function salvarConfigAssentos(
  patch: Partial<ClienteAssentosConfig>,
): Promise<ClienteAssentosConfig> {
  const atual = await lerConfigAssentos();
  const proximo: ClienteAssentosConfig = {
    ...atual,
    ...patch,
    fixados: patch.fixados ?? atual.fixados ?? [],
    ocultos: patch.ocultos ?? atual.ocultos ?? [],
    assentosPorSlug: {
      ...(atual.assentosPorSlug ?? {}),
      ...(patch.assentosPorSlug ?? {}),
    },
    contatosExtrasPorProjeto:
      patch.contatosExtrasPorProjeto ?? atual.contatosExtrasPorProjeto ?? {},
  };
  await writeJsonAtomic(ASSENTOS_FILE(), proximo);
  estadoCache = null;
  return proximo;
}

interface ContatoDefinicaoBase {
  nome: string;
  papel?: string;
  dmSlugs?: string[];
}

/**
 * Catálogo do escritório, mantido pelo operador em `DATA_DIR/.escritorio-catalogo.json`
 * (fora do git, porque descreve clientes e contatos reais):
 * - `ignorar`: grupos internos, de teste ou DMs da própria equipe que nunca ocupam mesa;
 * - `projetosExtras`: projetos ativos que ainda não estão no links.json;
 * - `nomesCurtos`: nome de exibição na baia;
 * - `contatosPorProjeto`: quem participa de cada projeto e as DMs a vigiar.
 */
export interface CatalogoEscritorio {
  ignorar: string[];
  projetosExtras: Record<string, { cliente: string; repo: string }>;
  nomesCurtos: Record<string, string>;
  contatosPorProjeto: Record<string, ContatoDefinicaoBase[]>;
}

const CATALOGO_FILE = () => safeDataPath('.escritorio-catalogo.json');

export const CATALOGO_VAZIO: CatalogoEscritorio = {
  ignorar: ['teste'],
  projetosExtras: {},
  nomesCurtos: {},
  contatosPorProjeto: {},
};

export async function lerCatalogoEscritorio(): Promise<CatalogoEscritorio> {
  try {
    const bruto = JSON.parse(await readFile(CATALOGO_FILE(), 'utf8')) as Partial<CatalogoEscritorio>;
    return {
      ignorar: Array.isArray(bruto.ignorar) ? bruto.ignorar : CATALOGO_VAZIO.ignorar,
      projetosExtras: bruto.projetosExtras ?? {},
      nomesCurtos: bruto.nomesCurtos ?? {},
      contatosPorProjeto: bruto.contatosPorProjeto ?? {},
    };
  } catch {
    return CATALOGO_VAZIO;
  }
}

function contratoTerminadoPeloNome(nome: string): boolean {
  const m = nome.match(/TERMINA\s+EM\s+(\d{2})\/(\d{2})\/(\d{4})/i);
  if (!m) return false;
  const [, dd, mm, yyyy] = m;
  const fimMs = Date.parse(`${yyyy}-${mm}-${dd}T23:59:59-03:00`);
  return !Number.isNaN(fimMs) && Date.now() > fimMs;
}

export interface EstadoEscritorioPayload {
  clientes: ClienteEscritorio[];
  presencas: Record<string, PresenceView>;
  autonomo: Record<string, boolean>;
  notas: Record<string, string>;
  assentos: ClienteAssentosConfig;
  dmsDisponiveis?: DmDisponivelEscritorio[];
  updatedAt: string;
}

const CACHE_FRESH_MS = 3_000;
const CACHE_STALE_MS = 60_000;

let estadoCache: { atualizadoEm: number; payload: EstadoEscritorioPayload } | null = null;
let refreshInFlight: Promise<EstadoEscritorioPayload> | null = null;

function resolverContatosDoProjeto(
  slug: string,
  repoNome: string | null,
  links: LinksMap,
  caixaBySlug: Map<string, CaixaEntrada['itens'][number]>,
  summaryBySlug: Map<string, GroupSummary>,
  assentos: ClienteAssentosConfig,
  agora: number,
  catalogo: CatalogoEscritorio,
): ContatoProjetoEscritorio[] {
  const baseDefs: Array<ContatoDefinicaoBase & { custom?: boolean }> = [
    ...(catalogo.contatosPorProjeto[slug] ?? []),
  ];

  // Anexa DMs vinculadas ao mesmo repo no links.json que ainda não estejam na lista
  if (repoNome) {
    for (const [otherSlug, l] of Object.entries(links)) {
      if (!otherSlug.startsWith('dm-')) continue;
      const otherRepo = l.repoPath ? basename(l.repoPath) : null;
      if (otherRepo !== repoNome) continue;
      const jaTem = baseDefs.some((d) => (d.dmSlugs ?? []).includes(otherSlug));
      if (!jaTem) {
        const sum = summaryBySlug.get(otherSlug);
        baseDefs.push({
          nome: l.cliente || sum?.name || otherSlug,
          papel: 'Cliente',
          dmSlugs: [otherSlug],
        });
      }
    }
  }

  // Contatos/DMs customizados adicionados manualmente pelo operador
  const extras = assentos.contatosExtrasPorProjeto?.[slug] ?? [];
  for (const ex of extras) {
    if (!ex.nome?.trim()) continue;
    baseDefs.push({
      nome: ex.nome.trim(),
      papel: ex.papel?.trim() || 'Contato',
      dmSlugs: ex.dmSlug ? [ex.dmSlug] : [],
      custom: true,
    });
  }

  const out: ContatoProjetoEscritorio[] = [];

  for (let i = 0; i < baseDefs.length; i++) {
    const def = baseDefs[i];
    const dmSlugs = Array.from(new Set((def.dmSlugs ?? []).filter(Boolean)));
    const dmSlugPrincipal = dmSlugs[0] ?? null;

    let ultimaTimestamp: string | null = null;
    let ultimaTimestampMs = 0;
    let ultimaPreview: string | null = null;
    let ultimaRespostaMinhaMs = 0;
    let mensagensDm = 0;

    for (const ds of dmSlugs) {
      const sum = summaryBySlug.get(ds);
      const cx = caixaBySlug.get(ds);
      mensagensDm += sum?.messageCount ?? 0;

      const ts = cx?.ultima?.quando ?? sum?.lastTimestamp ?? null;
      const prev = cx?.ultima?.previa ?? sum?.lastPreview ?? null;
      const tsMs = ts ? Date.parse(ts) : 0;

      if (prev && prev.startsWith('Você:') && tsMs > ultimaRespostaMinhaMs) {
        ultimaRespostaMinhaMs = tsMs;
      }

      if (tsMs > ultimaTimestampMs) {
        ultimaTimestampMs = tsMs;
        ultimaTimestamp = ts;
        ultimaPreview = prev;
      }
    }

    // Verifica se alguma DM deste contato está aguardando resposta (e não foi respondida em um slug irmão mais recente)
    let aguardando = false;
    let waitingMs = 0;
    let waitingLabel: string | null = null;
    let band: SlaBand | null = null;

    for (const ds of dmSlugs) {
      const cx = caixaBySlug.get(ds);
      const esp = cx?.esperando;
      if (!esp) continue;
      const ultimaClienteMs = cx?.ultima?.quando
        ? Date.parse(cx.ultima.quando)
        : Date.parse(esp.desde);
      // Se o operador já respondeu mais recentemente no outro DM slug da mesma pessoa (ex.: telefone vs LID), não está pendente
      if (ultimaRespostaMinhaMs > 0 && ultimaRespostaMinhaMs > ultimaClienteMs) {
        continue;
      }
      const wMs = Math.max(0, agora - Date.parse(esp.desde));
      if (!aguardando || wMs > waitingMs) {
        aguardando = true;
        waitingMs = wMs;
        waitingLabel = esp.ha;
        band = esp.faixa;
        if (esp.previa) {
          ultimaPreview = esp.previa;
        }
      }
    }

    out.push({
      id: `${slug}-c-${i}-${def.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      nome: def.nome,
      papel: def.papel,
      dmSlug: dmSlugPrincipal,
      dmSlugs,
      aguardando,
      waitingMs,
      waitingLabel,
      band,
      ultimaPreview,
      ultimaTimestamp,
      atividadeLabel: rotuloTempo(ultimaTimestamp, agora),
      mensagensDm,
      custom: def.custom,
    });
  }

  return out;
}

function montarCardsEscritorio(
  links: LinksMap,
  dash: Dashboard,
  caixa: CaixaEntrada,
  groupsSummary: GroupSummary[],
  triage: TriageState,
  assentos: ClienteAssentosConfig,
  agora: number,
  catalogo: CatalogoEscritorio = CATALOGO_VAZIO,
): EstadoEscritorioPayload {
  const ignorar = new Set(catalogo.ignorar);
  const fixadosSet = new Set(assentos.fixados ?? []);
  const ocultosSet = new Set(assentos.ocultos ?? []);

  const dashBySlug = new Map<string, LinhaDashboard>(
    (dash.linhas ?? []).map((l) => [l.slug, l]),
  );
  const caixaBySlug = new Map((caixa.itens ?? []).map((i) => [i.grupo, i]));
  const summaryBySlug = new Map((groupsSummary ?? []).map((g) => [g.slug, g]));

  const allSlugs = new Set<string>([
    ...Object.keys(links),
    ...dashBySlug.keys(),
    ...summaryBySlug.keys(),
  ]);

  // Descobre quais repositórios já possuem um grupo principal ativo
  const reposComGrupo = new Set<string>();
  for (const slug of allSlugs) {
    if (ignorar.has(slug)) continue;
    if (tipoDoSlug(slug) !== 'grupo') continue;
    const l = links[slug];
    const ex = catalogo.projetosExtras[slug];
    const r = l?.repoPath ? basename(l.repoPath) : (ex?.repo ?? null);
    if (r) reposComGrupo.add(r);
  }

  const cards: ClienteEscritorio[] = [];

  for (const slug of allSlugs) {
    if (ignorar.has(slug)) continue;

    const link = links[slug];
    const extra = catalogo.projetosExtras[slug];
    const dashLinha = dashBySlug.get(slug);
    const caixaItem = caixaBySlug.get(slug);
    const summary = summaryBySlug.get(slug);

    const tipo = tipoDoSlug(slug);
    const temVinculoProjeto = Boolean(link || extra);
    const repoNome = link?.repoPath ? basename(link.repoPath) : (extra?.repo ?? null);

    // DMs sem vínculo de projeto ou DMs cujo projeto já tem grupo principal não duplicam mesa
    if (tipo === 'dm' && !fixadosSet.has(slug)) {
      if (!temVinculoProjeto) continue;
      if (repoNome && reposComGrupo.has(repoNome)) continue;
    }

    const nomeOriginal =
      summary?.name ??
      dashLinha?.nome ??
      caixaItem?.nome ??
      link?.cliente ??
      extra?.cliente ??
      slug;

    const nomeExibicao = catalogo.nomesCurtos[slug] ?? nomeOriginal;
    const projetoNome = link?.cliente || extra?.cliente || null;

    const esperando = caixaItem?.esperando ?? null;
    const aguardando = esperando !== null;
    const waitingMs = esperando ? Math.max(0, agora - new Date(esperando.desde).getTime()) : 0;

    const msgs30d = dashLinha?.msgs30d ?? caixaItem?.do_cliente_desde ?? 0;
    const msgsCliente30d = dashLinha?.msgsCliente30d ?? caixaItem?.do_cliente_desde ?? 0;

    const ultimaTimestamp = caixaItem?.ultima?.quando ?? summary?.lastTimestamp ?? null;
    const ultimaPreview =
      esperando?.previa ?? caixaItem?.ultima?.previa ?? summary?.lastPreview ?? null;

    const fixadoMesa = fixadosSet.has(slug);
    const ocultoMesa = ocultosSet.has(slug);

    const contratoEncerrado =
      contratoTerminadoPeloNome(nomeOriginal) ||
      dashLinha?.contrato?.estado === 'encerrado' ||
      dashLinha?.contrato?.estado === 'pausado';

    const emDesenvolvimento = ocultoMesa
      ? false
      : fixadoMesa
        ? true
        : !contratoEncerrado &&
          temVinculoProjeto &&
          (msgs30d > 0 || msgsCliente30d > 0 || aguardando);

    if (!temVinculoProjeto && msgs30d === 0 && !aguardando && !fixadoMesa) {
      continue;
    }

    const atividadeBase = Math.max(0, msgsCliente30d);
    const atividade30d = new Array(30).fill(0).map((_, idx) =>
      idx >= 25 && atividadeBase > 0 ? Math.ceil(atividadeBase / 5) : 0,
    );

    const contatosVinculados = resolverContatosDoProjeto(
      slug,
      repoNome,
      links,
      caixaBySlug,
      summaryBySlug,
      assentos,
      agora,
      catalogo,
    );
    const dmsAguardando = contatosVinculados.filter((ct) => ct.aguardando && ct.dmSlug !== slug).length;

    cards.push({
      slug,
      nome: nomeExibicao,
      tipo,
      avatarPath: summary?.avatarPath ?? null,
      ultimaPreview,
      ultimaTimestamp,
      atividadeLabel: rotuloTempo(ultimaTimestamp, agora),
      mensagens: summary?.messageCount ?? msgs30d,
      nota: primeiraLinha(triage.notes?.[slug]),
      silenciado: Boolean(triage.muted?.[slug]),
      naoLidas: summary?.unread ?? 0,
      desatualizado: false,
      etiquetas: triage.etiquetas?.[slug] ?? (repoNome ? [repoNome] : []),
      aguardando,
      waitingMs,
      band: esperando?.faixa ?? null,
      waitingLabel: esperando?.ha ?? null,
      atividade30d,
      msgsCliente30d,
      contrato: dashLinha?.contrato ?? CONTRATO_PADRAO,
      limite: dashLinha?.contrato?.limiteMensagens ?? null,
      entregas30d: dashLinha?.features30d ?? 0,
      entregasTotal: dashLinha?.featuresTotal ?? 0,
      msgsPorEntrega: dashLinha?.msgsPorFeature30d ?? null,
      valorPorEntrega: dashLinha?.valorPorFeature ?? null,
      sinais: dashLinha?.sinais ?? [],
      equipe: [],
      emDesenvolvimento,
      projetoNome,
      repoNome,
      github: link?.github ?? null,
      fixadoMesa,
      ocultoMesa,
      contatosVinculados,
      dmsAguardando,
    });
  }

  const dmsDisponiveis: DmDisponivelEscritorio[] = (groupsSummary ?? [])
    .filter((g) => g.slug.startsWith('dm-') && !ignorar.has(g.slug))
    .sort((a, b) => (b.lastTimestamp ?? '').localeCompare(a.lastTimestamp ?? ''))
    .slice(0, 80)
    .map((g) => ({
      slug: g.slug,
      nome: g.name,
      ultimaTimestamp: g.lastTimestamp,
      atividadeLabel: rotuloTempo(g.lastTimestamp, agora),
      mensagens: g.messageCount,
    }));

  return {
    clientes: ordenarCards(cards),
    presencas: {},
    autonomo: triage.autonomo ?? {},
    notas: triage.notes ?? {},
    assentos,
    dmsDisponiveis,
    updatedAt: new Date(agora).toISOString(),
  };
}

async function computarEstadoEscritorio(): Promise<EstadoEscritorioPayload> {
  ensureRootCloudEnv();
  const agora = Date.now();
  const desde30d = new Date(agora - 30 * 24 * 60 * 60_000).toISOString();
  const [assentos, catalogo] = await Promise.all([lerConfigAssentos(), lerCatalogoEscritorio()]);

  if (cloudEnabled()) {
    try {
      const [linksResp, dash, caixa, groupsSummary, triage] = await Promise.all([
        cloudJson<{ links: LinksMap }>('/api/links'),
        cloudJson<Dashboard>('/api/dashboard'),
        cloudJson<CaixaEntrada>(`/api/caixa/entrada?todos=1&desde=${encodeURIComponent(desde30d)}`),
        cloudJson<Array<GroupSummary & { jid?: string | null }>>('/api/groups/summary'),
        cloudJson<TriageState>('/api/triage'),
      ]);
      const payload = montarCardsEscritorio(
        linksResp.links ?? {},
        dash,
        caixa,
        groupsSummary,
        triage,
        assentos,
        agora,
        catalogo,
      );
      estadoCache = { atualizadoEm: agora, payload };
      return payload;
    } catch {
      // fallback abaixo
    }
  }

  // Execução direta no servidor da nuvem (Railway) ou local: usa o cache de 60s do dashboard + caixaDeEntrada
  const [links, dash, caixa, groupsSummary, triage] = await Promise.all([
    readLinks().catch(() => ({} as LinksMap)),
    montarDashboardAtual(),
    caixaDeEntrada({ todos: true, desde: desde30d }),
    listGroups(),
    readTriage(),
  ]);

  const payload = montarCardsEscritorio(
    links,
    dash,
    caixa,
    groupsSummary,
    triage,
    assentos,
    agora,
    catalogo,
  );
  estadoCache = { atualizadoEm: agora, payload };
  return payload;
}

export async function carregarEstadoEscritorio(
  forceFresh = false,
): Promise<EstadoEscritorioPayload> {
  const agora = Date.now();

  if (!forceFresh && estadoCache) {
    const idade = agora - estadoCache.atualizadoEm;
    if (idade < CACHE_FRESH_MS) {
      return estadoCache.payload;
    }
    if (idade < CACHE_STALE_MS) {
      if (!refreshInFlight) {
        refreshInFlight = computarEstadoEscritorio().finally(() => {
          refreshInFlight = null;
        });
      }
      return estadoCache.payload;
    }
  }

  if (forceFresh) {
    refreshInFlight = computarEstadoEscritorio().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  if (!refreshInFlight) {
    refreshInFlight = computarEstadoEscritorio().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Retorna imediatamente o estado em cache (0ms) ou um estado inicial vazio para que a
 * navegação SSR para `/escritorio` seja instantânea enquanto a cena de loader carrega.
 */
export function obterEstadoEscritorioImediato(): EstadoEscritorioPayload {
  if (estadoCache) {
    const idade = Date.now() - estadoCache.atualizadoEm;
    if (idade >= CACHE_FRESH_MS && !refreshInFlight) {
      refreshInFlight = computarEstadoEscritorio().finally(() => {
        refreshInFlight = null;
      });
    }
    return estadoCache.payload;
  }

  // Dispara aquecimento em background sem bloquear a renderização da página
  if (!refreshInFlight) {
    refreshInFlight = computarEstadoEscritorio().finally(() => {
      refreshInFlight = null;
    });
  }

  return {
    clientes: [],
    presencas: {},
    autonomo: {},
    notas: {},
    assentos: {},
    updatedAt: new Date().toISOString(),
  };
}
