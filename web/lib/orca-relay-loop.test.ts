import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { OrcaCommandResult, OrcaPendingCommand, OrcaSnapshot } from './orca-bridge';

// O loop é testado com a CLI e a nuvem simuladas: o que importa é o comportamento do
// agendamento, do watch por destino e do retorno dos resultados.
const pushes: Array<{ url: string; commandResults: OrcaCommandResult[] }> = [];
const respostas = new Map<string, () => { pendingCommands?: OrcaPendingCommand[]; watch?: string[] }>();
let falharPush = false;

vi.mock('./orca-bridge', () => ({
  getOrcaBin: () => '/fake/orca',
  readLocalOrcaSnapshot: async (): Promise<OrcaSnapshot> =>
    ({ available: true, source: 'local-cli', bySlug: {}, updatedAt: new Date().toISOString() }) as OrcaSnapshot,
  readLocalTerminalScreen: async () => null,
  executeLocalOrcaCommand: async (cmd: OrcaPendingCommand): Promise<OrcaCommandResult> => ({
    id: cmd.id,
    ok: true,
    completedAt: new Date().toISOString(),
  }),
}));

vi.mock('./cloud', () => ({
  cloudDestinoDoEnv: () => null,
  cloudPostTo: async (destino: { url: string }, _path: string, body: { commandResults: OrcaCommandResult[] }) => {
    if (falharPush) throw new Error('nuvem fora');
    pushes.push({ url: destino.url, commandResults: body.commandResults });
    const resposta = respostas.get(destino.url)?.() ?? {};
    return { json: async () => ({ ok: true, ...resposta }) };
  },
}));

let tmp: string;
let relay: typeof import('./orca-relay');

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-orca-loop-'));
  // Locks do relay moram em tmpdir(): isolado por teste.
  process.env.TMPDIR = tmp;
  relay = await import('./orca-relay');
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('watch por destino', () => {
  it('a união sobrevive a um destino que responde sem watch', () => {
    relay.registrarTerminaisAssistidos('https://a', ['t1', 't2']);
    relay.registrarTerminaisAssistidos('https://b', ['t2', 't3']);
    expect([...relay.terminaisAssistidosAgora()].sort()).toEqual(['t1', 't2', 't3']);
    relay.registrarTerminaisAssistidos('https://b', []);
    expect([...relay.terminaisAssistidosAgora()].sort()).toEqual(['t1', 't2']);
    relay.registrarTerminaisAssistidos('https://a', []);
    expect(relay.terminaisAssistidosAgora()).toEqual([]);
  });
});

describe('loop do relay', () => {
  it('sobrevive a callback que lança, devolve o resultado do push imediato e mantém o watch por destino', async () => {
    const A = 'https://a.example';
    const B = 'https://b.example';
    // A devolve um comando no 1º push e, no push imediato seguinte, outro comando + watch.
    let pushesA = 0;
    respostas.set(A, () => {
      pushesA++;
      if (pushesA === 1) return { pendingCommands: [{ id: 'c1', createdAt: '', acao: 'focar_orca' }], watch: ['tA'] };
      if (pushesA === 2) return { pendingCommands: [{ id: 'c2', createdAt: '', acao: 'focar_orca' }], watch: ['tA'] };
      return { watch: ['tA'] };
    });
    respostas.set(B, () => ({}));

    const ciclos: Array<{ url: string; lock: boolean }> = [];
    let erros = 0;
    relay.startOrcaRemoteRelayLoop(30, {
      destinos: [{ url: A }, { url: B }],
      unref: false,
      onCycle: (info) => {
        ciclos.push({ url: info.destino.url, lock: info.lock });
        // Callback que lança não pode matar o loop (item do revisor).
        if (ciclos.length === 1) throw new Error('callback quebrado');
      },
      onError: () => {
        erros++;
        // O onCycle quebrado cai aqui; este também lança, direto no agendamento.
        if (erros === 1) throw new Error('onError quebrado');
      },
    });

    // O primeiro ciclo sai em 800 ms; depois, a cada 30 ms.
    await esperar(1500);

    // O loop continuou depois dos callbacks que lançaram.
    expect(ciclos.filter((c) => c.url === A && c.lock).length).toBeGreaterThan(5);
    expect(ciclos.filter((c) => c.url === B && c.lock).length).toBeGreaterThan(5);
    expect(erros).toBe(1);

    // c1 foi executado e devolvido no push imediato; c2 (vindo do push imediato) voltou no ciclo seguinte.
    const devolvidosA = pushes.filter((p) => p.url === A).flatMap((p) => p.commandResults.map((r) => r.id));
    expect(devolvidosA).toContain('c1');
    expect(devolvidosA).toContain('c2');
    // B nunca recebeu resultado de A.
    expect(pushes.filter((p) => p.url === B).flatMap((p) => p.commandResults)).toEqual([]);

    // Watch de A permanece mesmo com B respondendo sem watch a cada ciclo.
    expect(relay.terminaisAssistidosAgora()).toEqual(['tA']);
  });
});
