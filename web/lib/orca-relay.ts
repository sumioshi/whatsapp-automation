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
import { intervaloRelay } from './orca-terminal';

const LOCK_FILE = join(tmpdir(), 'wac-orca-remote-relay.lock');
const LOCK_STALE_MS = 12_000;

let relayStarted = false;
const screenCache = new Map<string, { ts: number; tail: string[]; draft?: string | null }>();
// Handles com stream aberto na nuvem (vem no retorno do sync_push): sem cache e ciclo curto.
let terminaisAssistidos = new Set<string>();

export function terminaisAssistidosAgora(): string[] {
  return [...terminaisAssistidos];
}

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
        if (cached && now - cached.ts < 6000 && !terminaisAssistidos.has(ag.terminalHandle)) {
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
    watch?: string[];
  };
  terminaisAssistidos = new Set(Array.isArray(data?.watch) ? data.watch : []);

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

/**
 * Inicia em background o loop de sincronização Mac -> Nuvem Railway.
 * Seguro para ser chamado em múltiplos processos (usa lockfile em /tmp).
 */
export function startOrcaRemoteRelayLoop(intervalMs = 4500): void {
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
      if (!hasLock) return;

      const newResults = await runSingleOrcaRelayCycle(queuedResults);
      queuedResults = [];

      // Se acabamos de executar comandos vindos da nuvem, fazemos um push imediato
      // com os resultados e a tela atualizada para resposta < 1s no navegador!
      if (newResults.length > 0) {
        await runSingleOrcaRelayCycle(newResults);
      }
    } catch {
      // Silencioso em background para nunca afetar o processo hospedeiro
    } finally {
      running = false;
    }
  };

  // Reagenda a cada passada: o intervalo encurta enquanto algum terminal está
  // sendo assistido pelo stream da nuvem e volta ao normal quando ninguém olha.
  const agendar = (ms: number) => {
    const timer = setTimeout(async () => {
      await tick();
      agendar(intervaloRelay(terminaisAssistidos.size, intervalMs));
    }, ms);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  };
  agendar(800);
}
