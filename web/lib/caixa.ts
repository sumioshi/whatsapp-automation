/**
 * Contas da Caixa (fila, conversa e painel do cliente). Puras, sem `node:*`:
 * servem ao servidor, ao cliente e aos testes. Datas sempre no fuso de Brasília,
 * para o HTML do servidor bater com o do navegador.
 */
import type { Contrato } from './contratos';
import type { Sinal } from './dashboard';

const FUSO = 'America/Sao_Paulo';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = [
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
const DIA_MS = 24 * 60 * 60_000;

// ── Fila ──────────────────────────────────────────────────────────────────

export type VistaFila = 'esperando' | 'ia' | 'todas';

/** Quem espera resposta: o recorte serializável do item da caixa de entrada. */
export interface EsperaFila {
  slug: string;
  nome: string;
  motivo: 'client-waiting' | 'mentioned';
  /** Quem escreveu a mensagem que abriu a espera. */
  de: string;
  previa: string;
  /** ISO do começo da espera. */
  desde: string;
}

/** Uma conversa da lista completa: o recorte serializável do resumo do chat. */
export interface ConversaFila {
  slug: string;
  nome: string;
  avatarPath: string | null;
  /** "Quem: texto" da última mensagem. */
  previa: string | null;
  ultimaEm: string | null;
  naoLidas: number;
  fixada: boolean;
  silenciada: boolean;
  arquivada: boolean;
  etiquetas: string[];
}

/** Entrega viva da fila de envio humanizado (agendada ou saindo). */
export interface EntregaViva {
  ticket: string;
  slug: string;
  estado: string;
  enviados: number;
  total: number;
  /** ISO de quando a digitação começa. */
  entregarEm: string;
}

/** Pergunta que a triagem preparou e que espera o "ok N" do operador. */
export interface AguardandoOk {
  slug: string;
  n: number;
  texto: string;
  /** ISO de quando a passada da triagem gravou a pergunta. */
  desde: string;
}

export type EstadoIa =
  | { tipo: 'entregando'; atual: number; total: number; enviados: number }
  | { tipo: 'agendado'; hora: string }
  | { tipo: 'ok'; n: number };

export interface LinhaFila {
  slug: string;
  nome: string;
  tipo: 'grupo' | 'dm';
  avatarPath: string | null;
  /** A primeira etiqueta do chat (a linha mostra uma só). */
  etiqueta: string | null;
  mencao: boolean;
  /** ISO do começo da espera; o anel é calculado com o relógio de quem mostra. */
  esperaDesde: string | null;
  ia: EstadoIa | null;
  previa: { de: string | null; texto: string } | null;
  naoLidas: number;
  silenciada: boolean;
  ultimaEm: string | null;
}

export type IdSecao = 'esperando' | 'ia' | 'fixadas' | 'conversas' | 'arquivadas';

export interface SecaoFila {
  id: IdSecao;
  titulo: string;
  linhas: LinhaFila[];
  /** Quantas conversas a seção tem, mesmo recolhida. */
  total: number;
  /** Só as arquivadas: fechadas até abrir ou filtrar. */
  recolhida?: boolean;
}

export interface Fila {
  secoes: SecaoFila[];
  /** Totais das vistas, sem filtro (vão no seletor). */
  contagens: { esperando: number; ia: number };
  /** Esperando você mais com a IA. */
  abertas: number;
  /** Slugs das linhas visíveis, na ordem da tela (J/K andam nela). */
  ordem: string[];
}

/** Pergunta da triagem mais velha que isso não prende mais a conversa na seção da IA. */
export const OK_VALIDO_MS = 7 * DIA_MS;

const TITULO: Record<IdSecao, string> = {
  esperando: 'Esperando você',
  ia: 'Com a IA',
  fixadas: 'Fixadas',
  conversas: 'Conversas',
  arquivadas: 'Arquivadas',
};

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

/** "Fulano: texto" → quem e o quê; mídia "[áudio]" vira "áudio". */
export function dividirPrevia(previa: string | null | undefined): { de: string | null; texto: string } | null {
  if (!previa) return null;
  const i = previa.indexOf(': ');
  const de = i > 0 ? previa.slice(0, i) : null;
  const resto = i > 0 ? previa.slice(i + 2) : previa;
  return { de, texto: resto.replace(/^\[([^\]]+)\]$/, '$1') };
}

export function rotuloEstadoIa(ia: EstadoIa): string {
  if (ia.tipo === 'entregando') return `entregando ${ia.atual}/${ia.total}`;
  if (ia.tipo === 'agendado') return `agendado ${ia.hora}`;
  return 'espera seu OK';
}

function estadoDaEntrega(e: EntregaViva): EstadoIa | null {
  if (e.estado === 'entregando') {
    const total = Math.max(1, e.total);
    return { tipo: 'entregando', atual: Math.min(total, e.enviados + 1), total, enviados: e.enviados };
  }
  if (e.estado === 'agendado') return { tipo: 'agendado', hora: horaCurta(e.entregarEm) };
  return null;
}

const ORDEM_IA: Record<EstadoIa['tipo'], number> = { entregando: 0, ok: 1, agendado: 2 };

export function montarFila(
  entrada: { esperando: EsperaFila[]; conversas: ConversaFila[]; entregas: EntregaViva[]; aguardandoOk: AguardandoOk[] },
  opts: { vista: VistaFila; filtro?: string; arquivadasAbertas?: boolean; agoraMs?: number },
): Fila {
  const porSlug = new Map(entrada.conversas.map((c) => [c.slug, c]));

  const base = (slug: string, nomeReserva?: string): LinhaFila => {
    const c = porSlug.get(slug);
    return {
      slug,
      nome: c?.nome ?? nomeReserva ?? slug,
      tipo: slug.startsWith('dm-') ? 'dm' : 'grupo',
      avatarPath: c?.avatarPath ?? null,
      etiqueta: c?.etiquetas[0] ?? null,
      mencao: false,
      esperaDesde: null,
      ia: null,
      previa: dividirPrevia(c?.previa),
      naoLidas: c?.naoLidas ?? 0,
      silenciada: c?.silenciada ?? false,
      ultimaEm: c?.ultimaEm ?? null,
    };
  };

  // Com a IA: entrega saindo ou agendada, ou pergunta esperando o OK (uma linha por chat).
  const ia = new Map<string, LinhaFila>();
  for (const e of entrada.entregas) {
    const estado = estadoDaEntrega(e);
    if (!estado || ia.has(e.slug)) continue;
    ia.set(e.slug, { ...base(e.slug), ia: estado });
  }
  for (const ok of entrada.aguardandoOk) {
    if (ia.has(ok.slug)) continue;
    if (opts.agoraMs !== undefined && opts.agoraMs - Date.parse(ok.desde) > OK_VALIDO_MS) continue;
    ia.set(ok.slug, { ...base(ok.slug), ia: { tipo: 'ok', n: ok.n }, previa: { de: 'IA', texto: ok.texto } });
  }
  const linhasIa = [...ia.values()].sort((a, b) => {
    const da = a.ia as EstadoIa;
    const db = b.ia as EstadoIa;
    if (ORDEM_IA[da.tipo] !== ORDEM_IA[db.tipo]) return ORDEM_IA[da.tipo] - ORDEM_IA[db.tipo];
    if (da.tipo === 'agendado' && db.tipo === 'agendado') return da.hora.localeCompare(db.hora);
    return 0;
  });

  // Esperando você: quem espera e ainda não está com a IA, mais antigo primeiro.
  const linhasEspera = entrada.esperando
    .filter((e) => !ia.has(e.slug))
    .sort((a, b) => a.desde.localeCompare(b.desde))
    .map((e) => ({
      ...base(e.slug, e.nome),
      mencao: e.motivo === 'mentioned',
      esperaDesde: e.desde,
      previa: { de: e.de, texto: dividirPrevia(e.previa)?.texto ?? '' },
    }));

  const q = normalizar(opts.filtro ?? '');
  const casa = (l: LinhaFila) =>
    !q || normalizar(l.nome).includes(q) || (porSlug.get(l.slug)?.etiquetas ?? []).some((et) => normalizar(et).includes(q));

  const secoes: SecaoFila[] = [];
  const secao = (id: IdSecao, linhas: LinhaFila[], extra: Partial<SecaoFila> = {}) => {
    const visiveis = linhas.filter(casa);
    secoes.push({ id, titulo: TITULO[id], linhas: visiveis, total: visiveis.length, ...extra });
  };

  if (opts.vista === 'esperando') secao('esperando', linhasEspera);
  else if (opts.vista === 'ia') secao('ia', linhasIa);
  else {
    const vistos = new Set([...linhasEspera.map((l) => l.slug), ...linhasIa.map((l) => l.slug)]);
    const resto = entrada.conversas.filter((c) => !vistos.has(c.slug));
    const fixadas = resto.filter((c) => c.fixada && !c.arquivada).map((c) => base(c.slug));
    const soltas = resto.filter((c) => !c.fixada && !c.arquivada).map((c) => base(c.slug));
    const arquivadas = resto.filter((c) => c.arquivada).map((c) => base(c.slug));
    for (const [id, linhas] of [
      ['esperando', linhasEspera],
      ['ia', linhasIa],
      ['fixadas', fixadas],
      ['conversas', soltas],
    ] as const) {
      secao(id, linhas);
    }
    const arquivadasVisiveis = arquivadas.filter(casa);
    const recolhida = !q && !opts.arquivadasAbertas;
    secoes.push({
      id: 'arquivadas',
      titulo: TITULO.arquivadas,
      linhas: recolhida ? [] : arquivadasVisiveis,
      total: arquivadasVisiveis.length,
      recolhida,
    });
    // Com filtro, seção sem resultado some; sem filtro, some só a que nunca teve conversa.
    for (let i = secoes.length - 1; i >= 0; i--) {
      const s = secoes[i] as SecaoFila;
      if (s.total === 0) secoes.splice(i, 1);
    }
  }

  return {
    secoes,
    contagens: { esperando: linhasEspera.length, ia: linhasIa.length },
    abertas: linhasEspera.length + linhasIa.length,
    ordem: secoes.flatMap((s) => s.linhas.map((l) => l.slug)),
  };
}

// ── Conversa ──────────────────────────────────────────────────────────────

export type Identidade = 'celular' | 'web' | 'painel' | 'equipe' | 'ia' | 'meta' | 'voce';

export interface Autoria {
  id: Identidade;
  quem: string;
  via: string | null;
}

/**
 * Quem escreveu uma mensagem da própria conta. `ator: painel` é envio pelo
 * painel (o operador, quando o login é o dele, ou alguém da equipe); a origem
 * diz se saiu do celular, do WhatsApp Web, da IA da Meta ou da automação.
 */
export function autoria(
  m: { fromMe?: boolean; origem?: string; ator?: string; usuario?: string },
  donoLogin: string | null,
): Autoria | null {
  if (!m.fromMe) return null;
  if (m.ator === 'painel') {
    const dono = !m.usuario || (donoLogin !== null && m.usuario === donoLogin);
    return dono ? { id: 'painel', quem: 'Você', via: 'pelo painel' } : { id: 'equipe', quem: m.usuario as string, via: 'pelo painel' };
  }
  if (m.origem === 'celular') return { id: 'celular', quem: 'Você', via: 'pelo celular' };
  if (m.origem === 'web') return { id: 'web', quem: 'Você', via: 'pelo WhatsApp Web' };
  if (m.origem === 'ia_meta') return { id: 'meta', quem: 'IA da Meta', via: 'em nome da conta' };
  if (m.origem === 'coletor') return { id: 'ia', quem: 'IA', via: 'pelo agente' };
  return { id: 'voce', quem: 'Você', via: null };
}

const SEQUENCIA_MS = 5 * 60_000;

type Encadeavel = { sender: string; timestamp: string; type: string; fromMe?: boolean; origem?: string; ator?: string; usuario?: string };

function chaveAutor(m: Encadeavel, donoLogin: string | null): string {
  const a = autoria(m, donoLogin);
  return a ? `eu:${a.id}:${a.quem}` : `de:${m.sender}`;
}

/** A mensagem `b` continua o bloco de `a` (mesmo autor, mesmo dia, menos de 5 min)? */
export function continuaSequencia(a: Encadeavel | undefined, b: Encadeavel, donoLogin: string | null): boolean {
  if (!a || a.type === 'call' || b.type === 'call') return false;
  if (chaveDia(a.timestamp) !== chaveDia(b.timestamp)) return false;
  const dt = Date.parse(b.timestamp) - Date.parse(a.timestamp);
  if (!(dt >= 0 && dt < SEQUENCIA_MS)) return false;
  return chaveAutor(a, donoLogin) === chaveAutor(b, donoLogin);
}

export function agruparReacoes(
  reacoes: Array<{ emoji: string; by: string; fromMe: boolean }>,
): Array<{ emoji: string; n: number; quem: string[] }> {
  const porEmoji = new Map<string, { emoji: string; n: number; quem: string[] }>();
  for (const r of reacoes) {
    const g = porEmoji.get(r.emoji) ?? { emoji: r.emoji, n: 0, quem: [] };
    g.n += 1;
    g.quem.push(r.fromMe ? 'você' : r.by);
    porEmoji.set(r.emoji, g);
  }
  return [...porEmoji.values()];
}

/** Transição de uma entrega da fila de envio humanizado (uma linha do registro de entregas). */
export interface EventoEntrega {
  ts: string;
  ticket: string;
  slug: string;
  estado: string;
  motivo: string | null;
  enviados: number;
  total: number;
  iniciadoEm: string | null;
}

export interface BalaoDaIa {
  ticket: string;
  n: number;
  total: number;
}

export interface AvisoEntrega {
  ts: string;
  ticket: string;
  texto: string;
}

const TERMINAIS = new Set(['entregue', 'interrompido', 'cancelado']);
/** Folga entre o relógio do coletor e o horário que o WhatsApp dá à mensagem. */
const FOLGA_ANTES_MS = 5_000;
const FOLGA_DEPOIS_MS = 10_000;

function oQueNaoSaiu(enviados: number, total: number): string {
  if (enviados === 0) return total === 1 ? 'Nada saiu.' : `Os ${total} balões não saíram.`;
  const resto = total - enviados;
  return resto === 1 ? 'O outro não saiu.' : `Os outros ${resto} não saíram.`;
}

function textoDoAviso(e: EventoEntrega): string | null {
  const resto = e.total - e.enviados;
  if (resto <= 0) return null;
  const antes = `antes do ${e.enviados + 1}º balão`;
  if (e.estado === 'cancelado') {
    if (e.motivo === 'substituido') {
      return e.enviados > 0 ? `Resposta da IA trocada por outra ${antes}. ${oQueNaoSaiu(e.enviados, e.total)}` : null;
    }
    return `Entrega cancelada ${antes}. ${oQueNaoSaiu(e.enviados, e.total)}`;
  }
  if (e.estado !== 'interrompido') return null;
  if (e.motivo === 'mensagem_nova') return `Entrega interrompida: chegou mensagem nova ${antes}. ${oQueNaoSaiu(e.enviados, e.total)}`;
  if (e.motivo === 'operador_respondeu') return `Entrega interrompida: você respondeu ${antes}. ${oQueNaoSaiu(e.enviados, e.total)}`;
  return `Entrega interrompida ${antes}. ${oQueNaoSaiu(e.enviados, e.total)}`;
}

/**
 * Liga as mensagens da IA (origem do próprio coletor, fora do painel) às
 * entregas da fila: cada balão ganha "n de total" pela ordem dentro da janela
 * da entrega, e entrega interrompida ou cancelada vira um aviso na conversa.
 */
export function ligarEntregas(
  mensagens: Array<{ id: string; timestamp: string; fromMe?: boolean; origem?: string; ator?: string }>,
  eventos: EventoEntrega[],
  agoraMs: number,
): { baloes: Record<string, BalaoDaIa>; avisos: AvisoEntrega[] } {
  const daIa = mensagens
    .filter((m) => m.fromMe && m.origem === 'coletor' && !m.ator)
    .map((m) => ({ id: m.id, t: Date.parse(m.timestamp) }))
    .filter((m) => Number.isFinite(m.t))
    .sort((a, b) => a.t - b.t);

  const porTicket = new Map<string, EventoEntrega[]>();
  for (const e of eventos) porTicket.set(e.ticket, [...(porTicket.get(e.ticket) ?? []), e]);

  const baloes: Record<string, BalaoDaIa> = {};
  const avisos: AvisoEntrega[] = [];
  const usados = new Set<string>();
  for (const [ticket, lista] of porTicket) {
    const ordem = [...lista].sort((a, b) => a.ts.localeCompare(b.ts));
    const fim = ordem.find((e) => TERMINAIS.has(e.estado));
    const ultimo = fim ?? ordem.at(-1);
    if (!ultimo) continue;
    if (fim) {
      const texto = textoDoAviso(fim);
      if (texto) avisos.push({ ts: fim.ts, ticket, texto });
    }
    const iniciado = ordem.find((e) => e.iniciadoEm)?.iniciadoEm ?? ordem.find((e) => e.estado === 'entregando')?.ts;
    if (!iniciado) continue;
    const de = Date.parse(iniciado) - FOLGA_ANTES_MS;
    const ate = fim ? Date.parse(fim.ts) + FOLGA_DEPOIS_MS : agoraMs;
    const limite = fim ? fim.enviados : Number.POSITIVE_INFINITY;
    const dentro = daIa.filter((m) => !usados.has(m.id) && m.t >= de && m.t <= ate).slice(0, limite);
    dentro.forEach((m, i) => {
      usados.add(m.id);
      baloes[m.id] = { ticket, n: i + 1, total: Math.max(ultimo.total, dentro.length) };
    });
  }
  avisos.sort((a, b) => a.ts.localeCompare(b.ts));
  return { baloes, avisos };
}

/** Rótulo de um bloco de balões seguidos da mesma entrega: "1 de 3 balões" ou "1–3 de 3 balões". */
export function rotuloDosBaloes(bloco: BalaoDaIa[]): string {
  const primeiro = bloco[0];
  const ultimo = bloco.at(-1);
  if (!primeiro || !ultimo) return '';
  if (primeiro.total === 1) return '1 balão';
  const faixa = bloco.length === 1 ? String(primeiro.n) : `${primeiro.n}–${ultimo.n}`;
  return `${faixa} de ${primeiro.total} balões`;
}

/**
 * Blocos da linha do tempo: quem continua o bloco da mensagem anterior (sem
 * nome nem avatar) e, no começo de cada bloco da IA, o rótulo da entrega. Um
 * aviso no meio quebra o bloco; balão de outra entrega abre bloco novo.
 */
export function blocosDaConversa(
  itens: Array<{ tipo: 'msg'; m: Encadeavel & { id: string } } | { tipo: 'aviso' }>,
  baloes: Record<string, BalaoDaIa>,
  donoLogin: string | null,
): { continua: Set<string>; rotulos: Record<string, { texto: string; ticket: string }> } {
  const continua = new Set<string>();
  const rotulos: Record<string, { texto: string; ticket: string }> = {};
  let bloco: { id: string; baloes: BalaoDaIa[] } | null = null;
  const fechar = () => {
    const primeiro = bloco?.baloes[0];
    if (bloco && primeiro) rotulos[bloco.id] = { texto: rotuloDosBaloes(bloco.baloes), ticket: primeiro.ticket };
  };
  itens.forEach((item, i) => {
    if (item.tipo !== 'msg') {
      fechar();
      bloco = null;
      return;
    }
    const anterior = itens[i - 1];
    const prev = anterior?.tipo === 'msg' ? anterior.m : undefined;
    const b = baloes[item.m.id];
    const atual = bloco as { id: string; baloes: BalaoDaIa[] } | null;
    const segue = continuaSequencia(prev, item.m, donoLogin);
    if (segue && atual && (b ? atual.baloes[0]?.ticket === b.ticket : atual.baloes.length === 0)) {
      continua.add(item.m.id);
      if (b) atual.baloes.push(b);
      return;
    }
    fechar();
    bloco = { id: item.m.id, baloes: b ? [b] : [] };
  });
  fechar();
  return { continua, rotulos };
}

// ── Painel do cliente ────────────────────────────────────────────────────

export interface Pessoa {
  id: string;
  nome: string;
  papel: 'me' | 'team' | 'client';
  mensagens: number;
  ultimaEm: string;
}

/** Quem escreveu na conversa (fora a própria conta), mais ativo primeiro. */
export function pessoasDaConversa(
  registros: Array<{ sender: string; senderName: string; timestamp: string; fromMe?: boolean }>,
  opts: { papel: (id: string) => Pessoa['papel']; nome: (senderName: string, id: string) => string },
): Pessoa[] {
  const porId = new Map<string, Pessoa>();
  for (const r of registros) {
    if (r.fromMe) continue;
    const id = (r.sender.split('@')[0] ?? '').split(':')[0] ?? '';
    if (!id) continue;
    const p = porId.get(id);
    if (p) {
      p.mensagens += 1;
      if (r.timestamp > p.ultimaEm) p.ultimaEm = r.timestamp;
    } else {
      porId.set(id, { id, nome: opts.nome(r.senderName, id), papel: opts.papel(id), mensagens: 1, ultimaEm: r.timestamp });
    }
  }
  return [...porId.values()]
    .filter((p) => p.papel !== 'me')
    .sort((a, b) => b.mensagens - a.mensagens || a.nome.localeCompare(b.nome, 'pt-BR'));
}

const TIPOS_MIDIA = new Set(['image', 'video', 'gif', 'sticker', 'audio', 'document']);

export interface MidiaResumo {
  id: string;
  tipo: string;
  mediaPath: string;
  timestamp: string;
}

export function midiaDaConversa(
  registros: Array<{ id: string; type: string; mediaPath: string | null; timestamp: string }>,
  limite = 9,
): { total: number; recentes: MidiaResumo[] } {
  const midias = registros.filter((r) => TIPOS_MIDIA.has(r.type) && r.mediaPath);
  return {
    total: midias.length,
    recentes: midias
      .slice(-limite)
      .reverse()
      .map((r) => ({ id: r.id, tipo: r.type, mediaPath: r.mediaPath as string, timestamp: r.timestamp })),
  };
}

export type Tom = 'ok' | 'neutro' | 'warn' | 'danger';

const ESTADO_CONTRATO: Record<Contrato['estado'], { rotulo: string; tom: Tom }> = {
  ativo: { rotulo: 'ativo', tom: 'ok' },
  pausado: { rotulo: 'pausado', tom: 'warn' },
  encerrado: { rotulo: 'encerrado', tom: 'danger' },
  sem: { rotulo: 'sem contrato', tom: 'neutro' },
};

function reais(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
    maximumFractionDigits: 2,
  })
    .format(valor)
    .replace(/ /g, ' ');
}

/** Dias entre duas datas puras (YYYY-MM-DD), sem fuso no meio. */
function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);
}

function diaMes(ymd: string): string {
  return `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1] ?? ''}`;
}

function mesAno(ymd: string): string {
  return `${MESES[Number(ymd.slice(5, 7)) - 1] ?? ''} ${ymd.slice(0, 4)}`;
}

/** Quanto falta para a data: "em 23 dias", "amanhã", "vence hoje", "venceu há 3 dias". */
function falta(fim: string, hoje: string): string {
  const d = diasEntre(hoje, fim);
  if (d === 0) return 'vence hoje';
  if (d === 1) return 'amanhã';
  if (d > 1) return `em ${d} dias`;
  return d === -1 ? 'venceu ontem' : `venceu há ${-d} dias`;
}

export function resumoContrato(
  c: Contrato | null,
  hoje: string,
): { estado: { rotulo: string; tom: Tom }; valor: string | null; inicio: string | null; renova: string | null } {
  if (!c) return { estado: ESTADO_CONTRATO.sem, valor: null, inicio: null, renova: null };
  return {
    estado: ESTADO_CONTRATO[c.estado],
    valor: c.valorMensal !== null ? `Mensal · ${reais(c.valorMensal)}` : null,
    inicio: c.inicio ? mesAno(c.inicio) : null,
    renova: c.fim ? `${diaMes(c.fim)}, ${falta(c.fim, hoje)}` : null,
  };
}

/** O sinal do painel em poucas palavras, para o chip do cliente. */
export function rotuloSinal(s: Sinal, c: Contrato | null, hoje: string): { texto: string; tom: Tom } {
  switch (s) {
    case 'encerrado-ativo':
      return { texto: 'contrato encerrado', tom: 'danger' };
    case 'sem-contrato-ativo':
      return { texto: 'ativo sem contrato', tom: 'warn' };
    case 'pausado-ativo':
      return { texto: 'pausado, mas ativo', tom: 'warn' };
    case 'sem-entrega-30d':
      return { texto: 'sem entrega há 30 dias', tom: 'warn' };
    case 'acima-do-contrato':
      return { texto: 'acima do contrato', tom: 'warn' };
    case 'renovacao-30d': {
      if (!c?.fim) return { texto: 'renova em até 30 dias', tom: 'neutro' };
      const d = diasEntre(hoje, c.fim);
      const quando = d <= 0 ? 'renova hoje' : d === 1 ? 'renova amanhã' : `renova em ${d} dias`;
      return { texto: quando, tom: 'neutro' };
    }
  }
}

/** "cliente desde mar 2025" pelo contrato; sem início, "conversa desde" a primeira mensagem. */
export function desdeQuando(c: Contrato | null, primeiraMensagem: string | null): string | null {
  if (c?.inicio) return `cliente desde ${mesAno(c.inicio)}`;
  if (!primeiraMensagem) return null;
  const dia = chaveDia(primeiraMensagem);
  return dia ? `conversa desde ${mesAno(dia)}` : null;
}

// ── Datas (Brasília) ─────────────────────────────────────────────────────

const FMT_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
const FMT_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false });

/** YYYY-MM-DD do instante em Brasília ("" se inválido). */
export function chaveDia(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : FMT_DIA.format(t);
}

export function horaCurta(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : FMT_HORA.format(t);
}

/** Hora se for hoje, "ontem", ou a data curta (com ano se não for o ano corrente). */
export function quandoCurto(iso: string | null | undefined, agoraMs: number): string {
  if (!iso) return '';
  const dia = chaveDia(iso);
  if (!dia) return '';
  const hoje = FMT_DIA.format(agoraMs);
  if (dia === hoje) return horaCurta(iso);
  if (dia === FMT_DIA.format(agoraMs - DIA_MS)) return 'ontem';
  const curta = `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  return dia.slice(0, 4) === hoje.slice(0, 4) ? curta : `${curta}/${dia.slice(2, 4)}`;
}

/** Separador de dia da conversa: "hoje", "ontem", "12 de agosto" (com ano se for outro). */
export function rotuloDia(iso: string, agoraMs: number): string {
  const dia = chaveDia(iso);
  if (!dia) return '';
  const hoje = FMT_DIA.format(agoraMs);
  if (dia === hoje) return 'hoje';
  if (dia === FMT_DIA.format(agoraMs - DIA_MS)) return 'ontem';
  const base = `${Number(dia.slice(8, 10))} de ${MESES_LONGOS[Number(dia.slice(5, 7)) - 1] ?? ''}`;
  return dia.slice(0, 4) === hoje.slice(0, 4) ? base : `${base} de ${dia.slice(0, 4)}`;
}

// ── Dados do painel do cliente (montados no servidor) ────────────────────

export interface SinalCliente {
  id: Sinal;
  texto: string;
  tom: Tom;
  /** A frase inteira do painel, para o title do chip. */
  explicacao: string;
}

export interface PainelCliente {
  slug: string;
  nome: string;
  tipo: 'grupo' | 'dm';
  avatarPath: string | null;
  /** "cliente desde mar 2025" ou "conversa desde ago 2026". */
  desde: string | null;
  pessoas: Pessoa[];
  midia: { total: number; recentes: MidiaResumo[] };
  /** O que só o dono vê: organização, contrato e sinais. Nulo na área da equipe. */
  dono: null | {
    etiquetas: string[];
    conhecidas: string[];
    sinais: SinalCliente[];
    contrato: Contrato | null;
    resumo: ReturnType<typeof resumoContrato>;
    entregas: { d30: number; total: number };
    mensagens30d: number;
    /** Contas da equipe com este chat liberado. */
    equipe: Array<{ login: string; nome: string }>;
    autonomo: boolean;
    silenciado: boolean;
  };
}
