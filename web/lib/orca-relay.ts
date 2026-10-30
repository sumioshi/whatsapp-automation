import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CloudDestino, cloudDestinoDoEnv, cloudPostTo } from './cloud';
import {
  executeLocalOrcaCommand,
  getOrcaBin,
  type OrcaCommandResult,
  type OrcaPendingCommand,
  readLocalOrcaSnapshot,
  readLocalTerminalScreen,
} from './orca-bridge';
import { intervaloRelay } from './orca-terminal';

const LOCK_STALE_MS = 12_000;

let relayStarted = false;
const screenCache = new Map<string, { ts: number; tail: string[]; draft?: string | null }>();
// Handles com stream aberto na nuvem (vem no retorno do sync_push): sem cache e ciclo curto.
let terminaisAssistidos = new Set<string>();

export function terminaisAssistidosAgora(): string[] {
  return [...terminaisAssistidos];
}

/** Um destino do relay: o coletor na nuvem que recebe o snapshot (e devolve comandos). */
export type OrcaRelayDestino = CloudDestino & { rotulo?: string };

/**
 * Lock POR DESTINO: processos que sincronizam com coletores diferentes (business e
 * pessoal, por exemplo) não disputam o mesmo arquivo. Nome derivado da URL.
 */
export function orcaRelayLockFile(destino: CloudDestino): string {
  const hash = createHash('sha1').update(destino.url.replace(/\/+$/, '')).digest('hex').slice(0, 8);
  return join(tmpdir(), `wac-orca-relay-${hash}.lock`);
}

/**
 * Tenta ficar com o lock do destino. Lock de outro processo ainda fresco = recusa.
 * Lock livre, velho ou já nosso = aceita. Só grava quando está tomando (livre/velho):
 * a renovação é separada (`renewOrcaRelayLock`) e acontece apenas em ciclo bem-sucedido,
 * para um dono travado não segurar o lock além de LOCK_STALE_MS.
 */
export async function acquireOrcaRelayLock(lockFile: string, pid: number): Promise<boolean> {
  const now = Date.now();
  try {
    const raw = await readFile(lockFile, 'utf8');
    const parsed = JSON.parse(raw) as { pid?: number; ts?: number };
    if (parsed.pid === pid) return true;
    if (parsed.pid && parsed.ts && now - parsed.ts < LOCK_STALE_MS) return false;
  } catch {
    // lock não existe ou inválido
  }
  try {
    await writeFile(lockFile, JSON.stringify({ pid, ts: now }), 'utf8');
    return true;
  } catch {
    return false;
  }
}

export async function renewOrcaRelayLock(lockFile: string, pid: number): Promise<void> {
  try {
    await writeFile(lockFile, JSON.stringify({ pid, ts: Date.now() }), 'utf8');
  } catch {
    // sem lock renovado, outro processo assume depois de LOCK_STALE_MS — comportamento desejado
  }
}

/**
 * Um ciclo: lê o Orca local, publica no destino e executa os comandos que voltaram.
 * Sem `destino`, usa o trio `WAC_CLOUD_*`. Lança quando o push falha (quem chama decide
 * se renova o lock).
 */
export async function runSingleOrcaRelayCycle(
  pendingResults: OrcaCommandResult[] = [],
  destino: CloudDestino | null = cloudDestinoDoEnv(),
): Promise<OrcaCommandResult[]> {
  if (!destino || !getOrcaBin()) return [];

  const snapshot = await readLocalOrcaSnapshot(true);
  if (!snapshot) throw new Error('CLI do Orca não devolveu snapshot');

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

  const res = await cloudPostTo(destino, '/api/escritorio/orca', {
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

export interface OrcaRelayCycleInfo {
  destino: OrcaRelayDestino;
  /** false = outro processo está sincronizando este destino. */
  lock: boolean;
  executed: number;
}

export interface OrcaRelayLoopOptions {
  /** Destinos a alimentar; default = o trio `WAC_CLOUD_*` (lido a cada ciclo). */
  destinos?: OrcaRelayDestino[];
  /** Chamado a cada ciclo que falhou (o hospedeiro decide se loga). */
  onError?: (err: unknown, destino: OrcaRelayDestino) => void;
  /** Chamado a cada ciclo concluído. */
  onCycle?: (info: OrcaRelayCycleInfo) => void;
  /** `false` mantém o processo vivo só pelo timer (daemon dedicado). */
  unref?: boolean;
}

/**
 * Inicia em background o loop de sincronização Mac -> Nuvem Railway.
 * Seguro para ser chamado em múltiplos processos (lockfile em tmpdir, um por destino).
 */
export function startOrcaRemoteRelayLoop(
  intervalMs = 4500,
  opts: OrcaRelayLoopOptions = {},
): void {
  if (relayStarted) return;
  if (!getOrcaBin()) return;
  relayStarted = true;

  const myPid = process.pid;
  // Resultados de comandos executados que ainda não voltaram para o destino de origem.
  const queuedResults = new Map<string, OrcaCommandResult[]>();
  let running = false;

  const destinosDoCiclo = (): OrcaRelayDestino[] => {
    if (opts.destinos && opts.destinos.length > 0) return opts.destinos;
    const env = cloudDestinoDoEnv();
    return env ? [env] : [];
  };

  const cicloDoDestino = async (destino: OrcaRelayDestino) => {
    const lockFile = orcaRelayLockFile(destino);
    try {
      const hasLock = await acquireOrcaRelayLock(lockFile, myPid);
      if (!hasLock) {
        opts.onCycle?.({ destino, lock: false, executed: 0 });
        return;
      }

      const pendentes = queuedResults.get(destino.url) ?? [];
      queuedResults.set(destino.url, []);
      let newResults: OrcaCommandResult[];
      try {
        newResults = await runSingleOrcaRelayCycle(pendentes, destino);
      } catch (err) {
        // O push falhou: os resultados voltam para a fila e o lock NÃO é renovado.
        queuedResults.set(destino.url, pendentes);
        throw err;
      }
      await renewOrcaRelayLock(lockFile, myPid);

      // Se acabamos de executar comandos vindos da nuvem, fazemos um push imediato
      // com os resultados e a tela atualizada para resposta < 1s no navegador!
      if (newResults.length > 0) {
        try {
          await runSingleOrcaRelayCycle(newResults, destino);
        } catch (err) {
          queuedResults.set(destino.url, newResults);
          throw err;
        }
      }
      opts.onCycle?.({ destino, lock: true, executed: newResults.length });
    } catch (err) {
      // Silencioso em background para nunca afetar o processo hospedeiro
      opts.onError?.(err, destino);
    }
  };

  const tick = async () => {
    if (running) return;
    const destinos = destinosDoCiclo();
    if (destinos.length === 0) return;
    running = true;
    try {
      // Destinos em paralelo: um coletor lento ou fora do ar não atrasa o outro.
      await Promise.all(destinos.map((destino) => cicloDoDestino(destino)));
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
    if (opts.unref !== false && typeof timer.unref === 'function') {
      timer.unref();
    }
  };
  agendar(800);
}
