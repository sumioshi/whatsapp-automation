import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Radar, type RadarDeps } from './radar.js';
import type { UpstreamSnapshot } from './upstream-core.js';

const SNAP_A: UpstreamSnapshot = {
  commits: [{ sha: '7e7b075', data: '2026-07-29', titulo: 'chore(release): v7.0.0-rc14' }],
  versaoNpm: '7.0.0-rc14',
};
const SNAP_B: UpstreamSnapshot = {
  commits: [
    { sha: '0af2386', data: '2026-08-04', titulo: 'fix: advertise WIN_HYBRID' },
    ...SNAP_A.commits,
  ],
  versaoNpm: '7.0.0-rc14',
};

let dataDir: string;
let enviados: { jid: string; text: string }[];
let buscas: number;
let snapshot: UpstreamSnapshot;

function deps(over: Partial<RadarDeps> = {}): RadarDeps {
  return {
    dataDir,
    connected: () => true,
    selfJid: () => 'me@s.whatsapp.net',
    sendText: async (jid, text) => {
      enviados.push({ jid, text });
    },
    lastActivityOf: () => null,
    phoneOf: () => null,
    upstream: {
      versaoInstalada: '7.0.0-rc14',
      buscar: async () => {
        buscas++;
        return snapshot;
      },
    },
    ...over,
  };
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'radar-upstream-'));
  enviados = [];
  buscas = 0;
  snapshot = SNAP_A;
  // upstream sempre "vencido" pra não depender de relógio; radar de pendências desligado.
  await writeFile(
    join(dataDir, 'radar.config.json'),
    JSON.stringify({ ativo: false, upstreamIntervaloH: 0 }),
  );
});
afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function statusUpstream(): Promise<{
  ultimoSha: string | null;
  ultimaVersaoNpm: string | null;
  verificadoEm: string | null;
}> {
  const raw = JSON.parse(await readFile(join(dataDir, '.radar-status.json'), 'utf8')) as {
    upstream: {
      ultimoSha: string | null;
      ultimaVersaoNpm: string | null;
      verificadoEm: string | null;
    };
  };
  return raw.upstream;
}

describe('Radar — vigia de upstream do Baileys', () => {
  it('primeira checagem só marca o ponto de partida, sem mandar nada', async () => {
    const radar = new Radar(deps());
    await radar.tickNow('manual');
    expect(buscas).toBe(1);
    expect(enviados).toEqual([]);
    expect(await statusUpstream()).toMatchObject({
      ultimoSha: '7e7b075',
      ultimaVersaoNpm: '7.0.0-rc14',
    });
  });

  it('commit novo na master vira aviso no self-chat e avança o sha visto', async () => {
    const radar = new Radar(deps());
    await radar.tickNow('manual');
    snapshot = SNAP_B;
    await radar.tickNow('manual');
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.jid).toBe('me@s.whatsapp.net');
    expect(enviados[0]?.text).toContain('0af2386');
    expect((await statusUpstream()).ultimoSha).toBe('0af2386');
  });

  it('estado sobrevive a restart: radar novo não re-avisa o que já avisou', async () => {
    const r1 = new Radar(deps());
    await r1.tickNow('manual');
    snapshot = SNAP_B;
    await r1.tickNow('manual');
    const r2 = new Radar(deps());
    await r2.start();
    await r2.tickNow('manual');
    expect(enviados).toHaveLength(1);
  });

  it('dentro do intervalo não busca de novo', async () => {
    await writeFile(
      join(dataDir, 'radar.config.json'),
      JSON.stringify({ ativo: false, upstreamIntervaloH: 24 }),
    );
    const radar = new Radar(deps());
    await radar.tickNow('manual');
    await radar.tickNow('manual');
    expect(buscas).toBe(1);
  });

  it('busca que falha não avança o estado e não derruba o tick', async () => {
    const radar = new Radar(
      deps({
        upstream: {
          versaoInstalada: '7.0.0-rc14',
          buscar: async () => {
            throw new Error('rate limit');
          },
        },
      }),
    );
    await expect(radar.tickNow('manual')).resolves.toBeTruthy();
    expect((await statusUpstream()).ultimoSha).toBeNull();
  });

  it('desligado por config (upstreamAtivo:false) nem busca', async () => {
    await writeFile(
      join(dataDir, 'radar.config.json'),
      JSON.stringify({ ativo: false, upstreamAtivo: false, upstreamIntervaloH: 0 }),
    );
    const radar = new Radar(deps());
    await radar.tickNow('manual');
    expect(buscas).toBe(0);
  });
});
