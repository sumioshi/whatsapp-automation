import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('modo LOCAL (sem flag) — delega à lib, não toca a rede', () => {
  it('dsGroupMessages não chama fetch e devolve o que a lib local devolve', async () => {
    vi.stubEnv('WAC_CLOUD_URL', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.doMock('./data', () => ({
      readGroupMessages: vi.fn(async () => [{ id: 'm1' }]),
      listGroups: vi.fn(async () => []),
    }));
    const { dsGroupMessages } = await import('./data-source');
    expect(await dsGroupMessages('g')).toEqual([{ id: 'm1' }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('modo REMOTO (flag=1) — busca via HTTP', () => {
  beforeEach(() => {
    vi.stubEnv('WAC_MCP_REMOTE', '1');
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.stubEnv('WAC_CLOUD_USER', 'u');
    vi.stubEnv('WAC_CLOUD_PASS', 'p');
  });

  it('dsGroupMessages chama /api/messages?slug=', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([{ id: 'r1' }]), { status: 200 }));
    const { dsGroupMessages } = await import('./data-source');
    expect(await dsGroupMessages('meu-grupo')).toEqual([{ id: 'r1' }]);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/messages?slug=meu-grupo',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('dsContacts rehidrata os Maps/Sets de /api/contacts/raw', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          names: [['123', 'Fulano']],
          ownIds: ['999'],
          teamIds: ['123'],
          phones: [['123', '5511999']],
          lids: ['abc'],
          hasSidecar: true,
        }),
        { status: 200 },
      ),
    );
    const { dsContacts } = await import('./data-source');
    const c = await dsContacts();
    expect(c.names.get('123')).toBe('Fulano');
    expect(c.ownIds.has('999')).toBe(true);
    expect(c.teamIds.has('123')).toBe(true);
    expect(c.phones.get('123')).toBe('5511999');
    expect(c.lids.has('abc')).toBe(true);
    expect(c.hasSidecar).toBe(true);
  });

  it('dsTriage busca /api/triage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ autonomo: { g: true } }), { status: 200 }),
    );
    const { dsTriage } = await import('./data-source');
    expect((await dsTriage()).autonomo).toEqual({ g: true });
  });
});
