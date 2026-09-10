import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

  it('dsGroupMessages chama /api/messages com all=1 (histórico inteiro, igual ao modo local)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([{ id: 'r1' }]), { status: 200 }));
    const { dsGroupMessages } = await import('./data-source');
    expect(await dsGroupMessages('meu-grupo')).toEqual([{ id: 'r1' }]);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/messages?slug=meu-grupo&all=1',
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

  it('dsSetTypos POSTa action typos no /api/triage', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { dsSetTypos } = await import('./data-source');
    await dsSetTypos('meu-grupo', true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/triage',
      expect.objectContaining({ body: JSON.stringify({ action: 'typos', slug: 'meu-grupo', value: true }) }),
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

  it('dsSendMedia remoto sobe os BYTES do arquivo local via multipart (não o path)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wac-send-'));
    const file = join(dir, 'foto.jpg');
    const bytes = Buffer.from('conteudo-binario-fake-da-imagem');
    await writeFile(file, bytes);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { dsSendMedia } = await import('./data-source');
    await dsSendMedia({ jid: 'x@g.us', kind: 'image', path: file, caption: 'oi', mimetype: 'image/jpeg', fileName: 'foto.jpg' });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://nuvem.exemplo/api/send-media-json');
    const form = (init as RequestInit).body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('jid')).toBe('x@g.us');
    expect(form.get('kind')).toBe('image');
    expect(form.get('caption')).toBe('oi');
    expect(form.get('mimetype')).toBe('image/jpeg');
    const fileField = form.get('file');
    expect(fileField).toBeInstanceOf(Blob);
    expect(Buffer.from(await (fileField as Blob).arrayBuffer())).toEqual(bytes);
  });

  it('dsSendMedia remoto encaminha o path (JSON) quando o arquivo não existe no disco local', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { dsSendMedia } = await import('./data-source');
    await dsSendMedia({ jid: 'x@g.us', kind: 'image', path: '/nao/existe/aqui.jpg' });
    const body = JSON.parse((fetchSpy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.path).toBe('/nao/existe/aqui.jpg');
    expect(body.dataBase64).toBeUndefined();
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

describe('cancelamento de envio', () => {
  it('REMOTO: dsSend repassa o sinal ao fetch e devolve cancelado/enviados da rota', async () => {
    vi.stubEnv('WAC_MCP_REMOTE', '1');
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.stubEnv('WAC_CLOUD_USER', 'u');
    vi.stubEnv('WAC_CLOUD_PASS', 'p');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, cancelado: true, enviados: 1, baloes: 3 }), { status: 200 }),
      );
    const { dsSend } = await import('./data-source');
    const ac = new AbortController();
    const r = await dsSend('x@g.us', 'oi', { humano: true }, { signal: ac.signal });
    expect(r).toEqual({ cancelado: true, enviados: 1, baloes: 3 });
    const init = fetchSpy.mock.calls[0]?.[1] as { signal: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
    ac.abort();
    expect(init.signal.aborted).toBe(true);
  });

  it('REMOTO: dsCancelarEnvio faz POST /api/cancelar-envio {jid}', async () => {
    vi.stubEnv('WAC_MCP_REMOTE', '1');
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.stubEnv('WAC_CLOUD_USER', 'u');
    vi.stubEnv('WAC_CLOUD_PASS', 'p');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, cancelado: true }), { status: 200 }));
    const { dsCancelarEnvio } = await import('./data-source');
    expect(await dsCancelarEnvio('x@g.us')).toEqual({ cancelado: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/cancelar-envio',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ jid: 'x@g.us' }) }),
    );
  });

  it('LOCAL: dsCancelarEnvio bate no control server', async () => {
    vi.stubEnv('WAC_MCP_REMOTE', '');
    vi.stubEnv('WAC_CLOUD_URL', '');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, cancelado: false }), { status: 200 }));
    const { dsCancelarEnvio } = await import('./data-source');
    expect(await dsCancelarEnvio('x@g.us')).toEqual({ cancelado: false });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(/127\.0\.0\.1:\d+\/cancelar-envio$/);
  });
});

describe('balões explícitos', () => {
  it('REMOTO: dsSend repassa baloes no body do /api/send', async () => {
    vi.stubEnv('WAC_MCP_REMOTE', '1');
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.stubEnv('WAC_CLOUD_USER', 'u');
    vi.stubEnv('WAC_CLOUD_PASS', 'p');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, baloes: 2 }), { status: 200 }));
    const { dsSend } = await import('./data-source');
    await dsSend('x@g.us', 'a\n\nb', { humano: true, baloes: ['a', 'b'] });
    const init = fetchSpy.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(init.body)).toMatchObject({ baloes: ['a', 'b'] });
  });
});
