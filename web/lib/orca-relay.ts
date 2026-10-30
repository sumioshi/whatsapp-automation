import { readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloudEnabled, cloudPost } from './cloud';
import {
  executeLocalOrcaCommand,
  getOrcaBin,
  type OrcaCommandResult,
  type OrcaPendingCommand,
  readLocalOrcaSnapshot,
  readLocalTerminalScreen,
} from './orca-bridge';

const LOCK_FILE = join(tmpdir(), 'wac-orca-remote-relay.lock');
const LOCK_STALE_MS = 12_000;

let relayStarted = false;
const screenCache = new Map<string, { ts: number; tail: string[]; draft?: string | null }>();

async function acquireOrRefreshLock(pid: number): Promise<boolean> {
  const now = Date.now();
  try {
    const raw = await readFile(LOCK_FILE, 'utf8');
    const parsed = JSON.parse(raw) as { pid?: number; ts?: number };
    if (parsed.pid && parsed.pid !== pid && parsed.ts && now - parsed.ts < LOCK_STALE_MS) {
      return false;
    }
  } catch {
    // lock não existe ou inválido
  }

  try {
    await writeFile(LOCK_FILE, JSON.stringify({ pid, ts: now }), 'utf8');
    return true;
  } catch {
    return false;
  }
}

export async function runSingleOrcaRelayCycle(
  pendingResults: OrcaCommandResult[] = [],
): Promise<OrcaCommandResult[]> {
  if (!cloudEnabled() || !getOrcaBin()) return [];

  const snapshot = await readLocalOrcaSnapshot(true);
  if (!snapshot) return [];

  const now = Date.now();
  // Anexa screenTail dos terminais ativos (com cache de 6s por terminal para leveza)
  const activeSlugs = Object.values(snapshot.bySlug).filter((p) => p.liveTerminalCount > 0);
  await Promise.all(
    activeSlugs.map(async (proj) => {
      for (const ag of proj.agents) {
        if (!ag.terminalHandle) continue;
        const cached = screenCache.get(ag.terminalHandle);
        if (cached && now - cached.ts < 6000) {
          ag.screenTail = cached.tail;
          ag.draft = cached.draft;
          continue;
        }
        const screen = await readLocalTerminalScreen(ag.terminalHandle);
        if (screen) {
          ag.screenTail = screen.tail;
          ag.draft = screen.draft;
          screenCache.set(ag.terminalHandle, {
            ts: now,
            tail: screen.tail,
            draft: screen.draft,
          });
        }
      }
    }),
  );

  const res = await cloudPost('/api/escritorio/orca', {
    acao: 'sync_push',
    snapshot,
    commandResults: pendingResults,
  });

  const data = (await res.json()) as {
    ok?: boolean;
    pendingCommands?: OrcaPendingCommand[];
  };

  const cmds = Array.isArray(data?.pendingCommands) ? data.pendingCommands : [];
  if (cmds.length === 0) return [];

  const results: OrcaCommandResult[] = [];
  for (const cmd of cmds) {
    const r = await executeLocalOrcaCommand(cmd);
    if (r.terminalHandle) {
      screenCache.delete(r.terminalHandle);
    }
    results.push(r);
  }
  return results;
}

export interface OrcaRelayLoopOptions {
  /** Chamado a cada ciclo que falhou (o hospedeiro decide se loga). */
  onError?: (err: unknown) => void;
  /** Chamado a cada ciclo concluído; `lock=false` = outro processo está sincronizando. */
  onCycle?: (info: { lock: boolean; executed: number }) => void;
  /** `false` mantém o processo vivo só pelo timer (daemon dedicado). */
  unref?: boolean;
}

/**
 * Inicia em background o loop de sincronização Mac -> Nuvem Railway.
 * Seguro para ser chamado em múltiplos processos (usa lockfile em /tmp).
 */
export function startOrcaRemoteRelayLoop(
  intervalMs = 4500,
  opts: OrcaRelayLoopOptions = {},
): void {
  if (relayStarted) return;
  if (!getOrcaBin()) return;
  relayStarted = true;

  const myPid = process.pid;
  let queuedResults: OrcaCommandResult[] = [];
  let running = false;

  const tick = async () => {
    if (running) return;
    if (!cloudEnabled()) return;
    running = true;
    try {
      const hasLock = await acquireOrRefreshLock(myPid);
      if (!hasLock) {
        opts.onCycle?.({ lock: false, executed: 0 });
        return;
      }

      const newResults = await runSingleOrcaRelayCycle(queuedResults);
      queuedResults = [];

      // Se acabamos de executar comandos vindos da nuvem, fazemos um push imediato
      // com os resultados e a tela atualizada para resposta < 1s no navegador!
      if (newResults.length > 0) {
        await runSingleOrcaRelayCycle(newResults);
      }
      opts.onCycle?.({ lock: true, executed: newResults.length });
    } catch (err) {
      // Silencioso em background para nunca afetar o processo hospedeiro
      opts.onError?.(err);
    } finally {
      running = false;
    }
  };

  setTimeout(() => void tick(), 800);
  const timer = setInterval(() => void tick(), intervalMs);
  if (opts.unref !== false && typeof timer.unref === 'function') {
    timer.unref();
  }
}
