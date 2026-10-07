/**
 * Tipos e conversões puras da agenda (Google Agenda ↔ painel). Sem rede e sem
 * módulos do Node: roda no servidor, no navegador e no MCP.
 */

/** Fuso da agenda. O Brasil não tem horário de verão desde 2019: offset fixo. */
export const FUSO = 'America/Sao_Paulo';
export const OFFSET_BRT = '-03:00';

const MIN_MS = 60_000;
const DIA_MS = 86_400_000;
const OFFSET_MS = 3 * 3_600_000;
const SEM_TITULO = '(sem título)';
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const DATA_HORA = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?$/;
const COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export type CodigoErroAgenda =
  | 'nao_configurado'
  | 'desconectado'
  | 'entrada_invalida'
  | 'somente_leitura'
  | 'nao_existe'
  | 'google_indisponivel';

const MENSAGENS: Record<CodigoErroAgenda, string> = {
  nao_configurado: 'agenda não configurada na nuvem (faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET)',
  desconectado: 'agenda desconectada, reconecte em /agenda',
  entrada_invalida: 'dados do evento inválidos',
  somente_leitura: 'essa agenda é só de leitura',
  nao_existe: 'evento não existe mais',
  google_indisponivel: 'Google Agenda indisponível agora, tente de novo em instantes',
};

/** Erro com código estável: rotas mapeiam para status, o MCP repassa a mensagem. */
export class ErroAgenda extends Error {
  readonly codigo: CodigoErroAgenda;
  constructor(codigo: CodigoErroAgenda, mensagem?: string) {
    super(mensagem ?? MENSAGENS[codigo]);
    this.name = 'ErroAgenda';
    this.codigo = codigo;
  }
}

export interface Agenda {
  id: string;
  nome: string;
  cor: string;
  principal: boolean;
  gravavel: boolean;
}

export interface Evento {
  id: string;
  agenda: string;
  titulo: string;
  /** ISO com fuso, ou `YYYY-MM-DD` em dia inteiro. */
  inicio: string;
  /** Exclusivo em dia inteiro, como no Google. */
  fim: string;
  diaInteiro: boolean;
  local?: string;
  descricao?: string;
  convidados: string[];
  meet?: string;
  recorrente: boolean;
  editavel: boolean;
  cor: string;
  link?: string;
}

export interface EstadoAgenda {
  configurado: boolean;
  conectado: boolean;
  email: string | null;
  agendas: Agenda[];
}

export interface EntradaEvento {
  agenda?: string;
  titulo: string;
  inicio: string;
  fim?: string;
  duracaoMin?: number;
  diaInteiro?: boolean;
  local?: string;
  descricao?: string;
  convidados?: string[];
  meet?: boolean;
}

export type PatchEvento = Partial<Omit<EntradaEvento, 'agenda'>>;

export interface EntradaValida {
  agenda?: string;
  titulo: string;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  local?: string;
  descricao?: string;
  convidados: string[];
  meet: boolean;
}

export interface GoogleAgenda {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: string;
}

interface GoogleHorario {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleConvidado {
  email?: string;
  self?: boolean;
  resource?: boolean;
  responseStatus?: string;
}

export interface GoogleEvento {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleHorario;
  end?: GoogleHorario;
  attendees?: GoogleConvidado[];
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  recurringEventId?: string;
  htmlLink?: string;
}

/** Data-hora com fuso explícito; sem fuso, vale o horário de Brasília. */
export function comFuso(valor: string): string {
  const v = valor.trim();
  if (COM_FUSO.test(v) && !Number.isNaN(Date.parse(v))) return v;
  const m = DATA_HORA.exec(v);
  if (m) {
    const iso = `${m[1]}${m[2] ?? ':00'}${OFFSET_BRT}`;
    if (!Number.isNaN(Date.parse(iso))) return iso;
  }
  throw new ErroAgenda('entrada_invalida', `data-hora inválida: ${valor}`);
}

/** Instante → ISO no horário de Brasília (`2026-10-08T14:00:00-03:00`). */
export function isoBrt(ms: number): string {
  return `${new Date(ms - OFFSET_MS).toISOString().slice(0, 19)}${OFFSET_BRT}`;
}

export function somarDias(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
}

/** Instante de um início/fim; dia inteiro conta da meia-noite de Brasília. */
export function instanteDe(valor: string): number {
  return DIA.test(valor) ? Date.parse(`${valor}T00:00:00${OFFSET_BRT}`) : Date.parse(valor);
}

function diaValido(d: string): boolean {
  if (!DIA.test(d)) return false;
  const ms = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === d;
}

export function agendaDoGoogle(g: GoogleAgenda): Agenda {
  return {
    id: g.id,
    nome: g.summaryOverride || g.summary || g.id,
    cor: g.backgroundColor || '#4285f4',
    principal: g.primary === true,
    gravavel: g.accessRole === 'owner' || g.accessRole === 'writer',
  };
}

/** Evento do Google no formato do painel; cancelado ou sem horário vira null. */
export function eventoDoGoogle(g: GoogleEvento, agenda: Agenda): Evento | null {
  if (g.status === 'cancelled' || !g.start || !g.end) return null;
  const inicio = g.start.dateTime ?? g.start.date;
  const fim = g.end.dateTime ?? g.end.date;
  if (!inicio || !fim) return null;
  const meet = g.hangoutLink ?? g.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri;
  return {
    id: g.id,
    agenda: agenda.id,
    titulo: g.summary?.trim() || SEM_TITULO,
    inicio,
    fim,
    diaInteiro: Boolean(g.start.date),
    ...(g.location ? { local: g.location } : {}),
    ...(g.description ? { descricao: g.description } : {}),
    convidados: (g.attendees ?? [])
      .filter((a) => !a.self && !a.resource && a.email)
      .map((a) => a.email as string),
    ...(meet ? { meet } : {}),
    recorrente: Boolean(g.recurringEventId),
    editavel: agenda.gravavel,
    cor: agenda.cor,
    ...(g.htmlLink ? { link: g.htmlLink } : {}),
  };
}

function invalida(mensagem: string): ErroAgenda {
  return new ErroAgenda('entrada_invalida', mensagem);
}

export function validarEntrada(e: EntradaEvento): EntradaValida {
  if (typeof e.titulo !== 'string' || !e.titulo.trim()) throw invalida('título obrigatório');
  const titulo = e.titulo.trim();
  if (titulo.length > 300) throw invalida('título passa de 300 caracteres');
  if (typeof e.inicio !== 'string' || !e.inicio.trim()) throw invalida('início obrigatório');
  const diaInteiro = e.diaInteiro === true;
  let inicio: string;
  let fim: string;
  if (diaInteiro) {
    inicio = e.inicio.trim().slice(0, 10);
    if (!diaValido(inicio)) throw invalida(`data inválida: ${e.inicio}`);
    fim = e.fim ? e.fim.trim().slice(0, 10) : somarDias(inicio, 1);
    if (!diaValido(fim)) throw invalida(`data inválida: ${e.fim}`);
    if (fim <= inicio) throw invalida('fim precisa ser depois do início');
  } else {
    inicio = comFuso(e.inicio);
    if (e.fim) {
      fim = comFuso(e.fim);
    } else {
      const dur = e.duracaoMin ?? 30;
      if (!Number.isInteger(dur) || dur < 1 || dur > 1440) throw invalida('duração entre 1 e 1440 minutos');
      fim = isoBrt(Date.parse(inicio) + dur * MIN_MS);
    }
    if (Date.parse(fim) <= Date.parse(inicio)) throw invalida('fim precisa ser depois do início');
  }
  const convidados = [...new Set((e.convidados ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean))];
  const ruim = convidados.find((c) => !EMAIL.test(c));
  if (ruim) throw invalida(`e-mail de convidado inválido: ${ruim}`);
  if (convidados.length > 50) throw invalida('no máximo 50 convidados');
  const local = e.local?.trim();
  const descricao = e.descricao?.trim();
  return {
    ...(e.agenda ? { agenda: e.agenda } : {}),
    titulo,
    inicio,
    fim,
    diaInteiro,
    ...(local ? { local } : {}),
    ...(descricao ? { descricao } : {}),
    convidados,
    meet: e.meet === true,
  };
}

function horario(valor: string, diaInteiro: boolean): GoogleHorario {
  return diaInteiro ? { date: valor } : { dateTime: valor, timeZone: FUSO };
}

/** Corpo de criação na Calendar API. `requestId` identifica o pedido de Meet. */
export function corpoDoGoogle(v: EntradaValida, requestId: string): Record<string, unknown> {
  return {
    summary: v.titulo,
    start: horario(v.inicio, v.diaInteiro),
    end: horario(v.fim, v.diaInteiro),
    ...(v.local ? { location: v.local } : {}),
    ...(v.descricao ? { description: v.descricao } : {}),
    ...(v.convidados.length ? { attendees: v.convidados.map((email) => ({ email })) } : {}),
    ...(v.meet
      ? { conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }
      : {}),
  };
}

/**
 * Junta a edição com o evento atual. Início sem fim mantém a duração; convidados
 * só mudam se vierem na edição; Meet só é criado se ainda não existir.
 * `avisar` diz se o Google deve mandar e-mail (há ou haverá convidados).
 */
export function corpoDaEdicao(
  atual: Evento,
  patch: PatchEvento,
  requestId: string,
): { corpo: Record<string, unknown>; avisar: boolean } {
  const diaInteiro = patch.diaInteiro ?? atual.diaInteiro;
  const mudouTipo = diaInteiro !== atual.diaInteiro;
  if (mudouTipo && patch.inicio === undefined) {
    throw invalida('ao trocar entre dia inteiro e horário, mande o início');
  }
  const inicio = patch.inicio ?? atual.inicio;
  let fim = patch.fim;
  if (fim === undefined && patch.duracaoMin === undefined && !mudouTipo) {
    if (patch.inicio === undefined) fim = atual.fim;
    else if (diaInteiro) {
      const dias = Math.max(1, Math.round((instanteDe(atual.fim) - instanteDe(atual.inicio)) / DIA_MS));
      fim = somarDias(inicio.trim().slice(0, 10), dias);
    } else {
      fim = isoBrt(Date.parse(comFuso(inicio)) + (Date.parse(atual.fim) - Date.parse(atual.inicio)));
    }
  }
  const v = validarEntrada({
    titulo: patch.titulo ?? atual.titulo,
    inicio,
    fim,
    duracaoMin: patch.duracaoMin,
    diaInteiro,
    local: patch.local ?? atual.local,
    descricao: patch.descricao ?? atual.descricao,
    convidados: patch.convidados ?? [],
    meet: patch.meet === true && !atual.meet,
  });
  const corpo: Record<string, unknown> = {
    ...corpoDoGoogle(v, requestId),
    // Campo vazio na edição precisa ir como '' para o Google apagar o valor antigo.
    location: v.local ?? '',
    description: v.descricao ?? '',
  };
  if (mudouTipo) {
    // PATCH mescla objetos aninhados: o formato antigo (date ou dateTime) precisa ir nulo.
    const apagar = diaInteiro ? { dateTime: null, timeZone: null } : { date: null };
    corpo.start = { ...(corpo.start as object), ...apagar };
    corpo.end = { ...(corpo.end as object), ...apagar };
  }
  // Lista igual à atual não é mudança: regravar attendees derrubaria sala e respostas.
  const anteriores = new Set(atual.convidados.map((c) => c.toLowerCase()));
  const mudouConvidados =
    patch.convidados !== undefined &&
    (v.convidados.length !== anteriores.size || v.convidados.some((c) => !anteriores.has(c)));
  if (mudouConvidados) corpo.attendees = v.convidados.map((email) => ({ email }));
  else delete corpo.attendees;
  // Quem saiu da lista também recebe o aviso do Google.
  return { corpo, avisar: atual.convidados.length > 0 || v.convidados.length > 0 };
}

/**
 * Lista nova de convidados sobre a atual do Google: a própria conta e salas ficam,
 * quem continua mantém a resposta, quem saiu sai, quem chegou entra.
 */
export function mesclarConvidados(atuais: GoogleConvidado[] | undefined, novos: string[]): GoogleConvidado[] {
  const fixos = (atuais ?? []).filter((a) => a.self || a.resource);
  const porEmail = new Map(
    (atuais ?? []).filter((a) => !a.self && !a.resource && a.email).map((a) => [a.email!.toLowerCase(), a]),
  );
  return [...fixos, ...novos.map((email) => porEmail.get(email.toLowerCase()) ?? { email })];
}

const CAMPOS_TEXTO = ['agenda', 'titulo', 'inicio', 'fim', 'local', 'descricao'] as const;
const CAMPOS_BOOL = ['diaInteiro', 'meet'] as const;

/** Corpo JSON de uma rota → campos de evento com tipo conferido; o resto é ignorado. */
export function entradaDeJson(x: unknown): PatchEvento & { agenda?: string } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw invalida('corpo precisa ser um objeto');
  const o = x as Record<string, unknown>;
  const r: Record<string, unknown> = {};
  for (const k of CAMPOS_TEXTO) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== 'string') throw invalida(`${k} precisa ser texto`);
    r[k] = o[k];
  }
  for (const k of CAMPOS_BOOL) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== 'boolean') throw invalida(`${k} precisa ser true ou false`);
    r[k] = o[k];
  }
  if (o.duracaoMin !== undefined) {
    if (typeof o.duracaoMin !== 'number') throw invalida('duracaoMin precisa ser número');
    r.duracaoMin = o.duracaoMin;
  }
  if (o.convidados !== undefined) {
    if (!Array.isArray(o.convidados) || o.convidados.some((c) => typeof c !== 'string')) {
      throw invalida('convidados precisa ser uma lista de e-mails');
    }
    r.convidados = o.convidados;
  }
  return r as PatchEvento & { agenda?: string };
}
