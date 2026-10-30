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
  /** Slug principal da DM monitorada, se houver (ex.: "dm-5511900000084") */
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

/**
 * Grupos internos da Acme / Acme / testes ou DMs da própria equipe que não são
 * projetos de clientes e nunca devem ocupar mesa no escritório.
 */
const SLUGS_INTERNOS_OU_RUIDO = new Set([
  'teste',
  'projeto-137',
  'projeto-185',
  'projeto-138',
  'projeto-147',
  'projeto-11',
  'projeto-148',
  'agent-ai',
  'projeto-interno',
  'projeto-15',
  'projeto-131',
  'projeto-47',
  'projeto-04',
  'dm-5511900000066', // interno
  'dm-5511900000082', // interno
  'dm-5511900000043', // interno
  'dm-5511900000064', // interno
]);

/** Projetos ativos extras conhecidos do hub local mesmo se ainda não indexados no links.json */
const PROJETOS_EXTRAS: Record<string, { cliente: string; repo: string }> = {
  'projeto-116': { cliente: 'Projeto 50', repo: 'projeto-184' },
  'projeto-98': { cliente: 'Projeto 96', repo: 'projeto-178' },
};

/** Nomes mais limpos para exibir na baia do escritório */
const NOMES_CURTOS_PROJETO: Record<string, string> = {
  'projeto-30': 'Projeto 142',
  'projeto-05': 'Pessoa 103',
  'projeto-116': 'Projeto 52',
  'projeto-38': 'Projeto 09',
  'projeto-114': 'Pessoa 92',
  'projeto-87': 'Projeto 160',
  'projeto-10': 'Projeto 121',
  'projeto-128': 'Projeto 117',
  'projeto-46': 'Projeto 130',
  'projeto-44': 'Projeto 149',
  'projeto-108': 'Pessoa 12',
  'projeto-115': 'Projeto 173',
  'projeto-02': 'Projeto 53',
  'projeto-97': 'Projeto 163',
  'dm-5511900000070': 'Projeto 03',
  'projeto-113': 'Projeto 171',
  'projeto-152': 'Projeto 188',
  'projeto-29': 'Pessoa 134',
  'projeto-23': 'Pessoa 111',
  'projeto-98': 'Projeto 172',
};

interface ContatoDefinicaoBase {
  nome: string;
  papel?: string;
  dmSlugs?: string[];
}

/**
 * Mapeamento dos contatos de cada grupo/projeto e suas respectivas DMs individuais monitoradas
 * para que o operador veja quem faz parte de cada projeto e nunca esqueça mensagens fora do grupo.
 */
const CONTATOS_POR_PROJETO: Record<string, ContatoDefinicaoBase[]> = {
  'projeto-05': [
    { nome: 'Projeto 182', papel: 'Cliente · Sócia' },
    { nome: 'Projeto 183', papel: 'Cliente · Sócia' },
    { nome: 'Projeto 157', papel: 'Comercial', dmSlugs: ['dm-5511900000062'] },
  ],
  'projeto-128': [
    {
      nome: 'Projeto 164',
      papel: 'Cliente · Operação',
      dmSlugs: ['dm-5511900000060', 'dm-5511900000021'],
    },
    { nome: 'Projeto 18', papel: 'Cliente · Médica', dmSlugs: ['dm-5511900000058'] },
    { nome: 'Projeto 06', papel: 'Cliente · Médico', dmSlugs: ['dm-5511900000059'] },
  ],
  'projeto-114': [
    {
      nome: 'Pessoa 07',
      papel: 'Cliente · Gestão',
      dmSlugs: ['dm-5511900000084', 'dm-5511900000022'],
    },
    { nome: 'Pessoa 92', papel: 'Cliente · Médico', dmSlugs: ['dm-5511900000076'] },
    { nome: 'Pessoa 37', papel: 'Equipe', dmSlugs: ['dm-5511900000071'] },
    { nome: 'Pessoa 90', papel: 'Bot Clínica', dmSlugs: ['dm-5511900000085'] },
  ],
  'projeto-30': [
    { nome: 'Pessoa 105', papel: 'Cliente', dmSlugs: ['dm-5511900000078'] },
    { nome: 'Pessoa 93', papel: 'Dev do Cliente' },
    { nome: 'Projeto 51', papel: 'Bot', dmSlugs: ['dm-5511900000079'] },
  ],
  'projeto-38': [
    { nome: 'Projeto 140', papel: 'Cliente · PT', dmSlugs: ['dm-5511900000054'] },
    { nome: 'Projeto 156', papel: 'Cliente · PT' },
  ],
  'projeto-10': [
    { nome: 'Pessoa 135', papel: 'Cliente', dmSlugs: ['dm-5511900000080'] },
    { nome: 'Projeto 157', papel: 'Comercial', dmSlugs: ['dm-5511900000062'] },
  ],
  'projeto-87': [
    { nome: 'Projeto 129', papel: 'Cliente', dmSlugs: ['dm-5511900000041'] },
  ],
  'projeto-02': [
    { nome: 'Pessoa 20', papel: 'Projeto 175', dmSlugs: ['dm-5511900000083'] },
    { nome: 'Projeto 119', papel: 'Projeto 155' },
    { nome: 'Pessoa 133', papel: 'Dev / Parceiro', dmSlugs: ['dm-5511900000065'] },
  ],
  'dm-5511900000070': [
    { nome: 'Projeto 91', papel: 'Cliente', dmSlugs: ['dm-5511900000070'] },
    { nome: 'Projeto 181', papel: 'Projeto 26', dmSlugs: ['dm-5511900000039', 'dm-5511900000028'] },
  ],
  'projeto-116': [
    { nome: 'Projeto 181', papel: 'Cliente', dmSlugs: ['dm-5511900000039', 'dm-5511900000028'] },
  ],
  'projeto-152': [
    { nome: 'Pessoa 107', papel: 'Cliente' },
    { nome: 'Pessoa 120', papel: 'Cliente', dmSlugs: ['dm-5511900000055'] },
  ],
  'projeto-44': [
    { nome: 'Projeto 34', papel: 'Cliente' },
  ],
  'projeto-46': [
    { nome: 'Projeto 102', papel: 'Cliente · PT' },
    { nome: 'Projeto 159', papel: 'Equipe', dmSlugs: ['dm-5511900000061'] },
  ],
  'projeto-108': [
    { nome: 'Projeto 169', papel: 'Cliente' },
  ],
  'projeto-115': [
    { nome: 'Pessoa 17', papel: 'Sócio', dmSlugs: ['dm-5511900000074'] },
    { nome: 'Pessoa 13', papel: 'Sócio', dmSlugs: ['dm-5511900000067'] },
    { nome: 'Pessoa 95', papel: 'Sócio', dmSlugs: ['dm-5511900000072'] },
  ],
  'projeto-97': [
    { nome: 'Projeto 150', papel: 'Cliente', dmSlugs: ['dm-5511900000081'] },
  ],
  'projeto-113': [
    { nome: 'Pessoa 104', papel: 'Cliente' },
    { nome: 'Projeto 122', papel: 'Cliente · Produto' },
  ],
  'projeto-29': [
    { nome: 'Projeto 141', papel: 'Cliente', dmSlugs: ['dm-5511900000042'] },
  ],
  'projeto-23': [
    { nome: 'Projeto 129', papel: 'Cliente', dmSlugs: ['dm-5511900000041'] },
    { nome: 'Pessoa 19', papel: 'Cliente' },
  ],
  'projeto-98': [
    { nome: 'Pessoa 35', papel: 'Cliente' },
    { nome: 'Pessoa 106', papel: 'Parceiro', dmSlugs: ['dm-5511900000068'] },
    { nome: 'Pessoa 49', papel: 'CRM', dmSlugs: ['dm-5511900000077'] },
  ],
  'projeto-99': [
    { nome: 'Pessoa 133', papel: 'Cliente', dmSlugs: ['dm-5511900000065'] },
  ],
  'projeto-33': [
    { nome: 'Pessoa 118', papel: 'Cliente', dmSlugs: ['dm-5511900000057'] },
  ],
  'projeto-45': [
    { nome: 'Projeto 170', papel: 'Cliente', dmSlugs: ['dm-5511900000040'] },
  ],
  'projeto-89': [
    { nome: 'Projeto 158', papel: 'Cliente', dmSlugs: ['dm-5511900000075'] },
  ],
  'projeto-08': [
    {
      nome: 'Pessoa 36',
      papel: 'Cliente',
      dmSlugs: ['dm-5511900000063', 'dm-5511900000056'],
    },
  ],
  'projeto-31': [
    { nome: 'Pessoa 94', papel: 'Cliente', dmSlugs: ['dm-5511900000073'] },
  ],
  'projeto-16': [
    { nome: 'Projeto 143', papel: 'Cliente' },
  ],
  'dm-5511900000027': [
    { nome: 'Projeto 24', papel: 'Cliente', dmSlugs: ['dm-5511900000027'] },
    { nome: 'Projeto 25', papel: 'Equipe', dmSlugs: ['dm-5511900000069'] },
  ],
};

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
): ContatoProjetoEscritorio[] {
  const baseDefs: Array<ContatoDefinicaoBase & { custom?: boolean }> = [
    ...(CONTATOS_POR_PROJETO[slug] ?? []),
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
): EstadoEscritorioPayload {
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
    if (SLUGS_INTERNOS_OU_RUIDO.has(slug)) continue;
    if (tipoDoSlug(slug) !== 'grupo') continue;
    const l = links[slug];
    const ex = PROJETOS_EXTRAS[slug];
    const r = l?.repoPath ? basename(l.repoPath) : (ex?.repo ?? null);
    if (r) reposComGrupo.add(r);
  }

  const cards: ClienteEscritorio[] = [];

  for (const slug of allSlugs) {
    if (SLUGS_INTERNOS_OU_RUIDO.has(slug)) continue;

    const link = links[slug];
    const extra = PROJETOS_EXTRAS[slug];
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

    const nomeExibicao = NOMES_CURTOS_PROJETO[slug] ?? nomeOriginal;
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
    .filter((g) => g.slug.startsWith('dm-') && !SLUGS_INTERNOS_OU_RUIDO.has(g.slug))
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
  const assentos = await lerConfigAssentos();

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
