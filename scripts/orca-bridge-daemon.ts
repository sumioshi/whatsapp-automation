/**
 * Daemon da ponte Orca: mantém o relay Mac -> nuvem vivo mesmo sem nenhuma sessão de
 * Claude Code (o MCP também roda o relay, mas só enquanto está aberto). A cada ciclo
 * lê o estado do Orca pela CLI local, publica o snapshot no painel da nuvem e executa
 * os comandos que a UI enfileirou lá. O lock em tmpdir garante que só um processo
 * sincroniza por vez (MCP ou daemon, quem pegou primeiro).
 *
 * Rodar: `npm run orca-bridge` (carrega o .env da raiz). Variáveis:
 *   WAC_CLOUD_URL/USER/PASS        destino principal (sem elas o daemon sai com código 2)
 *   WAC_PESSOAL_URL/USER/PASS      segundo destino (coletor pessoal), opcional
 *   WAC_DATA_DIR                   raiz dos dados (default ./data)
 *   WAC_ORCA_BRIDGE_INTERVALO_MS   intervalo do ciclo (default 3500: snapshot na nuvem < 10 s)
 *   WAC_ORCA_BRIDGE_VERBOSE=1      loga todo ciclo (default: só erro)
 */
import { resolve } from 'node:path';
import type { OrcaRelayDestino } from '../web/lib/orca-relay';

// As libs do painel resolvem DATA_DIR por env — fixa antes de importá-las (dinâmico).
const DATA_DIR = process.env.WAC_DATA_DIR ?? resolve(process.cwd(), 'data');
process.env.WAC_DATA_DIR = DATA_DIR;

const INTERVALO_MS = Number(process.env.WAC_ORCA_BRIDGE_INTERVALO_MS ?? '3500');
const VERBOSE = process.env.WAC_ORCA_BRIDGE_VERBOSE === '1';

function log(msg: string): void {
  console.log(`[orca-bridge ${new Date().toISOString()}] ${msg}`);
}

async function main(): Promise<void> {
  const { cloudDestinoDoEnv } = await import('../web/lib/cloud');
  const { getOrcaBin } = await import('../web/lib/orca-bridge');
  const { startOrcaRemoteRelayLoop } = await import('../web/lib/orca-relay');

  const bin = getOrcaBin();
  if (!bin) {
    console.error('[orca-bridge] CLI do Orca não encontrada (ORCA_CLI_COMMAND, ~/.local/bin/orca, /Applications/Orca.app).');
    process.exit(2);
  }
  const principal = cloudDestinoDoEnv();
  if (!principal) {
    console.error('[orca-bridge] WAC_CLOUD_URL ausente: nada para sincronizar. Configure o trio WAC_CLOUD_* no .env da raiz.');
    process.exit(2);
  }

  // Principal (business) sempre; o coletor pessoal entra se o trio dele existir.
  const destinos: OrcaRelayDestino[] = [{ ...principal, rotulo: 'principal' }];
  if (process.env.WAC_PESSOAL_URL) {
    destinos.push({
      url: process.env.WAC_PESSOAL_URL,
      user: process.env.WAC_PESSOAL_USER,
      pass: process.env.WAC_PESSOAL_PASS,
      rotulo: 'pessoal',
    });
  }

  log(
    `iniciando · cli=${bin} · destinos=${destinos.map((d) => `${d.rotulo}=${d.url}`).join(' ')} · a cada ${INTERVALO_MS} ms`,
  );

  const ultimoErro = new Map<string, string>();
  startOrcaRemoteRelayLoop(INTERVALO_MS, {
    unref: false,
    destinos,
    onError: (err, destino) => {
      const msg = err instanceof Error ? err.message : String(err);
      // Um erro repetido (nuvem fora do ar) vira uma linha só, não uma por ciclo.
      if (msg !== ultimoErro.get(destino.url) || VERBOSE) log(`[${destino.rotulo}] ciclo falhou: ${msg}`);
      ultimoErro.set(destino.url, msg);
    },
    onCycle: ({ destino, lock, executed }) => {
      if (lock && ultimoErro.has(destino.url)) {
        log(`[${destino.rotulo}] ciclo voltou a funcionar`);
        ultimoErro.delete(destino.url);
      }
      if (VERBOSE) {
        log(
          lock
            ? `[${destino.rotulo}] ciclo ok · comandos executados: ${executed}`
            : `[${destino.rotulo}] ciclo pulado: outro processo segura o lock`,
        );
      }
    },
  });

  const parar = (sinal: string) => {
    log(`${sinal} recebido, encerrando`);
    process.exit(0);
  };
  process.on('SIGTERM', () => parar('SIGTERM'));
  process.on('SIGINT', () => parar('SIGINT'));
}

void main();
