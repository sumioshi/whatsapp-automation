/**
 * Contas da tabela de clientes: atividade por dia, rótulos de contrato e de data,
 * filtros, ordenação e totais. Puro e sem `node:*`: o servidor monta as linhas e o
 * navegador filtra e ordena com as mesmas funções. Datas sempre em Brasília.
 */
import { hhmm, minutosBrt } from './agenda-semana';
import type { Contrato, EstadoContrato } from './contratos';
import { dataCurta } from './formatar-data';

const DIA_MS = 86_400_000;
const OFFSET_MS = 3 * 3_600_000;
/** Dias da coluna de atividade e da janela de uso do contrato. */
export const DIAS_ATIVIDADE = 30;
/** Contrato que vence até este número de dias pede renovação (mesma régua do painel). */
const DIAS_RENOVACAO = 30;
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** O que as contas da tabela leem de cada cliente. */
export interface LinhaCliente {
  slug: string;
  nome: string;
  tipo: 'grupo' | 'dm';
  etiquetas: string[];
  aguardando: boolean;
  waitingMs: number;
  silenciado: boolean;
  ultimaTimestamp: string | null;
  /** Mensagens (das duas partes) nos últimos 30 dias de Brasília. */
  msgs30d: number;
  /** Mensagens em 30 dias que o contrato comporta; null = sem limite. */
  limite: number | null;
  entregas30d: number;
  entregasTotal: number;
  contrato: Contrato;
}

/** Dias desde a época, contados na meia-noite de Brasília. */
function diaNum(ms: number): number {
  return Math.floor((ms - OFFSET_MS) / DIA_MS);
}

/** Mesma contagem para uma data pura `YYYY-MM-DD`. */
function diaNumDaData(data: string): number {
  return Math.floor(Date.parse(`${data}T00:00:00Z`) / DIA_MS);
}

/**
 * Mensagens por dia de Brasília nos últimos `dias` dias, do mais antigo para hoje
 * (o último valor é hoje). Futuro e data inválida ficam de fora.
 */
export function atividadeDiaria(
  mensagens: ReadonlyArray<{ timestamp: string }>,
  agoraMs: number,
  dias = DIAS_ATIVIDADE,
): number[] {
  const out = new Array<number>(dias).fill(0);
  const hoje = diaNum(agoraMs);
  for (const m of mensagens) {
    const ts = Date.parse(m.timestamp);
    if (Number.isNaN(ts) || ts > agoraMs) continue;
    const atras = hoje - diaNum(ts);
    if (atras >= 0 && atras < dias) out[dias - 1 - atras] = (out[dias - 1 - atras] ?? 0) + 1;
  }
  return out;
}

/**
 * Quando foi a última mensagem, do jeito que se lê numa lista: a hora se foi hoje,
 * "ontem", o dia da semana até 6 dias, depois dia e mês (e o ano, se for outro).
 */
export function rotuloUltimaMsg(iso: string | null, agoraMs: number): string {
  const ts = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(ts)) return '—';
  const atras = diaNum(agoraMs) - diaNum(ts);
  if (atras <= 0) return hhmm(minutosBrt(ts));
  if (atras === 1) return 'ontem';
  // Os campos UTC deste Date são a data de Brasília.
  const d = new Date(ts - OFFSET_MS);
  if (atras < 7) return SEMANA[d.getUTCDay()] ?? '—';
  const base = `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
  const anoAgora = new Date(agoraMs - OFFSET_MS).getUTCFullYear();
  return d.getUTCFullYear() === anoAgora ? base : `${base} ${d.getUTCFullYear()}`;
}

/** Dias até o fim do contrato (0 = vence hoje, negativo = já venceu); sem fim → null. */
export function diasAteFim(c: Contrato, agoraMs: number): number | null {
  return c.fim ? diaNumDaData(c.fim) - diaNum(agoraMs) : null;
}

/** Contrato ativo e dentro do prazo: é o que entra na soma mensal. */
export function contratoValendo(c: Contrato, agoraMs: number): boolean {
  if (c.estado !== 'ativo') return false;
  const dias = diasAteFim(c, agoraMs);
  return dias === null || dias >= 0;
}

/** Ativo que vence nos próximos 30 dias (inclui hoje). */
export function renovaEmBreve(c: Contrato, agoraMs: number): boolean {
  const dias = diasAteFim(c, agoraMs);
  return c.estado === 'ativo' && dias !== null && dias >= 0 && dias <= DIAS_RENOVACAO;
}

export type TomContrato = 'ok' | 'warn' | 'danger' | 'neutro' | 'mudo';

/** Estado do contrato numa linha: o tom do ponto e o texto ("Renova em 23 dias"). */
export function rotuloDoContrato(c: Contrato, agoraMs: number): { tom: TomContrato; texto: string } {
  switch (c.estado) {
    case 'ativo': {
      const dias = diasAteFim(c, agoraMs);
      if (dias !== null && dias < 0) return { tom: 'danger', texto: `Venceu em ${dataCurta(c.fim)}` };
      if (dias !== null && dias <= DIAS_RENOVACAO) {
        const quando = dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`;
        return { tom: 'warn', texto: `Renova ${quando}` };
      }
      return { tom: 'ok', texto: 'Ativo' };
    }
    case 'pausado':
      return { tom: 'neutro', texto: 'Pausado' };
    case 'encerrado':
      return { tom: 'neutro', texto: 'Encerrado' };
    default:
      return { tom: 'mudo', texto: 'Sem contrato' };
  }
}

const REAIS_INTEIROS = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const REAIS_CENTAVOS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `1800` → `R$ 1.800`; centavos só quando há. Sem valor → null. */
export function formatarReais(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  return `R$ ${(Number.isInteger(v) ? REAIS_INTEIROS : REAIS_CENTAVOS).format(v)}`;
}

/**
 * Cliente de trabalho: tem contrato ou entrega registrada, ou é grupo, ou é conversa
 * direta com etiqueta de empresa. Marcado só como "Pessoal" fica de fora.
 */
export function ehTrabalho(l: Pick<LinhaCliente, 'tipo' | 'etiquetas' | 'contrato' | 'entregasTotal'>): boolean {
  if (l.contrato.estado !== 'sem' || l.entregasTotal > 0) return true;
  const empresas = l.etiquetas.filter((e) => e !== 'Pessoal');
  if (l.etiquetas.includes('Pessoal') && empresas.length === 0) return false;
  return l.tipo === 'grupo' || empresas.length > 0;
}

export function acimaDoLimite(l: Pick<LinhaCliente, 'msgs30d' | 'limite'>): boolean {
  return l.limite !== null && l.limite > 0 && l.msgs30d > l.limite;
}

/** "renova" é o ativo que vence em até 30 dias; o resto é o estado do contrato. */
export type FiltroContrato = EstadoContrato | 'renova';

export interface FiltrosClientes {
  /** "trabalho" esconde o pessoal e as conversas soltas. */
  contexto: 'trabalho' | 'tudo';
  busca: string;
  esperando: boolean;
  tipo: 'grupo' | 'dm' | null;
  etiqueta: string | null;
  contrato: FiltroContrato | null;
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
}

export function filtrarLinhas<T extends LinhaCliente>(linhas: T[], f: FiltrosClientes, agoraMs: number): T[] {
  const q = semAcento(f.busca);
  return linhas.filter((l) => {
    if (f.contexto === 'trabalho' && !ehTrabalho(l)) return false;
    if (f.esperando && !l.aguardando) return false;
    if (f.tipo && l.tipo !== f.tipo) return false;
    if (f.etiqueta && !l.etiquetas.includes(f.etiqueta)) return false;
    if (f.contrato === 'renova' ? !renovaEmBreve(l.contrato, agoraMs) : f.contrato && l.contrato.estado !== f.contrato) {
      return false;
    }
    return !q || semAcento(l.nome).includes(q);
  });
}

/** "espera" é a ordem do servidor: quem espera há mais tempo primeiro, silenciados no fim. */
export type ChaveOrdem = 'espera' | 'uso' | 'atividade' | 'entregas' | 'ultima' | 'nome' | 'contrato';

export interface Ordem {
  chave: ChaveOrdem;
  desc: boolean;
}

const NOMES = new Intl.Collator('pt-BR', { sensitivity: 'base' });

function valorDaOrdem(l: LinhaCliente, chave: ChaveOrdem): number | null {
  switch (chave) {
    case 'uso':
      return l.limite !== null && l.limite > 0 ? l.msgs30d / l.limite : null;
    case 'atividade':
      return l.msgs30d;
    case 'entregas':
      return l.entregas30d;
    case 'ultima': {
      const ts = l.ultimaTimestamp ? Date.parse(l.ultimaTimestamp) : Number.NaN;
      return Number.isNaN(ts) ? null : ts;
    }
    case 'contrato':
      return l.contrato.valorMensal;
    default:
      return null;
  }
}

/** Ordena sem mexer na lista original; quem não tem o valor fica no fim nos dois sentidos. */
export function ordenarLinhas<T extends LinhaCliente>(linhas: T[], o: Ordem): T[] {
  if (o.chave === 'espera') return [...linhas];
  if (o.chave === 'nome') return [...linhas].sort((a, b) => (o.desc ? -1 : 1) * NOMES.compare(a.nome, b.nome));
  return [...linhas].sort((a, b) => {
    const va = valorDaOrdem(a, o.chave);
    const vb = valorDaOrdem(b, o.chave);
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
    return (o.desc ? vb - va : va - vb) || b.msgs30d - a.msgs30d;
  });
}

export interface TotaisTabela {
  clientes: number;
  /** Soma do valor mensal dos contratos ativos e dentro do prazo. */
  somaMensal: number;
  /** Quantos passaram do limite de mensagens do contrato. */
  acima: number;
  entregas30d: number;
  /** Esperando resposta, sem contar os silenciados. */
  esperando: number;
}

export function totaisDaTabela(linhas: LinhaCliente[], agoraMs: number): TotaisTabela {
  let somaMensal = 0;
  let acima = 0;
  let entregas30d = 0;
  let esperando = 0;
  for (const l of linhas) {
    if (contratoValendo(l.contrato, agoraMs)) somaMensal += l.contrato.valorMensal ?? 0;
    if (acimaDoLimite(l)) acima++;
    entregas30d += l.entregas30d;
    if (l.aguardando && !l.silenciado) esperando++;
  }
  return { clientes: linhas.length, somaMensal, acima, entregas30d, esperando };
}
