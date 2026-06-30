import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules(); // cloud.ts lê env na hora da chamada; reimporta limpo
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('mcpRemote', () => {
  it('false quando a flag não está setada (mesmo com cloud configurado)', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    const { mcpRemote } = await import('./cloud');
    expect(mcpRemote()).toBe(false);
  });
  it('false quando flag=1 mas sem WAC_CLOUD_URL (cinto de segurança)', async () => {
    vi.stubEnv('WAC_MCP_REMOTE', '1');
    vi.stubEnv('WAC_CLOUD_URL', '');
    const { mcpRemote } = await import('./cloud');
    expect(mcpRemote()).toBe(false);
  });
  it('true quando flag=1 E cloud configurado', async () => {
    vi.stubEnv('WAC_MCP_REMOTE', '1');
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    const { mcpRemote } = await import('./cloud');
    expect(mcpRemote()).toBe(true);
  });
  it('false quando flag tem outro valor', async () => {
    vi.stubEnv('WAC_MCP_REMOTE', 'true');
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    const { mcpRemote } = await import('./cloud');
    expect(mcpRemote()).toBe(false);
  });
});

describe('cloudPost', () => {
  it('POST com Basic Auth, JSON body e timeout', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.stubEnv('WAC_CLOUD_USER', 'u');
    vi.stubEnv('WAC_CLOUD_PASS', 'p');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { cloudPost } = await import('./cloud');
    await cloudPost('/api/send', { jid: 'x@g.us', text: 'oi' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('u:p').toString('base64')}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ jid: 'x@g.us', text: 'oi' }),
      }),
    );
  });
  it('lança em HTTP não-2xx', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('erro', { status: 500 }));
    const { cloudPost } = await import('./cloud');
    await expect(cloudPost('/api/send', {})).rejects.toThrow(/500/);
  });
});

describe('cloudJson', () => {
  it('faz GET e parseia JSON', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ a: 1 }]), { status: 200 }),
    );
    const { cloudJson } = await import('./cloud');
    expect(await cloudJson('/api/x')).toEqual([{ a: 1 }]);
  });
});
