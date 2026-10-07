import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroAgenda } from './evento';
import { respostaDeErroAgenda } from './resposta';
import type { TokenGuardado } from './token-store';

let guardado: TokenGuardado | null;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('GOOGLE_CLIENT_ID', 'cid');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'cs');
  guardado = {
    refresh_token: 'rt',
    access_token: 'at',
    expira_em: Date.now() + 3_600_000,
    email: 'eu@exemplo.com',
    escopos: [],
  };
  vi.doMock('./token-store', () => ({
    lerToken: vi.fn(async () => guardado),
    gravarToken: vi.fn(async (t: TokenGuardado) => {
      guardado = t;
    }),
    apagarToken: vi.fn(async () => {
      guardado = null;
    }),
  }));
});

afterEach(() => {
  vi.doUnmock('./token-store');
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const FERIADOS = 'pt.brazilian#holiday@group.v.calendar.google.com';
const AGENDAS = {
  items: [
    { id: FERIADOS, summary: 'Feriados', accessRole: 'reader', backgroundColor: '#0b8043' },
    { id: 'eu@exemplo.com', summary: 'Eu', primary: true, accessRole: 'owner', backgroundColor: '#4285f4' },
  ],
};

type Rota = (url: URL, init?: RequestInit) => Response | undefined;

/** Google simulado: cada rota pode responder; a lista de agendas tem resposta padrão. */
function google(...rotas: Rota[]) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (entrada, init) => {
    const url = new URL(String(entrada));
    for (const r of rotas) {
      const res = r(url, init);
      if (res) return res;
    }
    if (url.pathname.endsWith('/users/me/calendarList')) return Response.json(AGENDAS);
    return new Response('{}', { status: 404 });
  });
}

const eventosPorAgenda: Rota = (url) => {
  if (!url.pathname.includes('/calendars/') || !url.pathname.endsWith('/events')) return undefined;
  return Response.json({
    items: url.pathname.includes('holiday')
      ? [{ id: 'f', summary: 'Feriado', start: { date: '2026-10-12' }, end: { date: '2026-10-13' } }]
      : [
          {
            id: 'c',
            summary: 'Call',
            start: { dateTime: '2026-10-08T14:00:00-03:00' },
            end: { dateTime: '2026-10-08T15:00:00-03:00' },
          },
        ],
  });
};

describe('estado e configuração', () => {
  it('sem credencial: não configurado, e chamadas recusam', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    const { estadoAgenda, listarAgendas } = await import('./calendario');
    expect(await estadoAgenda()).toEqual({ configurado: false, conectado: false, email: null, agendas: [] });
    await expect(listarAgendas()).rejects.toMatchObject({ codigo: 'nao_configurado' });
  });
  it('sem token: desconectado', async () => {
    guardado = null;
    const { estadoAgenda } = await import('./calendario');
    expect(await estadoAgenda()).toMatchObject({ configurado: true, conectado: false });
  });
  it('conectado traz e-mail e agendas com a principal primeiro', async () => {
    google();
    const { estadoAgenda } = await import('./calendario');
    const e = await estadoAgenda();
    expect([e.conectado, e.email, e.agendas.map((a) => a.id)]).toEqual([true, 'eu@exemplo.com', ['eu@exemplo.com', FERIADOS]]);
  });
});

describe('leitura', () => {
  it('eventos de todas as agendas, ordenados, com o id da agenda codificado na URL', async () => {
    const f = google(eventosPorAgenda);
    const { listarEventos } = await import('./calendario');
    const evs = await listarEventos('2026-10-05', '2026-10-19');
    expect(evs.map((e) => [e.id, e.agenda])).toEqual([
      ['c', 'eu@exemplo.com'],
      ['f', FERIADOS],
    ]);
    const urls = f.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/calendars/pt.brazilian%23holiday%40group.v.calendar.google.com/events?'))).toBe(
      true,
    );
    const q = new URL(urls.find((u) => u.includes('/events?'))!).searchParams;
    expect([q.get('timeMin'), q.get('timeMax'), q.get('singleEvents')]).toEqual([
      '2026-10-05T00:00:00-03:00',
      '2026-10-19T00:00:00-03:00',
      'true',
    ]);
  });
  it('filtra por agenda e guarda em cache até uma escrita', async () => {
    const f = google(eventosPorAgenda);
    const { listarEventos, limparCache } = await import('./calendario');
    await listarEventos('2026-10-05', '2026-10-12', ['eu@exemplo.com']);
    const antes = f.mock.calls.length;
    await listarEventos('2026-10-05', '2026-10-12', ['eu@exemplo.com']);
    expect(f.mock.calls.length).toBe(antes);
    limparCache();
    await listarEventos('2026-10-05', '2026-10-12', ['eu@exemplo.com']);
    expect(f.mock.calls.length).toBeGreaterThan(antes);
    expect(f.mock.calls.some((c) => String(c[0]).includes('holiday'))).toBe(false);
  });
  it('janela maior que 62 dias é recusada', async () => {
    google();
    const { listarEventos } = await import('./calendario');
    await expect(listarEventos('2026-10-01', '2027-01-01')).rejects.toMatchObject({ codigo: 'entrada_invalida' });
  });
  it('403 comum numa agenda pula só ela; 403 de limite derruba a leitura', async () => {
    const agendaSemAcesso: Rota = (url) =>
      url.pathname.includes('holiday') ? new Response('{}', { status: 403 }) : undefined;
    google(agendaSemAcesso, eventosPorAgenda);
    const m1 = await import('./calendario');
    expect((await m1.listarEventos('2026-10-05', '2026-10-12')).map((e) => e.id)).toEqual(['c']);

    vi.restoreAllMocks();
    vi.resetModules();
    const limite: Rota = (url) =>
      url.pathname.endsWith('/events')
        ? Response.json({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }, { status: 403 })
        : undefined;
    google(limite);
    const m2 = await import('./calendario');
    await expect(m2.listarEventos('2026-10-05', '2026-10-12')).rejects.toMatchObject({ codigo: 'google_indisponivel' });
  });
});

describe('token', () => {
  it('vencido: duas leituras ao mesmo tempo renovam uma vez só', async () => {
    guardado = { ...guardado!, expira_em: 0 };
    let renovacoes = 0;
    const f = google((url) => {
      if (url.hostname !== 'oauth2.googleapis.com') return undefined;
      renovacoes++;
      return Response.json({ access_token: 'novo', expires_in: 3600 });
    });
    const { listarAgendas } = await import('./calendario');
    await Promise.all([listarAgendas(), listarAgendas()]);
    expect(renovacoes).toBe(1);
    expect(guardado?.access_token).toBe('novo');
    const chamadaAoCalendario = f.mock.calls.find((c) => String(c[0]).includes('/calendarList'))!;
    expect(new Headers(chamadaAoCalendario[1]?.headers).get('authorization')).toBe('Bearer novo');
  });
  it('invalid_grant apaga o token e responde desconectado', async () => {
    guardado = { ...guardado!, expira_em: 0 };
    google((url) =>
      url.hostname === 'oauth2.googleapis.com' ? Response.json({ error: 'invalid_grant' }, { status: 400 }) : undefined,
    );
    const { listarAgendas } = await import('./calendario');
    await expect(listarAgendas()).rejects.toMatchObject({ codigo: 'desconectado' });
    expect(guardado).toBeNull();
  });
  it('401 com token dentro da validade força uma renovação e repete', async () => {
    let chamadas = 0;
    google((url, init) => {
      if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'novo', expires_in: 3600 });
      if (!url.pathname.endsWith('/calendarList')) return undefined;
      chamadas++;
      return new Headers(init?.headers).get('authorization') === 'Bearer novo'
        ? Response.json(AGENDAS)
        : new Response('', { status: 401 });
    });
    const { listarAgendas } = await import('./calendario');
    expect((await listarAgendas()).length).toBe(2);
    expect(chamadas).toBe(2);
  });
});

describe('escrita', () => {
  it('criar: principal por padrão, Meet pede conferência, sem convidado ninguém é avisado', async () => {
    const f = google((url, init) =>
      init?.method === 'POST' && url.pathname.endsWith('/events')
        ? Response.json({
            id: 'novo',
            summary: 'Call',
            start: { dateTime: '2026-10-08T14:00:00-03:00' },
            end: { dateTime: '2026-10-08T14:30:00-03:00' },
            hangoutLink: 'https://meet.google.com/x',
          })
        : undefined,
    );
    const { criarEvento } = await import('./calendario');
    const ev = await criarEvento({ titulo: 'Call', inicio: '2026-10-08T14:00', meet: true });
    expect([ev.id, ev.agenda, ev.meet]).toEqual(['novo', 'eu@exemplo.com', 'https://meet.google.com/x']);
    const [url, init] = f.mock.calls.find((c) => c[1]?.method === 'POST')!;
    const q = new URL(String(url)).searchParams;
    expect([q.get('sendUpdates'), q.get('conferenceDataVersion')]).toEqual(['none', '1']);
    expect(JSON.parse(String(init!.body))).toHaveProperty('conferenceData');
  });
  it('criar com convidado avisa por e-mail', async () => {
    const f = google((url, init) =>
      init?.method === 'POST'
        ? Response.json({
            id: 'n',
            start: { dateTime: '2026-10-08T14:00:00-03:00' },
            end: { dateTime: '2026-10-08T14:30:00-03:00' },
          })
        : undefined,
    );
    const { criarEvento } = await import('./calendario');
    await criarEvento({ titulo: 'Call', inicio: '2026-10-08T14:00', convidados: ['cliente@exemplo.com'] });
    const [url] = f.mock.calls.find((c) => c[1]?.method === 'POST')!;
    expect(new URL(String(url)).searchParams.get('sendUpdates')).toBe('all');
  });
  it('agenda só leitura recusa sem escrever no Google', async () => {
    const f = google();
    const { criarEvento } = await import('./calendario');
    await expect(criarEvento({ titulo: 'x', inicio: '2026-10-08T14:00', agenda: FERIADOS })).rejects.toMatchObject({
      codigo: 'somente_leitura',
    });
    expect(f.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);
  });
  it('editar: lê o atual, manda PATCH e avisa quem já está convidado', async () => {
    const atual = {
      id: 'c',
      summary: 'Call',
      start: { dateTime: '2026-10-08T14:00:00-03:00' },
      end: { dateTime: '2026-10-08T15:00:00-03:00' },
      attendees: [{ email: 'cliente@exemplo.com' }],
    };
    const f = google((url, init) => {
      if (!url.pathname.endsWith('/events/c')) return undefined;
      if (init?.method === 'PATCH') return Response.json({ ...atual, summary: 'Call nova' });
      return Response.json(atual);
    });
    const { editarEvento } = await import('./calendario');
    const ev = await editarEvento('eu@exemplo.com', 'c', { titulo: 'Call nova' });
    expect(ev.titulo).toBe('Call nova');
    const [url, init] = f.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(new URL(String(url)).searchParams.get('sendUpdates')).toBe('all');
    expect(JSON.parse(String(init!.body))).not.toHaveProperty('attendees');
  });
  it('editar convidados preserva sala, própria conta e respostas', async () => {
    const atual = {
      id: 'c',
      summary: 'Call',
      start: { dateTime: '2026-10-08T14:00:00-03:00' },
      end: { dateTime: '2026-10-08T15:00:00-03:00' },
      attendees: [
        { email: 'eu@exemplo.com', self: true },
        { email: 'sala@resource.exemplo', resource: true },
        { email: 'cliente@exemplo.com', responseStatus: 'accepted' },
      ],
    };
    const f = google((url, init) => {
      if (!url.pathname.endsWith('/events/c')) return undefined;
      return Response.json(atual);
    });
    const { editarEvento } = await import('./calendario');
    await editarEvento('eu@exemplo.com', 'c', { convidados: ['cliente@exemplo.com', 'novo@exemplo.com'] });
    const init = f.mock.calls.find((c) => c[1]?.method === 'PATCH')![1]!;
    expect(JSON.parse(String(init.body)).attendees).toEqual([
      { email: 'eu@exemplo.com', self: true },
      { email: 'sala@resource.exemplo', resource: true },
      { email: 'cliente@exemplo.com', responseStatus: 'accepted' },
      { email: 'novo@exemplo.com' },
    ]);
  });
  it('apagar evento que já sumiu responde nao_existe', async () => {
    google((url, init) => (init?.method === 'DELETE' ? new Response('', { status: 410 }) : undefined));
    const { apagarEvento } = await import('./calendario');
    await expect(apagarEvento('eu@exemplo.com', 'x')).rejects.toMatchObject({ codigo: 'nao_existe' });
  });
});

describe('respostaDeErroAgenda', () => {
  it('mapeia código para status e esconde erro inesperado', () => {
    expect(respostaDeErroAgenda(new ErroAgenda('desconectado'))).toEqual({
      status: 409,
      corpo: { error: 'agenda desconectada, reconecte em /agenda', codigo: 'desconectado' },
    });
    expect(respostaDeErroAgenda(new ErroAgenda('somente_leitura')).status).toBe(403);
    expect(respostaDeErroAgenda(new Error('segredo'))).toEqual({
      status: 500,
      corpo: { error: 'erro interno', codigo: 'erro_interno' },
    });
  });
});
