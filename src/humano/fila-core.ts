/**
 * Estado da fila de entregas humanizadas. Puro: relógio e rng entram por
 * parâmetro, nada de timer nem I/O — o worker (fila.ts) é quem agenda e
 * persiste. Um ticket vivo por chat; transições registram `atualizadoEm`.
 */
export type EstadoTicket = 'agendado' | 'entregando' | 'entregue' | 'cancelado' | 'interrompido';
export type MotivoTicket =
  | 'mensagem_nova'
  | 'operador_respondeu'
  | 'reinicio'
  | 'falha'
  | 'substituido'
  | 'operador';
export type Urgencia = 'agora' | 'normal' | 'calma';
export type Regime = 'agora' | 'ativa' | 'fria';
export type OrigemTicket = 'mcp' | 'despacho' | 'api';

export interface OptsTicket {
  typos: boolean;
  umBalao: boolean;
  citar?: string;
  urgencia: Urgencia;
}

export interface Ticket {
  id: string;
  jid: string;
  slug: string;
  baloes: string[];
  texto: string;
  opts: OptsTicket;
  origem: OrigemTicket;
  criadoEm: number;
  /** Quando o visto sai (ms epoch). */
  lerEm: number;
  /** Quando a digitação começa (ms epoch). */
  entregarEm: number;
  estado: EstadoTicket;
  motivo?: MotivoTicket;
  regime: Regime;
  previsao_s: number;
  enviados: number;
  total: number;
  mensagensNovas: number;
  tentativas: number;
  lido: boolean;
  atualizadoEm: number;
}

export interface EstadoFila {
  versao: 1;
  tickets: Ticket[];
  /** jid → { ate, desde }: cliente digitando (composing), renovado a cada passo. */
  clienteDigitando: Record<string, { ate: number; desde: number }>;
  /** Último início de entrega (anti-metralhadora entre chats). */
  ultimoInicio: number;
}

export const CONFIG_FILA = {
  maxSimultaneas: 2,
  intervaloEntreChats_ms: 15_000,
  adiarMensagemNovaMin_ms: 20_000,
  adiarMensagemNovaMax_ms: 45_000,
  digitandoPasso_ms: 6_000,
  tetoEsperaDigitando_ms: 60_000,
  retomadaAposReinicio_ms: 5_000,
  retryFalha_ms: 60_000,
  maxTentativas: 3,
  reterTerminais_ms: 24 * 3600_000,
  maxTickets: 200,
};

export type RefTicket = { jid?: string; ticket?: string };

export function novoEstado(): EstadoFila {
  return { versao: 1, tickets: [], clienteDigitando: {}, ultimoInicio: 0 };
}

export function novoTicket(p: {
  id: string;
  jid: string;
  slug: string;
  baloes: string[];
  opts: OptsTicket;
  origem: OrigemTicket;
  criadoEm: number;
  lerEm: number;
  entregarEm: number;
  regime: Regime;
}): Ticket {
  return {
    ...p,
    texto: p.baloes.join('\n\n'),
    estado: 'agendado',
    previsao_s: Math.max(0, Math.round((p.entregarEm - p.criadoEm) / 1000)),
    enviados: 0,
    total: p.baloes.length,
    mensagensNovas: 0,
    tentativas: 0,
    lido: false,
    atualizadoEm: p.criadoEm,
  };
}

export const terminal = (t: Ticket): boolean =>
  t.estado === 'entregue' || t.estado === 'cancelado' || t.estado === 'interrompido';

export function ticketVivo(e: EstadoFila, jid: string): Ticket | undefined {
  return e.tickets.find((t) => t.jid === jid && !terminal(t));
}

/** Por id, ou o ticket VIVO do jid (o mais recente terminal se não houver vivo). */
export function acharTicket(e: EstadoFila, ref: RefTicket): Ticket | undefined {
  if (ref.ticket) return e.tickets.find((t) => t.id === ref.ticket);
  if (!ref.jid) return undefined;
  return ticketVivo(e, ref.jid) ?? [...e.tickets].reverse().find((t) => t.jid === ref.jid);
}

export function enfileirar(e: EstadoFila, t: Ticket, agora: number): { substituiu?: string } {
  const vivo = ticketVivo(e, t.jid);
  let substituiu: string | undefined;
  if (vivo) {
    fechar(vivo, 'cancelado', 'substituido', agora);
    substituiu = vivo.id;
  }
  e.tickets.push(t);
  return substituiu ? { substituiu } : {};
}

function fechar(
  t: Ticket,
  estado: EstadoTicket,
  motivo: MotivoTicket | undefined,
  agora: number,
): void {
  t.estado = estado;
  if (motivo) t.motivo = motivo;
  t.atualizadoEm = agora;
}

function clienteQuieto(e: EstadoFila, jid: string, agora: number): boolean {
  const d = e.clienteDigitando[jid];
  if (!d) return true;
  if (d.ate <= agora) return true;
  // Digitando há mais que o teto: entrega mesmo assim.
  return agora - d.desde > CONFIG_FILA.tetoEsperaDigitando_ms;
}

/** Tickets agendados cujo visto já pode sair. */
export function proximosParaLer(e: EstadoFila, agora: number): Ticket[] {
  return e.tickets.filter((t) => t.estado === 'agendado' && !t.lido && t.lerEm <= agora);
}

/** O próximo ticket a começar a digitar, ou null se nenhum pode agora. */
export function proximo(e: EstadoFila, agora: number): Ticket | null {
  const entregando = e.tickets.filter((t) => t.estado === 'entregando').length;
  if (entregando >= CONFIG_FILA.maxSimultaneas) return null;
  if (e.ultimoInicio && agora - e.ultimoInicio < CONFIG_FILA.intervaloEntreChats_ms) return null;
  const prontos = e.tickets
    .filter(
      (t) => t.estado === 'agendado' && t.entregarEm <= agora && clienteQuieto(e, t.jid, agora),
    )
    .sort((a, b) => a.entregarEm - b.entregarEm);
  return prontos[0] ?? null;
}

/** True se há agendado vencido que só espera o cap/intervalo/cliente — o worker precisa reavaliar em breve. */
export function haPendenteVencido(e: EstadoFila, agora: number): boolean {
  return e.tickets.some((t) => t.estado === 'agendado' && t.entregarEm <= agora);
}

export function adiar(e: EstadoFila, jid: string, ate: number): Ticket | null {
  const t = ticketVivo(e, jid);
  if (!t || t.estado !== 'agendado') return null;
  if (ate > t.entregarEm) t.entregarEm = ate;
  if (t.lerEm > t.entregarEm) t.lerEm = t.entregarEm;
  return t;
}

/**
 * Cliente falou no chat: agendado adia (e conta; o worker interrompe na hora de
 * entregar se `mensagensNovas > 0`), entregando interrompe já.
 */
export function registrarMensagemNova(
  e: EstadoFila,
  jid: string,
  agora: number,
  rng: () => number,
): Ticket | null {
  const t = ticketVivo(e, jid);
  if (!t) return null;
  if (t.estado === 'entregando') {
    fechar(t, 'interrompido', 'mensagem_nova', agora);
    return t;
  }
  t.mensagensNovas += 1;
  const extra =
    CONFIG_FILA.adiarMensagemNovaMin_ms +
    rng() * (CONFIG_FILA.adiarMensagemNovaMax_ms - CONFIG_FILA.adiarMensagemNovaMin_ms);
  adiar(e, jid, agora + Math.round(extra));
  t.atualizadoEm = agora;
  return t;
}

export function interromper(
  e: EstadoFila,
  ref: RefTicket,
  motivo: MotivoTicket,
  agora: number,
): Ticket | null {
  const t = acharTicket(e, ref);
  if (!t || terminal(t)) return null;
  fechar(t, 'interrompido', motivo, agora);
  return t;
}

export function cancelar(e: EstadoFila, ref: RefTicket, agora: number): Ticket | null {
  const t = acharTicket(e, ref);
  if (!t || terminal(t)) return null;
  fechar(t, 'cancelado', 'operador', agora);
  return t;
}

export function marcarLido(e: EstadoFila, id: string, agora: number): void {
  const t = e.tickets.find((x) => x.id === id);
  if (t) {
    t.lido = true;
    t.atualizadoEm = agora;
  }
}

export function marcarEntregando(e: EstadoFila, id: string, agora: number): Ticket | null {
  const t = e.tickets.find((x) => x.id === id);
  if (!t || t.estado !== 'agendado') return null;
  t.estado = 'entregando';
  t.tentativas += 1;
  t.atualizadoEm = agora;
  e.ultimoInicio = agora;
  return t;
}

export function marcarEntregue(e: EstadoFila, id: string, enviados: number, agora: number): void {
  const t = e.tickets.find((x) => x.id === id);
  if (!t) return;
  t.enviados = enviados;
  // Interrompido/cancelado no meio já fechou com o motivo certo: só atualiza a contagem.
  if (t.estado === 'entregando') fechar(t, 'entregue', undefined, agora);
  else t.atualizadoEm = agora;
}

export function marcarFalha(e: EstadoFila, id: string, enviados: number, agora: number): void {
  const t = e.tickets.find((x) => x.id === id);
  if (!t) return;
  t.enviados = enviados;
  if (t.estado !== 'entregando') return;
  if (enviados === 0 && t.tentativas < CONFIG_FILA.maxTentativas) {
    t.estado = 'agendado';
    t.entregarEm = agora + CONFIG_FILA.retryFalha_ms;
    t.atualizadoEm = agora;
    return;
  }
  fechar(t, 'interrompido', 'falha', agora);
}

export function clienteDigitando(e: EstadoFila, jid: string, agora: number): void {
  const d = e.clienteDigitando[jid];
  const desde = d && d.ate > agora ? d.desde : agora;
  e.clienteDigitando[jid] = { ate: agora + CONFIG_FILA.digitandoPasso_ms, desde };
}

export function clienteParou(e: EstadoFila, jid: string): void {
  delete e.clienteDigitando[jid];
}

export function aoReiniciar(e: EstadoFila, agora: number): void {
  e.clienteDigitando = {};
  e.ultimoInicio = 0;
  for (const t of e.tickets) {
    if (t.estado === 'entregando') fechar(t, 'interrompido', 'reinicio', agora);
    else if (t.estado === 'agendado' && t.entregarEm <= agora) {
      t.entregarEm = agora + CONFIG_FILA.retomadaAposReinicio_ms;
      t.lerEm = t.entregarEm;
      t.atualizadoEm = agora;
    }
  }
}

/** Próximo instante em que o worker precisa acordar (ms epoch), ou null. */
export function proximoDisparo(e: EstadoFila): number | null {
  let min: number | null = null;
  for (const t of e.tickets) {
    if (t.estado !== 'agendado') continue;
    const cand = t.lido ? t.entregarEm : Math.min(t.lerEm, t.entregarEm);
    if (min === null || cand < min) min = cand;
  }
  return min;
}

export function podar(e: EstadoFila, agora: number): void {
  e.tickets = e.tickets.filter(
    (t) => !terminal(t) || agora - t.atualizadoEm < CONFIG_FILA.reterTerminais_ms,
  );
  if (e.tickets.length > CONFIG_FILA.maxTickets) {
    const vivos = e.tickets.filter((t) => !terminal(t));
    const mortos = e.tickets.filter(terminal).slice(-(CONFIG_FILA.maxTickets - vivos.length));
    e.tickets = [...mortos, ...vivos].sort((a, b) => a.criadoEm - b.criadoEm);
  }
}
