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

  it('dsSetAutonomo faz POST /api/triage {action:autonomo}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { dsSetAutonomo } = await import('./data-source');
    await dsSetAutonomo('meu-grupo', true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/triage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'autonomo', slug: 'meu-grupo', value: true }),
      }),
    );
  });

  it('dsSend faz POST /api/send', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { dsSend } = await import('./data-source');
    await dsSend('x@g.us', 'oi');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/send',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ jid: 'x@g.us', text: 'oi' }) }),
    );
  });

  it('dsEditarPerfil faz POST /api/profile', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { dsEditarPerfil } = await import('./data-source');
    await dsEditarPerfil({ status: 'fora do expediente' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/profile',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ status: 'fora do expediente' }) }),
    );
  });

  it('dsSend repassa humano/slug/typos no body do /api/send', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { dsSend } = await import('./data-source');
    await dsSend('120363000000000001@g.us', 'oi', { humano: true, slug: 'meu-grupo', typos: false });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/send',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ jid: '120363000000000001@g.us', text: 'oi', humano: true, slug: 'meu-grupo', typos: false }),
      }),
    );
  });

  it('dsEditMessage chama /api/edit-message', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { dsEditMessage } = await import('./data-source');
    await dsEditMessage('120363000000000001@g.us', 'ABC123', 'texto corrigido');
    expect(fetchSpy).toHaveBeenCalledWith('https://nuvem.exemplo/api/edit-message', expect.anything());
  });

  it('dsReact chama /api/react', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { dsReact } = await import('./data-source');
    await dsReact('120363000000000001@g.us', 'ABC123', '👍');
    expect(fetchSpy).toHaveBeenCalledWith('https://nuvem.exemplo/api/react', expect.anything());
  });
});

describe('escrita LOCAL — delega à lib, sem rede', () => {
  it('dsSetAutonomo chama setAutonomo e não faz fetch', async () => {
    vi.stubEnv('WAC_CLOUD_URL', '');
    const setAutonomo = vi.fn(async () => {});
    vi.doMock('./triage', () => ({ setAutonomo }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { dsSetAutonomo } = await import('./data-source');
    await dsSetAutonomo('g', true);
    expect(setAutonomo).toHaveBeenCalledWith('g', true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('dsGroupsConfig remoto — id tem que ser o JID real (bug do envio-por-slug)', () => {
  beforeEach(() => {
    vi.stubEnv('WAC_MCP_REMOTE', '1');
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.stubEnv('WAC_CLOUD_USER', 'u');
    vi.stubEnv('WAC_CLOUD_PASS', 'p');
  });

  it('devolve entries com id = jid @g.us (o responder usa id como destino do envio)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: '120363000000000001@g.us', name: 'Teste', watch: true, tags: [] },
        ]),
        { status: 200 },
      ),
    );
    const { dsGroupsConfig } = await import('./data-source');
    const groups = await dsGroupsConfig();
    expect(groups[0].id).toBe('120363000000000001@g.us'); // jid, NUNCA o slug
    expect(groups[0].name).toBe('Teste');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/groups',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });
});
