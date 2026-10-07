import { randomUUID } from 'node:crypto';
import {
  type Agenda,
  type EntradaEvento,
  ErroAgenda,
  type EstadoAgenda,
  type Evento,
  type GoogleAgenda,
  type GoogleEvento,
  type PatchEvento,
  agendaDoGoogle,
  comFuso,
  corpoDaEdicao,
  corpoDoGoogle,
  eventoDoGoogle,
  instanteDe,
  mesclarConvidados,
  validarEntrada,
} from './evento';
import { configOAuth, renovar } from './oauth';
import { apagarToken, gravarToken, lerToken } from './token-store';

const API = 'https://www.googleapis.com/calendar/v3';
const CACHE_MS = 15_000;
const JANELA_MAX_MS = 62 * 86_400_000;
const LIMITE_DE_USO = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded']);

const cache = new Map<string, { em: number; valor: unknown }>();
let renovando: Promise<string> | null = null;

/** Toda escrita (e conectar/desconectar) limpa o cache: a leitura seguinte vai ao Google. */
export function limparCache(): void {
  cache.clear();
}

async function comCache<T>(chave: string, carregar: () => Promise<T>): Promise<T> {
  const c = cache.get(chave);
  if (c && Date.now() - c.em < CACHE_MS) return c.valor as T;
  const valor = await carregar();
  cache.set(chave, { em: Date.now(), valor });
  return valor;
}

/** Access token válido. Pedidos simultâneos com token vencido dividem uma renovação só. */
async function accessToken(forcar = false): Promise<string> {
  const cfg = configOAuth();
  if (!cfg) throw new ErroAgenda('nao_configurado');
  if (renovando) return renovando;
  const t = await lerToken();
  if (!t) throw new ErroAgenda('desconectado');
  if (!forcar && t.access_token && t.expira_em - 60_000 > Date.now()) return t.access_token;
  if (renovando) return renovando;
  renovando = (async () => {
    try {
      const novo = await renovar(cfg, t.refresh_token);
      await gravarToken({
        ...t,
        access_token: novo.access_token,
        expira_em: Date.now() + novo.expires_in * 1000,
        refresh_token: novo.refresh_token ?? t.refresh_token,
      });
      return novo.access_token;
    } catch (e) {
      // Permissão revogada no Google: o token guardado não serve mais.
      if (e instanceof ErroAgenda && e.codigo === 'desconectado') await apagarToken();
      throw e;
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

async function erroDoGoogle(res: Response): Promise<ErroAgenda> {
  if (res.status === 404 || res.status === 410) return new ErroAgenda('nao_existe');
  if (res.status === 400) return new ErroAgenda('entrada_invalida', 'o Google recusou os dados do evento');
  if (res.status === 403) {
    const corpo = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[] } };
    const motivo = corpo.error?.errors?.[0]?.reason ?? '';
    return LIMITE_DE_USO.has(motivo) ? new ErroAgenda('google_indisponivel') : new ErroAgenda('somente_leitura');
  }
  return new ErroAgenda('google_indisponivel');
}

async function google(caminho: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  for (let tentativa = 0; ; tentativa++) {
    const token = await accessToken(tentativa > 0);
    let res: Response;
    try {
      res = await fetch(`${API}${caminho}`, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ErroAgenda('google_indisponivel');
    }
    if (res.ok) return res;
    // 401 com token "válido" = revogado ou trocado: uma renovação forçada decide.
    if (res.status === 401 && tentativa === 0) continue;
    if (res.status === 401) throw new ErroAgenda('desconectado');
    throw await erroDoGoogle(res);
  }
}

export async function estadoAgenda(): Promise<EstadoAgenda> {
  const configurado = configOAuth() !== null;
  const desligado: EstadoAgenda = { configurado, conectado: false, email: null, agendas: [] };
  const t = configurado ? await lerToken() : null;
  if (!t) return desligado;
  try {
    return { configurado, conectado: true, email: t.email, agendas: await listarAgendas() };
  } catch (e) {
    if (e instanceof ErroAgenda && e.codigo === 'desconectado') return desligado;
    throw e;
  }
}

export function listarAgendas(): Promise<Agenda[]> {
  return comCache('agendas', async () => {
    const lista: Agenda[] = [];
    let pagina: string | undefined;
    do {
      const q = new URLSearchParams({ maxResults: '250', ...(pagina ? { pageToken: pagina } : {}) });
      const r = (await (await google(`/users/me/calendarList?${q}`)).json()) as {
        items?: GoogleAgenda[];
        nextPageToken?: string;
      };
      lista.push(...(r.items ?? []).map(agendaDoGoogle));
      pagina = r.nextPageToken;
    } while (pagina);
    return lista.sort((a, b) => Number(b.principal) - Number(a.principal) || a.nome.localeCompare(b.nome, 'pt-BR'));
  });
}

function limiteDaJanela(valor: string): string {
  const v = valor.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00-03:00` : comFuso(v);
}

async function eventosDaAgenda(a: Agenda, timeMin: string, timeMax: string): Promise<Evento[]> {
  const eventos: Evento[] = [];
  let pagina: string | undefined;
  let paginas = 0;
  try {
    do {
      const q = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
        ...(pagina ? { pageToken: pagina } : {}),
      });
      const r = (await (await google(`/calendars/${encodeURIComponent(a.id)}/events?${q}`)).json()) as {
        items?: GoogleEvento[];
        nextPageToken?: string;
      };
      for (const g of r.items ?? []) {
        const ev = eventoDoGoogle(g, a);
        if (ev) eventos.push(ev);
      }
      pagina = r.nextPageToken;
    } while (pagina && ++paginas < 4);
  } catch (e) {
    // Agenda que só mostra livre/ocupado ou saiu da conta não derruba as outras.
    if (e instanceof ErroAgenda && (e.codigo === 'somente_leitura' || e.codigo === 'nao_existe')) return [];
    throw e;
  }
  return eventos;
}

export async function listarEventos(de: string, ate: string, ids?: string[]): Promise<Evento[]> {
  const timeMin = limiteDaJanela(de);
  const timeMax = limiteDaJanela(ate);
  const span = Date.parse(timeMax) - Date.parse(timeMin);
  if (!(span > 0) || span > JANELA_MAX_MS) {
    throw new ErroAgenda('entrada_invalida', 'a janela precisa terminar depois de começar e ter no máximo 62 dias');
  }
  const agendas = await listarAgendas();
  const alvo = ids?.length ? agendas.filter((a) => ids.includes(a.id)) : agendas;
  return comCache(`eventos|${timeMin}|${timeMax}|${alvo.map((a) => a.id).join(',')}`, async () => {
    const porAgenda = await Promise.all(alvo.map((a) => eventosDaAgenda(a, timeMin, timeMax)));
    return porAgenda.flat().sort((x, y) => instanteDe(x.inicio) - instanteDe(y.inicio));
  });
}

async function agendaGravavel(id?: string): Promise<Agenda> {
  const agendas = await listarAgendas();
  const a = id ? agendas.find((x) => x.id === id) : agendas.find((x) => x.principal);
  if (!a) throw new ErroAgenda('entrada_invalida', id ? `agenda não encontrada: ${id}` : 'conta sem agenda principal');
  if (!a.gravavel) throw new ErroAgenda('somente_leitura');
  return a;
}

function caminhoDoEvento(agenda: string, id: string): string {
  return `/calendars/${encodeURIComponent(agenda)}/events/${encodeURIComponent(id)}`;
}

export async function criarEvento(e: EntradaEvento): Promise<Evento> {
  const v = validarEntrada(e);
  const a = await agendaGravavel(v.agenda);
  const q = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: v.convidados.length ? 'all' : 'none' });
  const res = await google(`/calendars/${encodeURIComponent(a.id)}/events?${q}`, {
    method: 'POST',
    body: corpoDoGoogle(v, randomUUID()),
  });
  limparCache();
  const ev = eventoDoGoogle((await res.json()) as GoogleEvento, a);
  if (!ev) throw new ErroAgenda('google_indisponivel');
  return ev;
}

export async function editarEvento(agenda: string, id: string, patch: PatchEvento): Promise<Evento> {
  const a = await agendaGravavel(agenda);
  const caminho = caminhoDoEvento(a.id, id);
  const bruto = (await (await google(caminho)).json()) as GoogleEvento;
  const atual = eventoDoGoogle(bruto, a);
  if (!atual) throw new ErroAgenda('nao_existe');
  const { corpo, avisar } = corpoDaEdicao(atual, patch, randomUUID());
  if (Array.isArray(corpo.attendees)) {
    corpo.attendees = mesclarConvidados(bruto.attendees, (corpo.attendees as { email: string }[]).map((c) => c.email));
  }
  const q = new URLSearchParams({ conferenceDataVersion: '1', sendUpdates: avisar ? 'all' : 'none' });
  const res = await google(`${caminho}?${q}`, { method: 'PATCH', body: corpo });
  limparCache();
  const ev = eventoDoGoogle((await res.json()) as GoogleEvento, a);
  if (!ev) throw new ErroAgenda('nao_existe');
  return ev;
}

export async function apagarEvento(agenda: string, id: string): Promise<void> {
  const a = await agendaGravavel(agenda);
  // `all`: se houver convidados, o Google avisa o cancelamento; sem convidados não manda nada.
  await google(`${caminhoDoEvento(a.id, id)}?sendUpdates=all`, { method: 'DELETE' });
  limparCache();
}
