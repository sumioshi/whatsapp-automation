import { describe, expect, it } from 'vitest';
import { buscarUpstream } from './upstream-fetch.js';

type Fetch = typeof globalThis.fetch;

const GITHUB = [
  {
    sha: '0af2386abcdef0123456789',
    commit: {
      message: 'fix: advertise WIN_HYBRID instead of retired WIN32 (#2741)\n\ncorpo longo',
      author: { date: '2026-08-04T18:22:11Z' },
    },
  },
  {
    sha: '74af8ee0000000000000000',
    commit: {
      message: 'example: fix logging of contact upserts',
      author: { date: '2026-07-29T01:20:00Z' },
    },
  },
];

function fakeFetch(rotas: Record<string, { status: number; body: unknown }>): Fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const hit = Object.entries(rotas).find(([k]) => url.includes(k));
    if (!hit) throw new Error(`rota inesperada: ${url}`);
    const [, r] = hit;
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as Fetch;
}

describe('buscarUpstream', () => {
  it('lê commits da master (sha curto, data, primeira linha) e o dist-tag latest', async () => {
    const snap = await buscarUpstream(
      fakeFetch({
        'api.github.com/repos/WhiskeySockets/Baileys/commits': { status: 200, body: GITHUB },
        'registry.npmjs.org/-/package/baileys/dist-tags': {
          status: 200,
          body: { latest: '7.0.0-rc14', legacy: '6.7.24' },
        },
      }),
    );
    expect(snap.commits).toEqual([
      {
        sha: '0af2386',
        data: '2026-08-04',
        titulo: 'fix: advertise WIN_HYBRID instead of retired WIN32 (#2741)',
      },
      { sha: '74af8ee', data: '2026-07-29', titulo: 'example: fix logging of contact upserts' },
    ]);
    expect(snap.versaoNpm).toBe('7.0.0-rc14');
  });

  it('GitHub fora (rate limit 403) derruba a busca inteira — o loop tenta depois', async () => {
    await expect(
      buscarUpstream(
        fakeFetch({
          'api.github.com': { status: 403, body: { message: 'rate limit' } },
          'registry.npmjs.org': { status: 200, body: { latest: '7.0.0-rc14' } },
        }),
      ),
    ).rejects.toThrow(/403/);
  });

  it('npm fora não derruba: commits vêm e versaoNpm fica null', async () => {
    const snap = await buscarUpstream(
      fakeFetch({
        'api.github.com': { status: 200, body: GITHUB },
        'registry.npmjs.org': { status: 500, body: {} },
      }),
    );
    expect(snap.commits).toHaveLength(2);
    expect(snap.versaoNpm).toBeNull();
  });
});

describe('versaoBaileysInstalada', () => {
  it('lê a versão do baileys que está no node_modules (a que o coletor roda)', async () => {
    const { versaoBaileysInstalada } = await import('./upstream-fetch.js');
    const v = versaoBaileysInstalada();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
    // fonte da verdade: o package.json instalado
    const { createRequire } = await import('node:module');
    const esperado = (
      createRequire(import.meta.url)('../../node_modules/baileys/package.json') as {
        version: string;
      }
    ).version;
    expect(v).toBe(esperado);
  });
});

describe('buscarUpstream — autenticação no GitHub', () => {
  function fetchCapturando(
    headersVistos: Record<string, string | undefined>[],
  ): typeof globalThis.fetch {
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const h = init?.headers as Record<string, string> | undefined;
      if (url.includes('api.github.com')) headersVistos.push({ authorization: h?.authorization });
      const body = url.includes('api.github.com') ? [] : { latest: '7.0.0-rc14' };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof globalThis.fetch;
  }

  it('com token manda Authorization: Bearer (IP compartilhado da nuvem toma 403 sem isso)', async () => {
    const vistos: Record<string, string | undefined>[] = [];
    await buscarUpstream(fetchCapturando(vistos), { token: 'ghp_x' });
    expect(vistos[0]?.authorization).toBe('Bearer ghp_x');
  });

  it('sem token não manda Authorization', async () => {
    const vistos: Record<string, string | undefined>[] = [];
    await buscarUpstream(fetchCapturando(vistos), { token: null });
    expect(vistos[0]?.authorization).toBeUndefined();
  });
});
