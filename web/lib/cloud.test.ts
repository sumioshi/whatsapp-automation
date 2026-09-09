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
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it('lança em HTTP não-2xx', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('erro', { status: 500 }));
    const { cloudPost } = await import('./cloud');
    await expect(cloudPost('/api/send', {})).rejects.toThrow(/500/);
  });
  it('propaga a mensagem real do erro (corpo {error}) da rota', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'arquivo não encontrado: x.jpg' }), { status: 400 }),
    );
    const { cloudPost } = await import('./cloud');
    await expect(cloudPost('/api/send-media-json', {})).rejects.toThrow(/arquivo não encontrado: x\.jpg/);
  });
});

describe('cloudPostForm', () => {
  it('POST multipart com Basic Auth e SEM Content-Type manual (fetch põe o boundary)', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.stubEnv('WAC_CLOUD_USER', 'u');
    vi.stubEnv('WAC_CLOUD_PASS', 'p');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { cloudPostForm } = await import('./cloud');
    const form = new FormData();
    form.set('jid', 'x@g.us');
    await cloudPostForm('/api/send-media-json', form);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://nuvem.exemplo/api/send-media-json');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(form);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(headers['Content-Type']).toBeUndefined();
  });
  it('propaga a mensagem real do erro', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'kind inválido' }), { status: 400 }),
    );
    const { cloudPostForm } = await import('./cloud');
    await expect(cloudPostForm('/api/send-media-json', new FormData())).rejects.toThrow(/kind inválido/);
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

describe('cloudPost — cancelamento', () => {
  it('repassa o sinal de quem chama: fetch recebe um signal já abortado quando o chamador abortou', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { cloudPost } = await import('./cloud');
    await cloudPost('/api/send', {}, { signal: AbortSignal.abort() });
    const init = fetchSpy.mock.calls[0]?.[1] as { signal: AbortSignal };
    expect(init.signal.aborted).toBe(true);
  });

  it('sem sinal de fora, o fetch ainda tem o timeout (signal não abortado)', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { cloudPost } = await import('./cloud');
    await cloudPost('/api/send', {});
    const init = fetchSpy.mock.calls[0]?.[1] as { signal: AbortSignal };
    expect(init.signal.aborted).toBe(false);
  });

  it('cloudPostForm também repassa o sinal', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { cloudPostForm } = await import('./cloud');
    await cloudPostForm('/api/send-media-json', new FormData(), { signal: AbortSignal.abort() });
    const init = fetchSpy.mock.calls[0]?.[1] as { signal: AbortSignal };
    expect(init.signal.aborted).toBe(true);
  });
});
