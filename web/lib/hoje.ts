import { diaBrt, hhmm, minutosBrt } from './agenda-semana';
import type { Contrato } from './contratos';
import type { LinhaDashboard, Sinal } from './dashboard';
import type { Evento } from './google/evento';
import { MESES } from './painel';

/**
 * Contas da tela Hoje: a frase do dia, a faixa de situação, os sinais, os
 * contratos perto do fim, a fila da IA e a agenda do dia. Puro: dados e relógio
 * vêm do chamador. Datas e horas em Brasília.
 */

const MIN_MS = 60_000;
const H_MS = 60 * MIN_MS;
const DIA_MS = 24 * H_MS;
const QUATRO_HORAS = 4 * H_MS;

const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** "Quarta, 7 de outubro". */
export function dataPorExtenso(agoraMs: number): string {
  const dia = diaBrt(agoraMs);
  const semana = DIAS_DA_SEMANA[new Date(`${dia}T00:00:00Z`).getUTCDay()];
  return `${semana}, ${Number(dia.slice(8, 10))} de ${MESES[Number(dia.slice(5, 7)) - 1]}`;
}

function contagem(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Junta partes com vírgula e "e" antes da última. */
function juntar(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
}

/**
 * A frase do cabeçalho. A fila da IA e a agenda vêm da nuvem e podem não
 * responder: a parte desconhecida (null) fica de fora em vez de virar zero.
 */
export function fraseDoDia(p: { esperando: number; comIa: number | null; compromissos: number | null }): string {
  const partes = [
    p.esperando === 0 ? 'Ninguém esperando resposta' : `${contagem(p.esperando, 'cliente', 'clientes')} esperando resposta`,
  ];
  if (p.comIa !== null) {
    partes.push(p.comIa === 0 ? 'a IA sem envios na fila' : `a IA cuidando de ${contagem(p.comIa, 'conversa', 'conversas')}`);
  }
  if (p.compromissos !== null) {
    partes.push(
      p.compromissos === 0
        ? 'nenhum compromisso até o fim do dia'
        : `${contagem(p.compromissos, 'compromisso', 'compromissos')} até o fim do dia`,
    );
  }
  return `${juntar(partes)}.`;
}

/** Total esperando e quantos passaram de 4 h (o anel cheio, em vermelho). */
export function resumoEsperando(itens: Array<{ waitingMs: number }>): { total: number; acimaDe4h: number } {
  return { total: itens.length, acimaDe4h: itens.filter((i) => i.waitingMs > QUATRO_HORAS).length };
}

export type EstadoColetor = 'conectado' | 'pareando' | 'desconectado';

/** Mesma leitura do ponto de conexão do trilho. */
export function estadoDoColetor(s: { connection?: string; qr?: string | null } | null): EstadoColetor {
  if (s?.connection === 'open') return 'conectado';
  if (s?.qr || s?.connection === 'connecting' || s?.connection === 'qr') return 'pareando';
  return 'desconectado';
}

export function textoEntregasAnteriores(anterior: number, nomeMesAnterior: string): string {
  return anterior === 0 ? `nenhuma em ${nomeMesAnterior}` : `${anterior} em ${nomeMesAnterior}`;
}

// ── Sinais ─────────────────────────────────────────────────────────────────

export type TomSinal = 'perigo' | 'atencao' | 'neutro';

export interface SinalDoDia {
  chave: string;
  slug: string;
  nome: string;
  texto: string;
  tom: TomSinal;
}

const ORDEM_TOM: Record<TomSinal, number> = { perigo: 0, atencao: 1, neutro: 2 };

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);
}

function textoDoSinal(sinal: Sinal, contrato: Contrato, hoje: string): { texto: string; tom: TomSinal } {
  switch (sinal) {
    case 'encerrado-ativo':
      return { texto: contrato.estado === 'ativo' ? 'contrato vencido' : 'contrato encerrado', tom: 'perigo' };
    case 'sem-contrato-ativo':
      return { texto: 'ativo sem contrato', tom: 'atencao' };
    case 'pausado-ativo':
      return { texto: 'pausado, mas ativo', tom: 'atencao' };
    case 'sem-entrega-30d':
      return { texto: 'sem entrega há 30 dias', tom: 'atencao' };
    case 'renovacao-30d': {
      const dias = contrato.fim ? diasEntre(hoje, contrato.fim) : null;
      const texto = dias === null ? 'renova em breve' : dias <= 0 ? 'renova hoje' : dias === 1 ? 'renova amanhã' : `renova em ${dias} dias`;
      return { texto, tom: 'neutro' };
    }
  }
}

/**
 * Sinais do dia: quem está sem resposta há mais de 24 h (da caixa de entrada) e
 * os sinais de contrato do dashboard, num texto curto. O mais grave primeiro.
 */
export function sinaisDoDia(
  linhas: Array<Pick<LinhaDashboard, 'slug' | 'nome' | 'contrato' | 'sinais'>>,
  esperando: Array<{ slug: string; groupName: string; waitingMs: number }>,
  agoraMs: number,
): SinalDoDia[] {
  const hoje = diaBrt(agoraMs);
  const out: SinalDoDia[] = [];
  for (const e of esperando) {
    if (e.waitingMs <= DIA_MS) continue;
    const horas = Math.floor(e.waitingMs / H_MS);
    const texto = horas < 48 ? `sem resposta há ${horas} h` : `sem resposta há ${Math.floor(e.waitingMs / DIA_MS)} dias`;
    out.push({ chave: `${e.slug}|espera`, slug: e.slug, nome: e.groupName, texto, tom: 'perigo' });
  }
  for (const l of linhas) {
    for (const s of l.sinais) out.push({ chave: `${l.slug}|${s}`, slug: l.slug, nome: l.nome, ...textoDoSinal(s, l.contrato, hoje) });
  }
  return out.map((s, i) => ({ s, i })).sort((a, b) => ORDEM_TOM[a.s.tom] - ORDEM_TOM[b.s.tom] || a.i - b.i).map(({ s }) => s);
}

// ── Contratos no limite ────────────────────────────────────────────────────

export interface ContratoNoLimite {
  slug: string;
  nome: string;
  /** Dias desde o início (zero antes de começar). */
  decorridos: number;
  /** Dias de contrato, do início ao fim. */
  duracao: number;
  /** Dias até o fim; negativo quando já venceu. */
  restam: number;
}

/**
 * O limite que o contrato registra é o prazo: mede os dias corridos contra a
 * duração, só nos contratos ativos com início e fim. O mais apertado primeiro.
 */
export function contratosNoLimite(
  contratos: Record<string, Contrato>,
  nomeDe: (slug: string) => string,
  agoraMs: number,
): ContratoNoLimite[] {
  const hoje = diaBrt(agoraMs);
  const out: ContratoNoLimite[] = [];
  for (const [slug, c] of Object.entries(contratos)) {
    if (c.estado !== 'ativo' || !c.inicio || !c.fim) continue;
    out.push({
      slug,
      nome: nomeDe(slug),
      decorridos: Math.max(0, diasEntre(c.inicio, hoje)),
      duracao: Math.max(1, diasEntre(c.inicio, c.fim)),
      restam: diasEntre(hoje, c.fim),
    });
  }
  return out.sort((a, b) => a.restam - b.restam || a.slug.localeCompare(b.slug));
}

// ── Fila da IA ─────────────────────────────────────────────────────────────

/** O pedaço do resumo de ticket do coletor (`GET /entregas`) que a tela usa. */
export interface TicketResumo {
  ticket: string;
  slug: string;
  estado: string;
  enviados: number;
  total: number;
  entregarEm: string;
  iniciadoEm?: string | null;
}

export interface ResumoFila {
  total: number;
  entregando: number;
  agendados: number;
  /** Quando começa a próxima entrega agendada. */
  proximaMs: number | null;
}

const vivo = (t: TicketResumo) => t.estado === 'agendado' || t.estado === 'entregando';

export function resumoDaFila(tickets: TicketResumo[]): ResumoFila {
  const vivos = tickets.filter(vivo);
  const agendados = vivos.filter((t) => t.estado === 'agendado');
  const proximas = agendados.map((t) => Date.parse(t.entregarEm)).filter((n) => !Number.isNaN(n));
  return {
    total: vivos.length,
    entregando: vivos.length - agendados.length,
    agendados: agendados.length,
    proximaMs: proximas.length ? Math.min(...proximas) : null,
  };
}

/** Entregando primeiro (quem começou antes no topo), depois agendado pelo horário. */
export function ordenarTickets<T extends TicketResumo>(tickets: T[]): T[] {
  const chave = (t: T) => Date.parse((t.estado === 'entregando' ? t.iniciadoEm : null) ?? t.entregarEm) || 0;
  return tickets
    .filter(vivo)
    .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'entregando' ? -1 : 1) || chave(a) - chave(b));
}

/** Texto curto da célula "Com a IA"; null é a fila fora do alcance. */
export function textoDaFila(r: ResumoFila | null): string {
  if (!r) return 'fila indisponível';
  if (r.entregando > 0) return `${r.entregando} entregando agora`;
  if (r.proximaMs !== null) return `próxima às ${hhmm(minutosBrt(r.proximaMs))}`;
  return 'nada na fila';
}

/** Tickets distintos que a fila registrou como interrompidos hoje (`.entregas.jsonl`). */
export function interrompidasHoje(linhas: Array<{ ts: string; ticket: string; estado: string }>, agoraMs: number): number {
  const hoje = diaBrt(agoraMs);
  const tickets = new Set<string>();
  for (const l of linhas) {
    const t = Date.parse(l.ts);
    if (l.estado === 'interrompido' && !Number.isNaN(t) && t <= agoraMs && diaBrt(t) === hoje) tickets.add(l.ticket);
  }
  return tickets.size;
}

// ── Agenda do dia ──────────────────────────────────────────────────────────

export type EstadoItemAgenda = 'passado' | 'agora' | 'proximo' | 'normal';

export interface ItemAgenda {
  chave: string;
  titulo: string;
  cor: string;
  /** "09:00" ou "dia todo". */
  quando: string;
  detalhe: string;
  estado: EstadoItemAgenda;
}

export interface AgendaDoDia {
  /** Faixa do dia em horas: 8 às 20, esticada para caber eventos fora dela. */
  inicioH: number;
  fimH: number;
  marcas: number[];
  /** Posição em % da faixa. */
  blocos: Array<{ chave: string; cor: string; esquerda: number; largura: number; passado: boolean }>;
  /** Linha do agora em % da faixa; null fora dela. */
  agora: number | null;
  itens: ItemAgenda[];
  /** Itens que não couberam na lista. */
  restantes: number;
}

const LARGURA_MINIMA = 1.6;

function quantoFalta(min: number): string {
  if (min < 60) return `daqui a ${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `daqui a ${h} h ${m} min` : `daqui a ${h} h`;
}

function detalheDoEvento(ev: Evento): string {
  if (ev.local?.trim()) return ev.local.trim();
  if (ev.meet) return 'Google Meet';
  const n = ev.convidados.length;
  return n === 0 ? 'só você' : `com ${contagem(n, 'convidado', 'convidados')}`;
}

interface Intervalo {
  ev: Evento;
  s: number;
  e: number;
}

/** Eventos com horário que tocam o dia de hoje, cortados à meia-noite. */
function comHorarioDeHoje(eventos: Evento[], agoraMs: number): Intervalo[] {
  const ini = Date.parse(`${diaBrt(agoraMs)}T00:00:00-03:00`);
  const fim = ini + DIA_MS;
  return eventos
    .filter((ev) => !ev.diaInteiro)
    .map((ev) => ({ ev, s: Date.parse(ev.inicio), e: Date.parse(ev.fim) }))
    .filter((x) => x.s < fim && x.e > ini)
    .map((x) => ({ ev: x.ev, s: Math.max(x.s, ini), e: Math.min(x.e, fim) }))
    .sort((a, b) => a.s - b.s || a.e - b.e);
}

export function agendaDoDia(eventos: Evento[], agoraMs: number, maxItens = 4): AgendaDoDia {
  const hoje = diaBrt(agoraMs);
  const inicioDoDia = Date.parse(`${hoje}T00:00:00-03:00`);
  const doDia = comHorarioDeHoje(eventos, agoraMs);
  const minutos = (t: number) => (t - inicioDoDia) / MIN_MS;

  let inicioH = Math.max(0, Math.min(8, ...doDia.map((x) => Math.floor(minutos(x.s) / 60))));
  let fimH = Math.min(24, Math.max(20, ...doDia.map((x) => Math.ceil(minutos(x.e) / 60))));
  // As cinco marcas ficam distribuídas por igual: a faixa fecha em múltiplo de 4 h.
  while ((fimH - inicioH) % 4 !== 0) {
    if (fimH < 24) fimH++;
    else inicioH--;
  }
  const faixaMin = (fimH - inicioH) * 60;
  const pct = (min: number) => ((min - inicioH * 60) / faixaMin) * 100;
  const agoraMin = minutos(agoraMs);

  const blocos = doDia.map((x) => ({
    chave: `${x.ev.agenda}|${x.ev.id}`,
    cor: x.ev.cor,
    esquerda: pct(minutos(x.s)),
    largura: Math.max(LARGURA_MINIMA, pct(minutos(x.e)) - pct(minutos(x.s))),
    passado: x.e <= agoraMs,
  }));

  const proximo = doDia.find((x) => x.s > agoraMs);
  const comHorario: ItemAgenda[] = doDia.map((x) => {
    const estado: EstadoItemAgenda =
      x.e <= agoraMs ? 'passado' : x.s <= agoraMs ? 'agora' : x === proximo ? 'proximo' : 'normal';
    const detalhe =
      estado === 'agora'
        ? `agora, até ${hhmm(minutosBrt(x.e))}`
        : estado === 'proximo'
          ? quantoFalta(Math.round((x.s - agoraMs) / MIN_MS))
          : detalheDoEvento(x.ev);
    return { chave: `${x.ev.agenda}|${x.ev.id}`, titulo: x.ev.titulo, cor: x.ev.cor, quando: hhmm(minutosBrt(x.s)), detalhe, estado };
  });
  const diaTodo: ItemAgenda[] = eventos
    .filter((ev) => ev.diaInteiro && ev.inicio <= hoje && hoje < ev.fim)
    .map((ev) => ({ chave: `${ev.agenda}|${ev.id}`, titulo: ev.titulo, cor: ev.cor, quando: 'dia todo', detalhe: detalheDoEvento(ev), estado: 'normal' }));

  let itens = [...diaTodo, ...comHorario];
  const sobra = itens.length - maxItens;
  if (sobra > 0) {
    // Sem espaço, saem primeiro os que já passaram (do mais antigo), depois o fim da lista.
    const passados = itens.filter((i) => i.estado === 'passado').slice(0, sobra);
    itens = itens.filter((i) => !passados.includes(i)).slice(0, maxItens);
  }

  return {
    inicioH,
    fimH,
    marcas: Array.from({ length: 5 }, (_, k) => inicioH + (k * (fimH - inicioH)) / 4),
    blocos,
    agora: agoraMin >= inicioH * 60 && agoraMin <= fimH * 60 ? pct(agoraMin) : null,
    itens,
    restantes: diaTodo.length + comHorario.length - itens.length,
  };
}

/** Compromissos com horário que ainda não terminaram hoje (a frase do cabeçalho). */
export function compromissosRestantes(eventos: Evento[], agoraMs: number): number {
  return comHorarioDeHoje(eventos, agoraMs).filter((x) => x.e > agoraMs).length;
}
