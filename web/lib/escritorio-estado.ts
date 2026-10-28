import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { CaixaEntrada } from './caixa-de-entrada';
import { type ClienteLinha, buildClientes, ordenarCards, primeiraLinha, rotuloTempo, tipoDoSlug } from './clientes';
import { cloudEnabled, cloudJson } from './cloud';
import { CONTRATO_PADRAO } from './contratos';
import type { Dashboard, LinhaDashboard } from './dashboard';
import type { GroupSummary } from './data';
import type { LinksMap } from './links';
import { readLinks } from './links';
import { safeDataPath } from './paths';
import { readPresence, type PresenceView } from './presence';
import { readTriage, type TriageState } from './triage';
import { writeJsonAtomic } from './json-store';

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

export interface ClienteAssentosConfig {
  /** Slugs explicitamente colocados em mesa pelo operador */
  fixados?: string[];
  /** Slugs explicitamente removidos de mesa ("não desenvolvendo") pelo operador */
  ocultos?: string[];
  /** Mapa opcional slug -> seatUid preferido */
  assentosPorSlug?: Record<string, string>;
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
  };
  await writeJsonAtomic(ASSENTOS_FILE(), proximo);
  estadoCache = null; // invalida cache
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
  // DMs internas / bot / próprio operador
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

function contratoTerminadoPeloNome(nome: string): boolean {
  // Ex.: "Projeto 174 App - Acme (TERMINA EM 16/08/2026)"
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
  updatedAt: string;
}

let estadoCache: { expiraEm: number; payload: EstadoEscritorioPayload } | null = null;
const CACHE_TTL_MS = 5_000;

export async function carregarEstadoEscritorio(): Promise<EstadoEscritorioPayload> {
  ensureRootCloudEnv();

  const agora = Date.now();
  if (estadoCache && estadoCache.expiraEm > agora) {
    return estadoCache.payload;
  }

  const assentos = await lerConfigAssentos();
  const fixadosSet = new Set(assentos.fixados ?? []);
  const ocultosSet = new Set(assentos.ocultos ?? []);

  if (cloudEnabled()) {
    try {
      const desde30d = new Date(agora - 30 * 24 * 60 * 60_000).toISOString();
      const [linksResp, dash, caixa, groupsSummary, triage] = await Promise.all([
        cloudJson<{ links: LinksMap }>('/api/links'),
        cloudJson<Dashboard>('/api/dashboard'),
        cloudJson<CaixaEntrada>(`/api/caixa/entrada?todos=1&desde=${encodeURIComponent(desde30d)}`),
        cloudJson<Array<GroupSummary & { jid?: string | null }>>('/api/groups/summary'),
        cloudJson<TriageState>('/api/triage'),
      ]);

      const links = linksResp.links ?? {};
      const dashBySlug = new Map<string, LinhaDashboard>(
        (dash.linhas ?? []).map((l) => [l.slug, l]),
      );
      const caixaBySlug = new Map(
        (caixa.itens ?? []).map((i) => [i.grupo, i]),
      );
      const summaryBySlug = new Map(
        (groupsSummary ?? []).map((g) => [g.slug, g]),
      );

      // Reúne todos os slugs candidatos (links + dashboard + summary)
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
        const repoNomePrelim = link?.repoPath ? basename(link.repoPath) : (extra?.repo ?? null);

        // DMs sem vínculo de projeto ou DMs cujo projeto já tem grupo principal não duplicam mesa
        if (tipo === 'dm' && !fixadosSet.has(slug)) {
          if (!temVinculoProjeto) continue;
          if (repoNomePrelim && reposComGrupo.has(repoNomePrelim)) continue;
        }

        const nomeOriginal =
          summary?.name ??
          dashLinha?.nome ??
          caixaItem?.nome ??
          link?.cliente ??
          extra?.cliente ??
          slug;

        const nomeExibicao = NOMES_CURTOS_PROJETO[slug] ?? nomeOriginal;
        const repoNome = link?.repoPath ? basename(link.repoPath) : (extra?.repo ?? null);
        const projetoNome = link?.cliente || extra?.cliente || null;

        const esperando = caixaItem?.esperando ?? null;
        const aguardando = esperando !== null;
        const waitingMs = esperando ? Math.max(0, agora - new Date(esperando.desde).getTime()) : 0;

        const msgs30d = dashLinha?.msgs30d ?? caixaItem?.do_cliente_desde ?? 0;
        const msgsCliente30d = dashLinha?.msgsCliente30d ?? caixaItem?.do_cliente_desde ?? 0;

        const ultimaTimestamp =
          caixaItem?.ultima?.quando ?? summary?.lastTimestamp ?? null;
        const ultimaPreview =
          esperando?.previa ?? caixaItem?.ultima?.previa ?? summary?.lastPreview ?? null;

        const fixadoMesa = fixadosSet.has(slug);
        const ocultoMesa = ocultosSet.has(slug);

        const contratoEncerrado =
          contratoTerminadoPeloNome(nomeOriginal) ||
          dashLinha?.contrato?.estado === 'encerrado' ||
          dashLinha?.contrato?.estado === 'pausado';

        // Regra central: só ocupa mesa se estiver em desenvolvimento ativo!
        const emDesenvolvimento = ocultoMesa
          ? false
          : fixadoMesa
            ? true
            : !contratoEncerrado &&
              temVinculoProjeto &&
              (msgs30d > 0 || msgsCliente30d > 0 || aguardando);

        // Se não tem vínculo de projeto e tem 0 mensagens nos últimos 30d, é grupo morto/antigo
        if (!temVinculoProjeto && msgs30d === 0 && !aguardando && !fixadoMesa) {
          continue;
        }

        const atividadeBase = Math.max(0, msgsCliente30d);
        const atividade30d = new Array(30).fill(0).map((_, idx) =>
          idx >= 25 && atividadeBase > 0 ? Math.ceil(atividadeBase / 5) : 0,
        );

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
        });
      }

      const ordenados = ordenarCards(cards);
      const payload: EstadoEscritorioPayload = {
        clientes: ordenados,
        presencas: {},
        autonomo: triage.autonomo ?? {},
        notas: triage.notes ?? {},
        assentos,
        updatedAt: new Date(agora).toISOString(),
      };
      estadoCache = { expiraEm: agora + CACHE_TTL_MS, payload };
      return payload;
    } catch {
      // Fallback para leitura local caso a nuvem falhe
    }
  }

  // Fallback local (ou execução direta dentro do container da nuvem no Railway)
  const [clientesLocais, triage, links] = await Promise.all([
    buildClientes(),
    readTriage(),
    readLinks().catch(() => ({} as LinksMap)),
  ]);
  const presencas: Record<string, PresenceView> = {};

  const reposComGrupoLocal = new Set<string>();
  for (const c of clientesLocais) {
    if (SLUGS_INTERNOS_OU_RUIDO.has(c.slug) || c.tipo !== 'grupo') continue;
    const l = links[c.slug];
    const ex = PROJETOS_EXTRAS[c.slug];
    const r = l?.repoPath ? basename(l.repoPath) : (ex?.repo ?? null);
    if (r) reposComGrupoLocal.add(r);
  }

  const filtrados: ClienteEscritorio[] = [];
  for (const c of clientesLocais) {
    if (SLUGS_INTERNOS_OU_RUIDO.has(c.slug)) continue;
    const link = links[c.slug];
    const extra = PROJETOS_EXTRAS[c.slug];
    const temVinculoProjeto = Boolean(link || extra);
    const repoNome = link?.repoPath ? basename(link.repoPath) : (extra?.repo ?? null);

    if (c.tipo === 'dm' && !fixadosSet.has(c.slug)) {
      if (!temVinculoProjeto) continue;
      if (repoNome && reposComGrupoLocal.has(repoNome)) continue;
    }

    const fixadoMesa = fixadosSet.has(c.slug);
    const ocultoMesa = ocultosSet.has(c.slug);
    const contratoEncerrado =
      contratoTerminadoPeloNome(c.nome) ||
      c.contrato.estado === 'encerrado' ||
      c.contrato.estado === 'pausado';

    const emDesenvolvimento = ocultoMesa
      ? false
      : fixadoMesa
        ? true
        : !contratoEncerrado &&
          temVinculoProjeto &&
          (c.msgsCliente30d > 0 || c.aguardando);

    if (!temVinculoProjeto && c.msgsCliente30d === 0 && !c.aguardando && !fixadoMesa) {
      continue;
    }

    const p = await readPresence(c.slug);
    if (p) presencas[c.slug] = p;

    filtrados.push({
      ...c,
      nome: NOMES_CURTOS_PROJETO[c.slug] ?? c.nome,
      emDesenvolvimento,
      projetoNome: link?.cliente || extra?.cliente || null,
      repoNome,
      github: link?.github ?? null,
      fixadoMesa,
      ocultoMesa,
    });
  }

  const payload: EstadoEscritorioPayload = {
    clientes: filtrados,
    presencas,
    autonomo: triage.autonomo,
    notas: triage.notes,
    assentos,
    updatedAt: new Date(agora).toISOString(),
  };
  estadoCache = { expiraEm: agora + CACHE_TTL_MS, payload };
  return payload;
}
