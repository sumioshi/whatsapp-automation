import { diaBrt, minutosBrt } from './agenda-semana';
import { formatarEspera } from './aparencia';
import type { Origem } from './data';

/**
 * Contas do Painel e da faixa de situação do Hoje: volume recebido, primeira
 * resposta (quanto o cliente esperou e quem respondeu), clientes mais ativos,
 * horário em que os clientes escrevem e entregas por mês. Puro: as mensagens já
 * chegam classificadas e o relógio vem do chamador. Dias e horas em Brasília.
 */

const MIN_MS = 60_000;
const H_MS = 60 * MIN_MS;
const DIA_MS = 24 * H_MS;
const OFFSET_MS = 3 * H_MS;

export type Periodo = 7 | 30 | 90;
export const PERIODOS: readonly Periodo[] = [7, 30, 90];

/** Período vindo da URL (`?periodo=7`); qualquer outra coisa é 30 dias. */
export function periodoDe(bruto: unknown): Periodo {
  const v = Number(Array.isArray(bruto) ? bruto[0] : bruto);
  return (PERIODOS as readonly number[]).includes(v) ? (v as Periodo) : 30;
}

/**
 * Quem escreveu uma mensagem. A própria conta se divide pela origem gravada na
 * captura: celular ou WhatsApp Web é o operador na mão; o que o coletor enviou é
 * a IA, salvo quando o painel carimbou quem estava logado (o dono ou alguém da
 * equipe). Mensagem antiga, de antes do registro de origem, fica sem registro.
 */
export type Autor = 'cliente' | 'celular' | 'painel' | 'equipe' | 'ia' | 'sem-registro';
export type QuemRespondeu = Exclude<Autor, 'cliente'>;

export interface MensagemParaClassificar {
  fromMe?: boolean;
  /** Papel de quem enviou (contatos): a própria conta, alguém do time ou cliente. */
  papel: 'me' | 'team' | 'client';
  origem?: Origem;
  ator?: 'painel';
  usuario?: string;
}

export function autorDaMensagem(m: MensagemParaClassificar, dono: string | null): Autor {
  if (!m.fromMe) {
    if (m.papel === 'client') return 'cliente';
    return m.papel === 'team' ? 'equipe' : 'sem-registro';
  }
  if (m.ator === 'painel') return !m.usuario || m.usuario === dono ? 'painel' : 'equipe';
  if (m.origem === 'celular' || m.origem === 'web') return 'celular';
  if (m.origem === 'coletor' || m.origem === 'ia_meta') return 'ia';
  return 'sem-registro';
}

export interface MsgAtendimento {
  ms: number;
  autor: Autor;
}

export interface ConversaPainel {
  slug: string;
  nome: string;
  avatarPath: string | null;
  /** Em ordem cronológica. */
  msgs: MsgAtendimento[];
}

export interface Resposta {
  /** Quando a resposta saiu. */
  ms: number;
  /** Da primeira mensagem do cliente ainda sem resposta até a resposta. */
  esperaMs: number;
  quem: QuemRespondeu;
}

/**
 * Primeiras respostas de uma conversa: a espera começa na primeira mensagem do
 * cliente sem resposta (a mesma régua da caixa de entrada) e termina na primeira
 * mensagem que não é dele. Mensagem nossa sem cliente esperando não conta, e a
 * espera ainda em aberto também não.
 */
export function respostasDaConversa(msgs: MsgAtendimento[]): Resposta[] {
  const out: Resposta[] = [];
  let desde: number | null = null;
  for (const m of msgs) {
    if (m.autor === 'cliente') {
      if (desde === null) desde = m.ms;
    } else if (desde !== null) {
      out.push({ ms: m.ms, esperaMs: m.ms - desde, quem: m.autor });
      desde = null;
    }
  }
  return out;
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? (v[meio] as number) : ((v[meio - 1] as number) + (v[meio] as number)) / 2;
}

/** Tempo de resposta em número e unidade ("18 min", "1h 05m"); abaixo de um minuto, "<1 min". */
export function partesDoTempo(ms: number): { valor: string; unidade: string }[] {
  return ms < MIN_MS ? [{ valor: '<1', unidade: 'min' }] : formatarEspera(ms);
}

/** Variação em fração do anterior (0,2 = +20%); sem base, não há variação. */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return (atual - anterior) / anterior;
}

/** Percentuais inteiros que somam 100: o que sobra vai para os maiores restos. */
function percentuais(contagens: number[]): number[] {
  const total = contagens.reduce((s, n) => s + n, 0);
  if (total === 0) return contagens.map(() => 0);
  const brutos = contagens.map((n) => (n / total) * 100);
  const pct = brutos.map(Math.floor);
  let falta = 100 - pct.reduce((s, n) => s + n, 0);
  const ordem = brutos.map((b, i) => ({ i, resto: b - Math.floor(b) })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordem) {
    if (falta <= 0) break;
    pct[i] = (pct[i] as number) + 1;
    falta--;
  }
  return pct;
}

/** Faixas da primeira resposta, na régua da espera: verde é rápido, vermelho passou de 4 h. */
export const FAIXAS_RESPOSTA = [
  { id: 'ate5min', rotulo: 'até 5 min', ateMs: 5 * MIN_MS },
  { id: 'ate30min', rotulo: '5 a 30 min', ateMs: 30 * MIN_MS },
  { id: 'ate2h', rotulo: '30 min a 2 h', ateMs: 2 * H_MS },
  { id: 'ate4h', rotulo: '2 a 4 h', ateMs: 4 * H_MS },
  { id: 'mais4h', rotulo: 'mais de 4 h', ateMs: Number.POSITIVE_INFINITY },
] as const;

export interface Faixa {
  id: (typeof FAIXAS_RESPOSTA)[number]['id'];
  rotulo: string;
  n: number;
  pct: number;
}

export function faixasDeResposta(esperasMs: number[]): Faixa[] {
  const n = FAIXAS_RESPOSTA.map(() => 0);
  for (const e of esperasMs) {
    const i = FAIXAS_RESPOSTA.findIndex((f) => e <= f.ateMs);
    n[i] = (n[i] as number) + 1;
  }
  const pct = percentuais(n);
  return FAIXAS_RESPOSTA.map((f, i) => ({ id: f.id, rotulo: f.rotulo, n: n[i] as number, pct: pct[i] as number }));
}

function somarDiasYmd(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);
}

/** Os `n` dias (Brasília) que terminam hoje, do mais antigo ao mais novo. */
export function diasDoPeriodo(agoraMs: number, n: number): string[] {
  const hoje = diaBrt(agoraMs);
  return Array.from({ length: n }, (_, i) => somarDiasYmd(hoje, i - n + 1));
}

/** Quantos instantes caem em cada dia (Brasília); o que cai fora dos dias some. */
export function serieDiaria(instantes: number[], dias: string[]): number[] {
  const indice = new Map(dias.map((d, i) => [d, i]));
  const serie = dias.map(() => 0);
  for (const t of instantes) {
    const i = indice.get(diaBrt(t));
    if (i !== undefined) serie[i] = (serie[i] as number) + 1;
  }
  return serie;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** `YYYY-MM` do mês `delta` meses depois de `mes`. */
function somarMeses(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const total = a * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

function nomeDoMes(mes: string): string {
  return MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
}

export interface EntregasPorMes {
  meses: Array<{ mes: string; rotulo: string; n: number }>;
  /**
   * Média dos meses fechados desde o primeiro com entrega registrada: é a
   * referência da linha tracejada (o sistema não guarda meta de entregas).
   */
  media: number | null;
  atual: number;
  anterior: number;
  nomeMes: string;
  nomeMesAnterior: string;
}

export function entregasPorMes(features: Array<{ em: string }>, agoraMs: number, quantos = 12): EntregasPorMes {
  const atual = diaBrt(agoraMs).slice(0, 7);
  const meses = Array.from({ length: quantos }, (_, i) => somarMeses(atual, i - quantos + 1));
  const n = new Map(meses.map((m) => [m, 0]));
  for (const f of features) {
    const t = Date.parse(f.em);
    if (Number.isNaN(t) || t > agoraMs) continue;
    const m = diaBrt(t).slice(0, 7);
    if (n.has(m)) n.set(m, (n.get(m) as number) + 1);
  }
  const fechados = meses.slice(0, -1);
  const primeiro = fechados.findIndex((m) => (n.get(m) as number) > 0);
  const base = primeiro < 0 ? [] : fechados.slice(primeiro);
  const anterior = somarMeses(atual, -1);
  return {
    meses: meses.map((m) => ({ mes: m, rotulo: MESES_CURTOS[Number(m.slice(5, 7)) - 1] as string, n: n.get(m) as number })),
    media: base.length ? base.reduce((s, m) => s + (n.get(m) as number), 0) / base.length : null,
    atual: n.get(atual) as number,
    anterior: n.get(anterior) ?? 0,
    nomeMes: nomeDoMes(atual),
    nomeMesAnterior: nomeDoMes(anterior),
  };
}

const ORDEM_QUEM: QuemRespondeu[] = ['celular', 'painel', 'equipe', 'ia', 'sem-registro'];
export const ROTULO_QUEM: Record<QuemRespondeu, string> = {
  celular: 'Você, celular',
  painel: 'Você, painel',
  equipe: 'Equipe',
  ia: 'IA',
  'sem-registro': 'Sem registro',
};

export interface Painel {
  periodo: Periodo;
  geradoEm: string;
  /** Dias do período (Brasília), do mais antigo ao mais novo. */
  dias: string[];
  recebidas: { total: number; anterior: number; variacao: number | null; serie: number[]; serieAnterior: number[] };
  primeiraResposta: {
    total: number;
    medianaMs: number | null;
    anteriorMs: number | null;
    variacao: number | null;
    /** Mediana de cada dia do período; null no dia sem resposta. */
    serieMediana: Array<number | null>;
  };
  faixas: Faixa[];
  quem: Array<{ id: QuemRespondeu; rotulo: string; n: number; pct: number }>;
  maisAtivos: Array<{ slug: string; nome: string; avatarPath: string | null; n: number }>;
  /** Mensagens de cliente por dia da semana (segunda a domingo) e hora. */
  calor: number[][];
  entregas: EntregasPorMes;
}

/** Instante em que começa o dia `ymd` em Brasília. */
function inicioDoDia(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00Z`) + OFFSET_MS;
}

export function montarPainel(
  conversas: ConversaPainel[],
  features: Array<{ em: string }>,
  agoraMs: number,
  periodo: Periodo,
): Painel {
  const dias = diasDoPeriodo(agoraMs, periodo);
  const diasAntes = dias.map((d) => somarDiasYmd(d, -periodo));
  const inicio = inicioDoDia(dias[0] as string);
  const inicioAntes = inicioDoDia(diasAntes[0] as string);
  const noPeriodo = (t: number) => t >= inicio && t <= agoraMs;
  const noAnterior = (t: number) => t >= inicioAntes && t < inicio;

  const recebidasAgora: number[] = [];
  const recebidasAntes: number[] = [];
  const respostas: Resposta[] = [];
  const respostasAntes: Resposta[] = [];
  const porConversa: Painel['maisAtivos'] = [];
  const calor = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

  for (const c of conversas) {
    let n = 0;
    for (const m of c.msgs) {
      if (m.autor !== 'cliente') continue;
      if (noPeriodo(m.ms)) {
        recebidasAgora.push(m.ms);
        n++;
        const diaSemana = (new Date(m.ms - OFFSET_MS).getUTCDay() + 6) % 7;
        const linha = calor[diaSemana] as number[];
        const hora = Math.floor(minutosBrt(m.ms) / 60);
        linha[hora] = (linha[hora] as number) + 1;
      } else if (noAnterior(m.ms)) {
        recebidasAntes.push(m.ms);
      }
    }
    if (n > 0) porConversa.push({ slug: c.slug, nome: c.nome, avatarPath: c.avatarPath, n });
    for (const r of respostasDaConversa(c.msgs)) {
      if (noPeriodo(r.ms)) respostas.push(r);
      else if (noAnterior(r.ms)) respostasAntes.push(r);
    }
  }

  const medianaMs = mediana(respostas.map((r) => r.esperaMs));
  const anteriorMs = mediana(respostasAntes.map((r) => r.esperaMs));
  const porDia = new Map<string, number[]>();
  for (const r of respostas) {
    const d = diaBrt(r.ms);
    const lista = porDia.get(d);
    if (lista) lista.push(r.esperaMs);
    else porDia.set(d, [r.esperaMs]);
  }

  const contagemQuem = new Map<QuemRespondeu, number>(ORDEM_QUEM.map((q) => [q, 0]));
  for (const r of respostas) contagemQuem.set(r.quem, (contagemQuem.get(r.quem) as number) + 1);
  // "Sem registro" só aparece quando existe: no dia a dia toda resposta tem origem.
  const ids = ORDEM_QUEM.filter((q) => q !== 'sem-registro' || (contagemQuem.get(q) as number) > 0);
  const pctQuem = percentuais(ids.map((q) => contagemQuem.get(q) as number));

  return {
    periodo,
    geradoEm: new Date(agoraMs).toISOString(),
    dias,
    recebidas: {
      total: recebidasAgora.length,
      anterior: recebidasAntes.length,
      variacao: variacao(recebidasAgora.length, recebidasAntes.length),
      serie: serieDiaria(recebidasAgora, dias),
      serieAnterior: serieDiaria(recebidasAntes, diasAntes),
    },
    primeiraResposta: {
      total: respostas.length,
      medianaMs,
      anteriorMs,
      variacao: variacao(medianaMs, anteriorMs),
      serieMediana: dias.map((d) => mediana(porDia.get(d) ?? [])),
    },
    faixas: faixasDeResposta(respostas.map((r) => r.esperaMs)),
    quem: ids.map((id, i) => ({ id, rotulo: ROTULO_QUEM[id], n: contagemQuem.get(id) as number, pct: pctQuem[i] as number })),
    maisAtivos: porConversa.sort((a, b) => b.n - a.n || a.slug.localeCompare(b.slug)).slice(0, 5),
    calor,
    entregas: entregasPorMes(features, agoraMs),
  };
}

/**
 * Conversas que entram nas contas: fica de fora o que o painel silenciou, o que
 * só tem a etiqueta "Pessoal" e a conversa da conta consigo mesma (resumos e
 * avisos do sistema, não atendimento).
 */
export function conversaDeTrabalho(
  g: { slug: string; etiquetas?: string[] },
  silenciada: boolean,
  idsDaConta: ReadonlySet<string>,
): boolean {
  if (silenciada) return false;
  const etiquetas = g.etiquetas ?? [];
  if (etiquetas.includes('Pessoal') && etiquetas.every((e) => e === 'Pessoal')) return false;
  return !(g.slug.startsWith('dm-') && idsDaConta.has(g.slug.slice(3)));
}

export function textoEntregasAnteriores(anterior: number, nomeMesAnterior: string): string {
  return anterior === 0 ? `nenhuma em ${nomeMesAnterior}` : `${anterior} em ${nomeMesAnterior}`;
}

export type TomChip = 'ok' | 'atencao' | 'neutro';
export interface Rodape {
  chip: { texto: string; tom: TomChip } | null;
  texto: string;
}

function porcentagem(fracao: number): string {
  const p = Math.round(fracao * 100);
  return p > 0 ? `+${p}%` : p < 0 ? `−${-p}%` : '0%';
}

/**
 * A linha de baixo de cada indicador: a variação num chip e o que ela compara.
 * Mais mensagens e mais entregas ficam verdes; na primeira resposta, verde é cair.
 */
export function rodapesDosIndicadores(p: Painel): { recebidas: Rodape; resposta: Rodape; entregas: Rodape } {
  const dias = `${p.periodo} dias anteriores`;
  const vr = p.recebidas.variacao;
  const recebidas: Rodape =
    vr === null
      ? { chip: null, texto: p.recebidas.anterior === 0 ? `nenhuma nos ${dias}` : `vs. ${dias}` }
      : { chip: { texto: porcentagem(vr), tom: Math.round(vr * 100) > 0 ? 'ok' : 'neutro' }, texto: `vs. ${dias}` };

  const vp = p.primeiraResposta.variacao;
  let resposta: Rodape;
  if (vp === null) {
    resposta = { chip: null, texto: p.primeiraResposta.medianaMs === null ? 'sem respostas no período' : `sem respostas nos ${dias}` };
  } else {
    const pct = Math.round(vp * 100);
    resposta = {
      chip: { texto: porcentagem(vp), tom: pct < 0 ? 'ok' : pct > 0 ? 'atencao' : 'neutro' },
      texto: pct < 0 ? 'mais rápido que antes' : pct > 0 ? 'mais lento que antes' : `igual aos ${dias}`,
    };
  }

  const { atual, anterior, nomeMesAnterior } = p.entregas;
  const delta = atual - anterior;
  const entregas: Rodape = {
    chip:
      atual === 0 && anterior === 0
        ? null
        : { texto: delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '0', tom: delta > 0 ? 'ok' : 'neutro' },
    texto: textoEntregasAnteriores(anterior, nomeMesAnterior),
  };
  return { recebidas, resposta, entregas };
}

/** O dia de hoje para a faixa de situação e a IA: primeira resposta e o que a IA enviou. */
export function resumoDeHoje(
  conversas: ConversaPainel[],
  agoraMs: number,
): { medianaMs: number | null; respostas: number; iaEnviadas: number } {
  const hoje = diaBrt(agoraMs);
  const deHoje = (t: number) => t <= agoraMs && diaBrt(t) === hoje;
  const esperas: number[] = [];
  let iaEnviadas = 0;
  for (const c of conversas) {
    for (const m of c.msgs) if (m.autor === 'ia' && deHoje(m.ms)) iaEnviadas++;
    for (const r of respostasDaConversa(c.msgs)) if (deHoje(r.ms)) esperas.push(r.esperaMs);
  }
  return { medianaMs: mediana(esperas), respostas: esperas.length, iaEnviadas };
}
