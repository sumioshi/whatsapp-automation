import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { writeJsonAtomic } from './json-store';
import {
  desvincularRepoOrca,
  type OrcaReposMap,
  readOrcaRepos,
  syncOrcaReposFromSnapshot,
  vincularRepoOrca,
} from './orca-repos';
import { filtrarWatchValido, mapearTeclasParaCli, type WatchTerminais } from './orca-terminal';
import { safeDataPath } from './paths';

const execFileAsync = promisify(execFile);

export interface OrcaSubagentSummary {
  id: string;
  state: string;
  agentType?: string;
  startedAt?: number;
}

export interface OrcaAgentSession {
  paneKey: string;
  terminalHandle: string | null;
  terminalTitle: string | null;
  agentType: string;
  state: string;
  workingMode: string | null;
  prompt: string | null;
  lastAssistantMessage: string | null;
  toolName: string | null;
  toolInput: string | null;
  subagents: OrcaSubagentSummary[];
  updatedAt: number | null;
  screenTail?: string[];
  draft?: string | null;
}

export interface OrcaChildWorktreeSummary {
  worktreeId: string;
  displayName: string;
  path: string;
  branch: string;
  status: string;
  agentType: string | null;
  lastAssistantMessage: string | null;
}

export interface OrcaProjectAgentInfo {
  slug: string;
  worktreeId: string;
  repoLabel: string;
  worktreePath: string;
  branch: string;
  status: 'working' | 'monitoring' | 'active' | 'done' | 'inactive';
  liveTerminalCount: number;
  lastActivityAt: number | null;
  primaryTerminalHandle: string | null;
  agents: OrcaAgentSession[];
  childWorktrees: OrcaChildWorktreeSummary[];
}

export interface OrcaHostInfo {
  id: string;
  label: string;
  kind: string;
  platform: string | null;
  connected: boolean;
}

export interface OrcaEnvironmentInfo {
  id: string;
  label: string;
  kind: string | null;
  connected: boolean | null;
}

/** Linha compacta de worktree, para o vínculo manual slug -> pasta na UI. */
export interface OrcaWorktreeRow {
  worktreeId: string;
  folder: string;
  repo: string;
  path: string;
  branch: string;
  liveTerminalCount: number;
}

export interface OrcaSnapshot {
  available: boolean;
  source: 'local-cli' | 'remote-sync' | 'unavailable';
  runtimeId: string | null;
  appVersion: string | null;
  runtimeState: string | null;
  connectionState: string | null;
  /** Nome da máquina onde a CLI rodou (a origem do snapshot). */
  hostLabel: string | null;
  updatedAt: string;
  bySlug: Record<string, OrcaProjectAgentInfo>;
  allWorktreesCount: number;
  activeAgentsCount: number;
  terminalsCount: number;
  hosts: OrcaHostInfo[];
  environments: OrcaEnvironmentInfo[];
  allWorktrees: OrcaWorktreeRow[];
  /** Mapa slug -> pastas vigente na origem (a nuvem o replica em orca-repos.json). */
  repos: OrcaReposMap;
}

export interface OrcaPendingCommand {
  id: string;
  createdAt: string;
  acao:
    | 'enviar_prompt'
    | 'iniciar_agente'
    | 'interromper'
    | 'focar_orca'
    | 'enviar_teclas'
    | 'vincular_repo'
    | 'desvincular_repo'
    | 'parear_ambiente'
    | 'remover_ambiente';
  slug?: string;
  terminalHandle?: string;
  worktreePath?: string;
  text?: string;
  agentType?: string;
  /** vincular_repo / desvincular_repo: basename do worktree ou nome do repo. */
  folder?: string;
  /** parear_ambiente: código `orca://pair?...`. Nunca persistido (fila volátil). */
  pairingCode?: string;
  /** parear_ambiente: nome do ambiente salvo; remover_ambiente: id ou nome. */
  environmentId?: string;
  /** Teclas cruas (`enviar_teclas`): vão ao PTY como vieram do xterm, sem Enter automático. */
  data?: string;
}

export interface OrcaCommandResult {
  id: string;
  ok: boolean;
  completedAt: string;
  message?: string;
  error?: string;
  terminalHandle?: string | null;
  screenTail?: string[];
}

interface OrcaRemoteQueueFile {
  pending: OrcaPendingCommand[];
  results: Record<string, OrcaCommandResult>;
}

const ORCA_STATE_FILE = () => safeDataPath('.orca-remote-state.json');
const ORCA_QUEUE_FILE = () => safeDataPath('.orca-remote-queue.json');
// Arquivo próprio (não a fila) para o stream renovar sem disputar escrita com a fila de comandos.
const ORCA_WATCH_FILE = () => safeDataPath('.orca-terminal-watch.json');

let resolvedOrcaBin: string | null | undefined;

export function getOrcaBin(): string | null {
  if (resolvedOrcaBin !== undefined) return resolvedOrcaBin;

  // Sessão aberta pelo app exporta ORCA_CLI_BIN_DIR (não ORCA_CLI_COMMAND); fora dela,
  // o symlink de ~/.local/bin ou o binário dentro do bundle do app.
  const candidates = [
    process.env.ORCA_CLI_COMMAND,
    process.env.ORCA_CLI_BIN_DIR ? join(process.env.ORCA_CLI_BIN_DIR, 'orca') : undefined,
    join(homedir(), '.local', 'bin', 'orca'),
    '/usr/local/bin/orca',
    '/opt/homebrew/bin/orca',
    '/Applications/Orca.app/Contents/Resources/bin/orca',
  ].filter((c): c is string => Boolean(c));

  for (const cand of candidates) {
    if (existsSync(cand)) {
      resolvedOrcaBin = cand;
      return cand;
    }
  }

  resolvedOrcaBin = null;
  return null;
}

function parseOrcaJsonOutput<T>(stdout: string): T | null {
  const idx = stdout.indexOf('{');
  if (idx < 0) return null;
  try {
    return JSON.parse(stdout.slice(idx)) as T;
  } catch {
    return null;
  }
}

async function runOrcaJson<T>(args: string[], timeoutMs = 8000): Promise<T | null> {
  const bin = getOrcaBin();
  if (!bin) return null;

  const extraArgs: string[] = [];
  if (process.env.ORCA_PAIRING_CODE && !args.includes('--pairing-code')) {
    extraArgs.push('--pairing-code', process.env.ORCA_PAIRING_CODE);
  } else if (process.env.ORCA_ENVIRONMENT && !args.includes('--environment')) {
    extraArgs.push('--environment', process.env.ORCA_ENVIRONMENT);
  }

  try {
    const { stdout } = await execFileAsync(bin, [...args, ...extraArgs, '--json'], {
      timeout: timeoutMs,
      maxBuffer: 12 * 1024 * 1024,
    });
    return parseOrcaJsonOutput<T>(stdout);
  } catch (err) {
    const anyErr = err as { stdout?: string };
    if (typeof anyErr?.stdout === 'string') {
      return parseOrcaJsonOutput<T>(anyErr.stdout);
    }
    return null;
  }
}

interface RawOrcaTerminal {
  handle: string;
  worktreeId?: string;
  worktreePath?: string;
  branch?: string;
  tabId?: string;
  leafId?: string;
  title?: string;
  connected?: boolean;
  writable?: boolean;
  lastOutputAt?: number;
  preview?: string;
  agentIdentity?: string;
}

interface RawOrcaAgent {
  paneKey?: string;
  state?: string;
  workingMode?: string;
  agentType?: string;
  prompt?: string | null;
  taskTitle?: string | null;
  lastAssistantMessage?: string | null;
  toolName?: string | null;
  toolInput?: string | null;
  updatedAt?: number | null;
  subagents?: Array<{
    id: string;
    state: string;
    agentType?: string;
    startedAt?: number;
  }>;
}

interface RawOrcaWorktree {
  worktreeId: string;
  repo?: string;
  path: string;
  branch?: string;
  isMainWorktree?: boolean;
  displayName?: string;
  lastActivityAt?: number | null;
  liveTerminalCount?: number;
  status?: string;
  sidebarStatus?: string;
  agents?: RawOrcaAgent[];
  childWorktreeIds?: string[];
}

function normalizeStatus(
  sidebarStatus?: string,
  status?: string,
  liveCount = 0,
): 'working' | 'monitoring' | 'active' | 'done' | 'inactive' {
  const s = (sidebarStatus || status || '').toLowerCase();
  if (s === 'monitoring') return 'monitoring';
  if (s === 'working' || s === 'running' || s === 'in-progress') return 'working';
  if (s === 'active') return 'active';
  if (s === 'done' || s === 'completed') return 'done';
  if (liveCount > 0) return 'active';
  return 'inactive';
}

interface RawOrcaHost {
  id?: string;
  kind?: string;
  name?: string;
  machineName?: string;
  platform?: string;
  connected?: boolean;
}

interface OrcaMeta {
  appVersion: string | null;
  runtimeState: string | null;
  connectionState: string | null;
  hostLabel: string | null;
  hosts: OrcaHostInfo[];
  environments: OrcaEnvironmentInfo[];
}

// `status`, `host list` e `environment list` mudam devagar: lidos a cada 30 s, não a cada snapshot.
let metaCache: { ts: number; data: OrcaMeta } | null = null;
const META_CACHE_TTL_MS = 30_000;

// Só o que a tela precisa: o registro do ambiente pode trazer URL e credencial do
// pareamento, e o snapshot viaja para a nuvem e para o navegador.
function normalizeEnvironment(raw: unknown): OrcaEnvironmentInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? r.environmentId ?? r.name ?? '').trim();
  if (!id) return null;
  return {
    id,
    label: String(r.name ?? r.label ?? id),
    kind: typeof r.kind === 'string' ? r.kind : null,
    connected: typeof r.connected === 'boolean' ? r.connected : null,
  };
}

async function readOrcaMeta(forceFresh = false): Promise<OrcaMeta> {
  const now = Date.now();
  if (!forceFresh && metaCache && now - metaCache.ts < META_CACHE_TTL_MS) return metaCache.data;

  const [statusRes, hostRes, envRes] = await Promise.all([
    runOrcaJson<{
      ok?: boolean;
      result?: { runtime?: { state?: string; connectionState?: string; appVersion?: string } };
    }>(['status'], 5000),
    runOrcaJson<{ ok?: boolean; result?: { hosts?: RawOrcaHost[] } }>(['host', 'list'], 5000),
    runOrcaJson<{ ok?: boolean; result?: { environments?: unknown[] } }>(
      ['environment', 'list'],
      5000,
    ),
  ]);

  const runtime = statusRes?.result?.runtime;
  const hosts: OrcaHostInfo[] = (hostRes?.result?.hosts ?? [])
    .filter((h) => h && typeof h === 'object' && h.id)
    .map((h) => ({
      id: String(h.id),
      label: h.machineName || h.name || String(h.id),
      kind: h.kind ?? 'unknown',
      platform: h.platform ?? null,
      connected: h.kind === 'local' ? true : Boolean(h.connected),
    }));
  const local = hosts.find((h) => h.kind === 'local');

  const data: OrcaMeta = {
    appVersion: runtime?.appVersion ?? process.env.ORCA_APP_VERSION ?? null,
    runtimeState: runtime?.state ?? null,
    connectionState: runtime?.connectionState ?? null,
    hostLabel: local?.label ?? hostname(),
    hosts,
    environments: (envRes?.result?.environments ?? [])
      .map(normalizeEnvironment)
      .filter((e): e is OrcaEnvironmentInfo => e !== null),
  };
  metaCache = { ts: now, data };
  return data;
}

// Cache rápido em memória para chamadas ao CLI local (evita múltiplos spawns simultâneos)
let localSnapshotCache: { ts: number; data: OrcaSnapshot } | null = null;
// Todos os caminhos de worktree vistos no último `worktree ps` (sem o teto da lista compacta).
let knownWorktreePaths = new Set<string>();

async function worktreePathConhecido(path: string): Promise<boolean> {
  if (knownWorktreePaths.size === 0) await readLocalOrcaSnapshot();
  return knownWorktreePaths.has(path);
}
const LOCAL_CACHE_TTL_MS = 2500;
const ALL_WORKTREES_LIMIT = 200;

export async function readLocalOrcaSnapshot(forceFresh = false): Promise<OrcaSnapshot | null> {
  if (!getOrcaBin()) return null;

  const now = Date.now();
  if (!forceFresh && localSnapshotCache && now - localSnapshotCache.ts < LOCAL_CACHE_TTL_MS) {
    return localSnapshotCache.data;
  }

  const [psRes, termRes, meta, repos] = await Promise.all([
    runOrcaJson<{
      ok?: boolean;
      result?: { worktrees?: RawOrcaWorktree[] };
      _meta?: { runtimeId?: string };
    }>(['worktree', 'ps']),
    runOrcaJson<{
      ok?: boolean;
      result?: { terminals?: RawOrcaTerminal[] };
    }>(['terminal', 'list']),
    readOrcaMeta(),
    readOrcaRepos(),
  ]);

  if (!psRes?.ok || !psRes.result?.worktrees) {
    return null;
  }

  const worktrees = psRes.result.worktrees;
  const terminals = termRes?.result?.terminals ?? [];
  knownWorktreePaths = new Set(worktrees.map((w) => w.path));

  // Mapa paneKey ("tabId:leafId") -> terminal
  const termByPaneKey = new Map<string, RawOrcaTerminal>();
  const termsByWorktreePath = new Map<string, RawOrcaTerminal[]>();

  for (const t of terminals) {
    if (t.tabId && t.leafId) {
      termByPaneKey.set(`${t.tabId}:${t.leafId}`, t);
    }
    if (t.worktreePath) {
      const list = termsByWorktreePath.get(t.worktreePath) ?? [];
      list.push(t);
      termsByWorktreePath.set(t.worktreePath, list);
    }
  }

  // Índice rápido de worktrees por basename da pasta
  const worktreesByFolder = new Map<string, RawOrcaWorktree[]>();
  const worktreeById = new Map<string, RawOrcaWorktree>();

  for (const w of worktrees) {
    worktreeById.set(w.worktreeId, w);
    const folder = basename(w.path).toLowerCase();
    const arr = worktreesByFolder.get(folder) ?? [];
    arr.push(w);
    worktreesByFolder.set(folder, arr);
  }

  // Também indexa pelo nome do repo (ex: projeto-125)
  const childWorktreesByRepoName = new Map<string, RawOrcaWorktree[]>();
  for (const w of worktrees) {
    if (!w.isMainWorktree && w.repo) {
      const key = w.repo.toLowerCase();
      const arr = childWorktreesByRepoName.get(key) ?? [];
      arr.push(w);
      childWorktreesByRepoName.set(key, arr);
    }
  }

  const bySlug: Record<string, OrcaProjectAgentInfo> = {};
  let activeAgentsCount = 0;

  for (const [slug, folderCandidates] of Object.entries(repos)) {
    let matchedWt: RawOrcaWorktree | undefined;
    for (const folder of folderCandidates) {
      const candidates = worktreesByFolder.get(folder.toLowerCase()) ?? [];
      // Prioriza worktree que tem terminal ativo ou é main worktree
      matchedWt =
        candidates.find((c) => (c.liveTerminalCount ?? 0) > 0 || (c.agents?.length ?? 0) > 0) ??
        candidates.find((c) => c.isMainWorktree) ??
        candidates[0];
      if (matchedWt) break;
    }

    if (!matchedWt) continue;

    const wtTerms = termsByWorktreePath.get(matchedWt.path) ?? [];
    const agents: OrcaAgentSession[] = [];

    for (const ag of matchedWt.agents ?? []) {
      const paneTerm = ag.paneKey ? termByPaneKey.get(ag.paneKey) : undefined;
      const fallbackTerm = paneTerm ?? wtTerms.find((t) => t.agentIdentity === ag.agentType) ?? wtTerms[0];
      const st = ag.state ?? 'inactive';
      if (st === 'working' || ag.workingMode === 'monitoring') {
        activeAgentsCount++;
      }

      agents.push({
        paneKey: ag.paneKey ?? '',
        terminalHandle: fallbackTerm?.handle ?? null,
        terminalTitle: fallbackTerm?.title ?? ag.taskTitle ?? null,
        agentType: ag.agentType ?? fallbackTerm?.agentIdentity ?? 'claude',
        state: st,
        workingMode: ag.workingMode ?? null,
        prompt: ag.prompt ?? null,
        lastAssistantMessage: ag.lastAssistantMessage ?? null,
        toolName: ag.toolName ?? null,
        toolInput: ag.toolInput ?? null,
        subagents: ag.subagents ?? [],
        updatedAt: ag.updatedAt ?? fallbackTerm?.lastOutputAt ?? null,
      });
    }

    // Se houver terminais vivos no worktree que ainda não apareceram em `agents`
    for (const t of wtTerms) {
      const alreadyIncluded = agents.some((a) => a.terminalHandle === t.handle);
      if (!alreadyIncluded && t.agentIdentity) {
        agents.push({
          paneKey: `${t.tabId ?? ''}:${t.leafId ?? ''}`,
          terminalHandle: t.handle,
          terminalTitle: t.title ?? null,
          agentType: t.agentIdentity,
          state: 'active',
          workingMode: null,
          prompt: null,
          lastAssistantMessage: t.preview ?? null,
          toolName: null,
          toolInput: null,
          subagents: [],
          updatedAt: t.lastOutputAt ?? null,
        });
      }
    }

    // Coleta child worktrees (ex.: frentes paralelas de orquestração do projeto)
    const childWts: OrcaChildWorktreeSummary[] = [];
    const seenChildIds = new Set<string>();

    for (const cid of matchedWt.childWorktreeIds ?? []) {
      const cw = worktreeById.get(cid);
      if (cw && !seenChildIds.has(cw.worktreeId)) {
        seenChildIds.add(cw.worktreeId);
        const firstAg = cw.agents?.[0];
        childWts.push({
          worktreeId: cw.worktreeId,
          displayName: cw.displayName ?? basename(cw.path),
          path: cw.path,
          branch: (cw.branch ?? '').replace(/^refs\/heads\//, ''),
          status: cw.sidebarStatus ?? cw.status ?? 'inactive',
          agentType: firstAg?.agentType ?? null,
          lastAssistantMessage: firstAg?.lastAssistantMessage ?? null,
        });
      }
    }

    for (const folder of folderCandidates) {
      const extraChildren = childWorktreesByRepoName.get(folder.toLowerCase()) ?? [];
      for (const cw of extraChildren) {
        if (!seenChildIds.has(cw.worktreeId)) {
          seenChildIds.add(cw.worktreeId);
          const firstAg = cw.agents?.[0];
          childWts.push({
            worktreeId: cw.worktreeId,
            displayName: cw.displayName ?? basename(cw.path),
            path: cw.path,
            branch: (cw.branch ?? '').replace(/^refs\/heads\//, ''),
            status: cw.sidebarStatus ?? cw.status ?? 'inactive',
            agentType: firstAg?.agentType ?? null,
            lastAssistantMessage: firstAg?.lastAssistantMessage ?? null,
          });
        }
      }
    }

    const primaryTerminalHandle =
      agents.find((a) => a.terminalHandle)?.terminalHandle ?? wtTerms[0]?.handle ?? null;

    bySlug[slug] = {
      slug,
      worktreeId: matchedWt.worktreeId,
      repoLabel: matchedWt.repo ?? matchedWt.displayName ?? basename(matchedWt.path),
      worktreePath: matchedWt.path,
      branch: (matchedWt.branch ?? '').replace(/^refs\/heads\//, '') || 'main',
      status: normalizeStatus(
        matchedWt.sidebarStatus,
        matchedWt.status,
        matchedWt.liveTerminalCount ?? wtTerms.length,
      ),
      liveTerminalCount: matchedWt.liveTerminalCount ?? wtTerms.length,
      lastActivityAt: matchedWt.lastActivityAt ?? null,
      primaryTerminalHandle,
      agents,
      childWorktrees: childWts.slice(0, 12),
    };
  }

  // Lista compacta (worktrees com atividade primeiro) para o vínculo manual na UI.
  const allWorktrees: OrcaWorktreeRow[] = [...worktrees]
    .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))
    .slice(0, ALL_WORKTREES_LIMIT)
    .map((w) => ({
      worktreeId: w.worktreeId,
      folder: basename(w.path),
      repo: w.repo ?? w.displayName ?? basename(w.path),
      path: w.path,
      branch: (w.branch ?? '').replace(/^refs\/heads\//, ''),
      liveTerminalCount: w.liveTerminalCount ?? termsByWorktreePath.get(w.path)?.length ?? 0,
    }));

  const snapshot: OrcaSnapshot = {
    available: true,
    source: 'local-cli',
    runtimeId: psRes._meta?.runtimeId ?? null,
    appVersion: meta.appVersion,
    runtimeState: meta.runtimeState,
    connectionState: meta.connectionState,
    hostLabel: meta.hostLabel,
    updatedAt: new Date(now).toISOString(),
    bySlug,
    allWorktreesCount: worktrees.length,
    activeAgentsCount,
    terminalsCount: terminals.length,
    hosts: meta.hosts,
    environments: meta.environments,
    allWorktrees,
    repos,
  };

  localSnapshotCache = { ts: now, data: snapshot };
  return snapshot;
}

/**
 * Lê as linhas renderizadas na tela de um terminal específico do Orca (`--screen`).
 */
export async function readLocalTerminalScreen(
  terminalHandle: string,
): Promise<{ tail: string[]; draft?: string | null; status?: string } | null> {
  if (!getOrcaBin() || !terminalHandle) return null;

  const res = await runOrcaJson<{
    ok?: boolean;
    result?: {
      terminal?: {
        status?: string;
        tail?: string[];
        draft?: string | null;
      };
    };
  }>(['terminal', 'read', '--terminal', terminalHandle, '--screen'], 5000);

  const term = res?.result?.terminal;
  if (!term || !Array.isArray(term.tail)) return null;

  return {
    tail: term.tail,
    draft: term.draft ?? null,
    status: term.status,
  };
}

/**
 * Executa um comando diretamente no Orca CLI local.
 */
export async function executeLocalOrcaCommand(
  cmd: OrcaPendingCommand,
): Promise<OrcaCommandResult> {
  const nowIso = new Date().toISOString();
  const bin = getOrcaBin();
  if (!bin) {
    return {
      id: cmd.id,
      ok: false,
      completedAt: nowIso,
      error: 'Orca CLI não encontrado nesta máquina.',
    };
  }

  try {
    if (cmd.acao === 'vincular_repo' || cmd.acao === 'desvincular_repo') {
      const slug = (cmd.slug ?? '').trim();
      const folder = (cmd.folder ?? '').trim();
      if (!slug || (cmd.acao === 'vincular_repo' && !folder)) {
        return { id: cmd.id, ok: false, completedAt: nowIso, error: 'slug e pasta obrigatórios.' };
      }
      if (cmd.acao === 'vincular_repo') await vincularRepoOrca(slug, folder);
      else await desvincularRepoOrca(slug, folder || undefined);
      localSnapshotCache = null;
      return {
        id: cmd.id,
        ok: true,
        completedAt: nowIso,
        message:
          cmd.acao === 'vincular_repo'
            ? `Pasta "${folder}" vinculada ao chat.`
            : 'Vínculo com o worktree removido.',
      };
    }

    if (cmd.acao === 'parear_ambiente') {
      const code = (cmd.pairingCode ?? '').trim();
      if (!code) {
        return { id: cmd.id, ok: false, completedAt: nowIso, error: 'Pairing code vazio.' };
      }
      const name =
        (cmd.environmentId ?? '').trim() ||
        `remoto-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
      // `--pairing-code` aqui é argumento do subcomando; o runOrcaJson não duplica a flag.
      const res = await runOrcaJson<{ ok?: boolean; error?: { message?: string } }>(
        ['environment', 'add', '--name', name, '--pairing-code', code],
        20_000,
      );
      metaCache = null;
      localSnapshotCache = null;
      if (!res?.ok) {
        return {
          id: cmd.id,
          ok: false,
          completedAt: nowIso,
          error: res?.error?.message || 'Falha ao parear o ambiente no Orca.',
        };
      }
      return { id: cmd.id, ok: true, completedAt: nowIso, message: `Ambiente "${name}" pareado.` };
    }

    if (cmd.acao === 'remover_ambiente') {
      const envId = (cmd.environmentId ?? '').trim();
      if (!envId) {
        return { id: cmd.id, ok: false, completedAt: nowIso, error: 'Ambiente não informado.' };
      }
      const res = await runOrcaJson<{ ok?: boolean; error?: { message?: string } }>(
        ['environment', 'rm', '--environment', envId],
        10_000,
      );
      metaCache = null;
      localSnapshotCache = null;
      if (!res?.ok) {
        return {
          id: cmd.id,
          ok: false,
          completedAt: nowIso,
          error: res?.error?.message || 'Falha ao remover o ambiente no Orca.',
        };
      }
      return { id: cmd.id, ok: true, completedAt: nowIso, message: 'Ambiente removido.' };
    }

    if (cmd.acao === 'focar_orca' && cmd.terminalHandle) {
      await runOrcaJson(['terminal', 'focus', '--terminal', cmd.terminalHandle], 5000);
      return {
        id: cmd.id,
        ok: true,
        completedAt: nowIso,
        terminalHandle: cmd.terminalHandle,
        message: 'Janela do terminal focada no Orca.',
      };
    }

    if (cmd.acao === 'enviar_teclas') {
      const planos = mapearTeclasParaCli(cmd.data ?? '');
      if (!cmd.terminalHandle || planos.length === 0) {
        return {
          id: cmd.id,
          ok: false,
          completedAt: nowIso,
          error: 'Terminal ou teclas ausentes.',
        };
      }
      // Sequencial para manter a ordem das teclas dentro do lote.
      for (const plano of planos) {
        const sendRes = await runOrcaJson<{ ok?: boolean; error?: { message?: string } }>(
          ['terminal', 'send', '--terminal', cmd.terminalHandle, ...plano.args],
          5000,
        );
        if (!sendRes?.ok) {
          return {
            id: cmd.id,
            ok: false,
            completedAt: nowIso,
            terminalHandle: cmd.terminalHandle,
            error: sendRes?.error?.message || 'Falha ao enviar teclas ao terminal.',
          };
        }
      }
      return {
        id: cmd.id,
        ok: true,
        completedAt: nowIso,
        terminalHandle: cmd.terminalHandle,
      };
    }

    if (cmd.acao === 'interromper' && cmd.terminalHandle) {
      await runOrcaJson(
        ['terminal', 'send', '--terminal', cmd.terminalHandle, '--interrupt'],
        5000,
      );
      localSnapshotCache = null;
      const screen = await readLocalTerminalScreen(cmd.terminalHandle);
      return {
        id: cmd.id,
        ok: true,
        completedAt: nowIso,
        terminalHandle: cmd.terminalHandle,
        screenTail: screen?.tail,
        message: 'Sinal de interrupção enviado ao terminal.',
      };
    }

    if (cmd.acao === 'iniciar_agente') {
      if (!cmd.worktreePath) {
        return {
          id: cmd.id,
          ok: false,
          completedAt: nowIso,
          error: 'worktreePath obrigatório para iniciar agente.',
        };
      }
      // O caminho vira argumento da CLI: só worktrees que o Orca conhece.
      if (!(await worktreePathConhecido(cmd.worktreePath))) {
        return {
          id: cmd.id,
          ok: false,
          completedAt: nowIso,
          error: 'worktreePath não é um worktree registrado no Orca desta máquina.',
        };
      }
      const agentId = cmd.agentType || 'claude';
      const args = [
        'agent',
        'launch',
        '--agent',
        agentId,
        '--worktree',
        `path:${cmd.worktreePath}`,
        '--surface',
        'terminal',
      ];
      if (cmd.text && cmd.text.trim()) {
        args.push('--prompt', cmd.text.trim());
      }
      const launchRes = await runOrcaJson<{
        ok?: boolean;
        result?: { terminalHandle?: string; handle?: string };
        error?: { message?: string };
      }>(args, 12000);

      localSnapshotCache = null;
      if (!launchRes?.ok) {
        return {
          id: cmd.id,
          ok: false,
          completedAt: nowIso,
          error: launchRes?.error?.message || 'Falha ao iniciar agente no Orca.',
        };
      }

      const handle =
        launchRes.result?.terminalHandle ?? launchRes.result?.handle ?? null;
      return {
        id: cmd.id,
        ok: true,
        completedAt: nowIso,
        terminalHandle: handle,
        message: `Agente ${agentId} iniciado no projeto.`,
      };
    }

    if (cmd.acao === 'enviar_prompt') {
      const text = (cmd.text ?? '').trim();
      if (!text) {
        return {
          id: cmd.id,
          ok: false,
          completedAt: nowIso,
          error: 'Texto do prompt vazio.',
        };
      }

      // Se já temos um terminalHandle ativo, enviamos direto para ele
      if (cmd.terminalHandle) {
        const sendRes = await runOrcaJson<{
          ok?: boolean;
          error?: { message?: string };
        }>(
          [
            'terminal',
            'send',
            '--terminal',
            cmd.terminalHandle,
            '--text',
            text,
            '--enter',
          ],
          8000,
        );
        localSnapshotCache = null;
        if (!sendRes?.ok) {
          return {
            id: cmd.id,
            ok: false,
            completedAt: nowIso,
            error: sendRes?.error?.message || 'Falha ao enviar prompt para o terminal.',
          };
        }
        const screen = await readLocalTerminalScreen(cmd.terminalHandle);
        return {
          id: cmd.id,
          ok: true,
          completedAt: nowIso,
          terminalHandle: cmd.terminalHandle,
          screenTail: screen?.tail,
          message: 'Prompt enviado ao agente no Orca!',
        };
      }

      // Caso não tenha terminal aberto ainda, mas tenha worktreePath, lança o agente com o prompt!
      if (cmd.worktreePath) {
        return executeLocalOrcaCommand({
          ...cmd,
          acao: 'iniciar_agente',
          agentType: cmd.agentType || 'claude',
        });
      }

      return {
        id: cmd.id,
        ok: false,
        completedAt: nowIso,
        error: 'Nenhum terminal ou worktree encontrado para este projeto.',
      };
    }

    return {
      id: cmd.id,
      ok: false,
      completedAt: nowIso,
      error: `Ação desconhecida: ${cmd.acao}`,
    };
  } catch (err) {
    return {
      id: cmd.id,
      ok: false,
      completedAt: nowIso,
      error: (err as Error).message || 'Erro ao executar comando no Orca.',
    };
  }
}

/**
 * Lê o snapshot salvo via sync remoto (para quando a rota roda na nuvem Railway).
 */
export async function readSyncedOrcaSnapshot(): Promise<OrcaSnapshot | null> {
  try {
    const raw = await readFile(ORCA_STATE_FILE(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<OrcaSnapshot>;
    if (!parsed || typeof parsed !== 'object' || !parsed.bySlug) return null;
    // Snapshot gravado por uma versão anterior pode não ter os campos novos.
    return {
      ...emptyOrcaSnapshot(),
      ...parsed,
      bySlug: parsed.bySlug,
      source: 'remote-sync',
    };
  } catch {
    return null;
  }
}

export async function saveSyncedOrcaSnapshot(snapshot: OrcaSnapshot): Promise<void> {
  await writeJsonAtomic(ORCA_STATE_FILE(), {
    ...snapshot,
    source: 'remote-sync',
    updatedAt: new Date().toISOString(),
  });
  // O mapa slug -> pastas é editado na origem; a nuvem só o replica.
  if (snapshot.repos) {
    await syncOrcaReposFromSnapshot(snapshot.repos).catch(() => undefined);
  }
}

/**
 * Comandos cujo payload não pode ir para o arquivo da fila (pairing code, teclas
 * digitadas no terminal) ficam só na memória deste processo até o relay buscá-los no
 * próximo `sync_push`. Teclas chegam em lotes de dezenas de ms, por isso o teto é alto.
 */
const volatilePending: OrcaPendingCommand[] = [];
const VOLATILE_MAX = 400;

export function enqueueVolatileOrcaCommand(cmd: OrcaPendingCommand): OrcaPendingCommand {
  volatilePending.push(cmd);
  if (volatilePending.length > VOLATILE_MAX) {
    volatilePending.splice(0, volatilePending.length - VOLATILE_MAX);
  }
  return cmd;
}

/** Ações cujo payload não pode ser persistido em disco. */
export function isSecretOrcaAction(acao: OrcaPendingCommand['acao']): boolean {
  return acao === 'parear_ambiente' || acao === 'enviar_teclas';
}

/**
 * Comando parado na fila além disso não executa mais: o Mac pode ter ficado horas
 * offline e um prompt ou tecla velha não deve disparar quando ele religa.
 */
export const COMANDO_VALIDADE_MS = 3 * 60_000;

export function comandoExpirado(cmd: OrcaPendingCommand, agora = Date.now()): boolean {
  const ts = Date.parse(cmd.createdAt);
  return !Number.isFinite(ts) || agora - ts > COMANDO_VALIDADE_MS;
}

// Leitura-modificação-gravação da fila é serializada: dois pedidos simultâneos
// (teclas em lote e o sync_push) não podem se sobrescrever.
let filaLock: Promise<unknown> = Promise.resolve();

function comFilaSerializada<T>(fn: () => Promise<T>): Promise<T> {
  const resultado = filaLock.then(fn, fn);
  filaLock = resultado.catch(() => undefined);
  return resultado;
}

export async function readRemoteQueue(): Promise<OrcaRemoteQueueFile> {
  try {
    const raw = await readFile(ORCA_QUEUE_FILE(), 'utf8');
    const parsed = JSON.parse(raw) as OrcaRemoteQueueFile;
    return {
      pending: Array.isArray(parsed?.pending) ? parsed.pending : [],
      results: parsed?.results && typeof parsed.results === 'object' ? parsed.results : {},
    };
  } catch {
    return { pending: [], results: {} };
  }
}

export function enqueueRemoteOrcaCommand(cmd: OrcaPendingCommand): Promise<OrcaPendingCommand> {
  return comFilaSerializada(async () => {
    const queue = await readRemoteQueue();
    queue.pending.push(cmd);
    // Mantém no máximo 30 pendentes
    if (queue.pending.length > 30) {
      queue.pending = queue.pending.slice(-30);
    }
    await writeJsonAtomic(ORCA_QUEUE_FILE(), queue);
    return cmd;
  });
}

/**
 * Entrega os comandos pendentes (arquivo + voláteis) ao relay e grava os resultados que
 * ele trouxe. Comando expirado não é entregue: vira resultado `expirado` na hora.
 */
export function consumePendingAndSaveResults(
  completedResults?: OrcaCommandResult[],
): Promise<OrcaPendingCommand[]> {
  return comFilaSerializada(async () => {
    const queue = await readRemoteQueue();
    const agora = Date.now();
    const candidatos = [...queue.pending, ...volatilePending.splice(0)];
    const toExecute: OrcaPendingCommand[] = [];
    const resultados: OrcaCommandResult[] = Array.isArray(completedResults) ? [...completedResults] : [];
    for (const cmd of candidatos) {
      if (comandoExpirado(cmd, agora)) {
        resultados.push({
          id: cmd.id,
          ok: false,
          completedAt: new Date(agora).toISOString(),
          error: 'expirado',
        });
      } else {
        toExecute.push(cmd);
      }
    }
    for (const r of resultados) {
      queue.results[r.id] = r;
    }
    // Limpa resultados antigos mantendo os últimos 50
    const keys = Object.keys(queue.results);
    if (keys.length > 50) {
      for (const k of keys.slice(0, keys.length - 50)) {
        delete queue.results[k];
      }
    }
    queue.pending = [];
    await writeJsonAtomic(ORCA_QUEUE_FILE(), queue);
    return toExecute;
  });
}

function emptyOrcaSnapshot(): OrcaSnapshot {
  return {
    available: false,
    source: 'unavailable',
    runtimeId: null,
    appVersion: null,
    runtimeState: null,
    connectionState: null,
    hostLabel: null,
    updatedAt: new Date().toISOString(),
    bySlug: {},
    allWorktreesCount: 0,
    activeAgentsCount: 0,
    terminalsCount: 0,
    hosts: [],
    environments: [],
    allWorktrees: [],
    repos: {},
  };
}

async function readWatchFile(): Promise<WatchTerminais> {
  try {
    const parsed = JSON.parse(await readFile(ORCA_WATCH_FILE(), 'utf8')) as WatchTerminais;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Marca um terminal como assistido por um stream na nuvem, valendo por `validadeMs`.
 * O stream renova enquanto está aberto; o relay lê isso no `sync_push` e passa a
 * ler a tela desse terminal a cada ciclo, com ciclo mais curto.
 */
export async function registrarWatchTerminal(
  terminalHandle: string,
  validadeMs = 30_000,
): Promise<void> {
  const agora = Date.now();
  const atual = await readWatchFile();
  const vivo: WatchTerminais = {};
  for (const h of filtrarWatchValido(atual, agora)) vivo[h] = atual[h];
  vivo[terminalHandle] = agora + validadeMs;
  await writeJsonAtomic(ORCA_WATCH_FILE(), vivo);
}

/** Handles de terminal com stream aberto na nuvem e prazo ainda válido. */
export async function lerWatchAtivo(): Promise<string[]> {
  return filtrarWatchValido(await readWatchFile(), Date.now());
}

/**
 * Tela de um terminal como veio no último snapshot sincronizado (caminho da nuvem,
 * sem CLI). `null` quando o handle não aparece no snapshot.
 */
export async function readSyncedTerminalScreen(
  terminalHandle: string,
): Promise<{ tail: string[]; draft?: string | null; status?: string } | null> {
  const snap = await readSyncedOrcaSnapshot();
  if (!snap) return null;
  for (const proj of Object.values(snap.bySlug)) {
    const ag = proj.agents.find((a) => a.terminalHandle === terminalHandle);
    if (ag && Array.isArray(ag.screenTail)) {
      return { tail: ag.screenTail, draft: ag.draft ?? null, status: 'running' };
    }
  }
  return null;
}

/**
 * Obtém o snapshot do Orca (tenta primeiro CLI local; se não houver, cai para o snapshot sincronizado na nuvem).
 */
export async function getOrcaSnapshot(forceFresh = false): Promise<OrcaSnapshot> {
  const local = await readLocalOrcaSnapshot(forceFresh);
  if (local) return local;

  const synced = await readSyncedOrcaSnapshot();
  if (synced) return synced;

  return emptyOrcaSnapshot();
}

/** Idade do snapshot e se o relay está vivo (snapshot remoto com menos de 60 s). */
export function orcaSnapshotHealth(snapshot: OrcaSnapshot): { ageMs: number; relayOk: boolean } {
  const ts = Date.parse(snapshot.updatedAt);
  const ageMs = Number.isFinite(ts) ? Math.max(0, Date.now() - ts) : Number.MAX_SAFE_INTEGER;
  const relayOk = snapshot.source === 'local-cli' || (snapshot.source === 'remote-sync' && ageMs < 60_000);
  return { ageMs, relayOk };
}
