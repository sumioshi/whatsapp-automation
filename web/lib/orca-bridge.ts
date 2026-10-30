import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { writeJsonAtomic } from './json-store';
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

export interface OrcaSnapshot {
  available: boolean;
  source: 'local-cli' | 'remote-sync' | 'unavailable';
  runtimeId: string | null;
  appVersion: string | null;
  updatedAt: string;
  bySlug: Record<string, OrcaProjectAgentInfo>;
  allWorktreesCount: number;
  activeAgentsCount: number;
}

export interface OrcaPendingCommand {
  id: string;
  createdAt: string;
  acao: 'enviar_prompt' | 'iniciar_agente' | 'interromper' | 'focar_orca' | 'enviar_teclas';
  slug?: string;
  terminalHandle?: string;
  worktreePath?: string;
  text?: string;
  agentType?: string;
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

/**
 * Mapeamento direto dos slugs de grupos/DMs de clientes para o nome da pasta do worktree
 * ou nome do repositório registrado no Orca.
 */
export const SLUG_TO_ORCA_FOLDER: Record<string, string[]> = {
  'projeto-02': ['projeto-180', 'projeto-154'],
  'projeto-01': ['projeto-139', 'projeto-144'],
  'dm-5511900000070': ['projeto-166'],
  'projeto-128': ['projeto-187'],
  'projeto-05': ['projeto-186'],
  'projeto-30': ['projeto-146', 'projeto-125'],
  'projeto-38': ['projeto-151'],
  'projeto-116': ['projeto-184', 'projeto-88', 'projeto-32', 'projeto-86'],
  'projeto-44': ['projeto-110'],
  'projeto-46': ['projeto-153'],
  'projeto-87': ['projeto-162'],
  'projeto-10': ['projeto-127'],
  'projeto-108': ['projeto-176'],
  'projeto-97': ['projeto-101'],
  'projeto-113': ['projeto-177'],
  'projeto-152': ['projeto-189'],
  'projeto-29': ['projeto-136'],
  'projeto-23': ['projeto-112', 'projeto-124'],
  'projeto-98': ['projeto-178'],
  'projeto-114': ['projeto-109', 'projeto-48', 'projeto-14'],
  'projeto-99': ['projeto-145'],
  'projeto-33': ['Projeto 174'],
  'projeto-45': ['Projeto 165'],
  'projeto-89': ['Projeto 161'],
  'projeto-16': ['projeto-100', 'projeto-132'],
  'projeto-08': ['projeto-168', 'projeto-123'],
  'projeto-31': ['projeto-167'],
  'projeto-115': ['projeto-126', 'projeto-179'],
};

let resolvedOrcaBin: string | null | undefined;

export function getOrcaBin(): string | null {
  if (resolvedOrcaBin !== undefined) return resolvedOrcaBin;

  const candidates = [
    process.env.ORCA_CLI_COMMAND,
    join(homedir(), '.local', 'bin', 'orca'),
    '/usr/local/bin/orca',
    '/opt/homebrew/bin/orca',
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

// Cache rápido em memória para chamadas ao CLI local (evita múltiplos spawns simultâneos)
let localSnapshotCache: { ts: number; data: OrcaSnapshot } | null = null;
const LOCAL_CACHE_TTL_MS = 2500;

export async function readLocalOrcaSnapshot(forceFresh = false): Promise<OrcaSnapshot | null> {
  if (!getOrcaBin()) return null;

  const now = Date.now();
  if (!forceFresh && localSnapshotCache && now - localSnapshotCache.ts < LOCAL_CACHE_TTL_MS) {
    return localSnapshotCache.data;
  }

  const [psRes, termRes] = await Promise.all([
    runOrcaJson<{
      ok?: boolean;
      result?: { worktrees?: RawOrcaWorktree[] };
      _meta?: { runtimeId?: string };
    }>(['worktree', 'ps']),
    runOrcaJson<{
      ok?: boolean;
      result?: { terminals?: RawOrcaTerminal[] };
    }>(['terminal', 'list']),
  ]);

  if (!psRes?.ok || !psRes.result?.worktrees) {
    return null;
  }

  const worktrees = psRes.result.worktrees;
  const terminals = termRes?.result?.terminals ?? [];

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

  for (const [slug, folderCandidates] of Object.entries(SLUG_TO_ORCA_FOLDER)) {
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

  const snapshot: OrcaSnapshot = {
    available: true,
    source: 'local-cli',
    runtimeId: psRes._meta?.runtimeId ?? null,
    appVersion: null,
    updatedAt: new Date(now).toISOString(),
    bySlug,
    allWorktreesCount: worktrees.length,
    activeAgentsCount,
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
    const parsed = JSON.parse(raw) as OrcaSnapshot;
    if (!parsed || typeof parsed !== 'object' || !parsed.bySlug) return null;
    return {
      ...parsed,
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

export async function enqueueRemoteOrcaCommand(
  cmd: OrcaPendingCommand,
): Promise<OrcaPendingCommand> {
  const queue = await readRemoteQueue();
  queue.pending.push(cmd);
  // Mantém no máximo 30 pendentes
  if (queue.pending.length > 30) {
    queue.pending = queue.pending.slice(-30);
  }
  await writeJsonAtomic(ORCA_QUEUE_FILE(), queue);
  return cmd;
}

export async function consumePendingAndSaveResults(
  completedResults?: OrcaCommandResult[],
): Promise<OrcaPendingCommand[]> {
  const queue = await readRemoteQueue();
  if (Array.isArray(completedResults) && completedResults.length > 0) {
    for (const r of completedResults) {
      queue.results[r.id] = r;
    }
    // Limpa resultados antigos mantendo os últimos 50
    const keys = Object.keys(queue.results);
    if (keys.length > 50) {
      for (const k of keys.slice(0, keys.length - 50)) {
        delete queue.results[k];
      }
    }
  }
  const toExecute = [...queue.pending];
  queue.pending = [];
  await writeJsonAtomic(ORCA_QUEUE_FILE(), queue);
  return toExecute;
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

  return {
    available: false,
    source: 'unavailable',
    runtimeId: null,
    appVersion: null,
    updatedAt: new Date().toISOString(),
    bySlug: {},
    allWorktreesCount: 0,
    activeAgentsCount: 0,
  };
}
