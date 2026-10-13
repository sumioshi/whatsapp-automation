import { diaBrt } from './agenda-semana';
import type { Role } from './contacts';
import type { Contrato } from './contratos';
import type { Feature } from './features';
import type { EntradaMetrica } from './metricas';

/**
 * Cruza atividade (30 d), contrato e entregas por cliente e aponta os sinais que
 * pedem decisão do operador. Puro: relógio e dados vêm do chamador.
 */

/**
 * Cópia local do padrão de contrato (igual a CONTRATO_PADRAO de `./contratos`).
 * Importa só o TIPO de `./contratos` no topo do arquivo, nunca valor: este módulo
 * é consumido também por componente client (DashboardView), e `./contratos` carrega
 * `node:fs/promises` — importar um valor de lá quebraria o bundle do navegador.
 */
const CONTRATO_PADRAO_LOCAL: Contrato = {
  estado: 'sem',
  inicio: null,
  fim: null,
  valorMensal: null,
  limiteMensagens: null,
  nota: '',
};

export type Sinal =
  | 'encerrado-ativo'
  | 'sem-contrato-ativo'
  | 'pausado-ativo'
  | 'renovacao-30d'
  | 'sem-entrega-30d'
  | 'acima-do-contrato';

export interface LinhaDashboard {
  slug: string;
  nome: string;
  contrato: Contrato;
  msgs30d: number;
  msgsCliente30d: number;
  features30d: number;
  featuresTotal: number;
  ultimaFeatureEm: string | null;
  msgsPorFeature30d: number | null;
  valorPorFeature: number | null;
  sinais: Sinal[];
}

export interface Dashboard {
  geradoEm: string;
  linhas: LinhaDashboard[];
  totais: { clientes: number; ativos: number; encerrados: number; features30d: number; comSinal: number };
}

const D_MS = 24 * 60 * 60_000;
const JANELA_MS = 30 * D_MS;
/** Chat "ativo" para os sinais: pelo menos este número de mensagens de cliente em 30 d. */
export const ATIVO_MIN_MSGS = 5;

const FRASES: Record<Sinal, string> = {
  'encerrado-ativo': 'contrato encerrado, mas o cliente segue mandando mensagem: cobrar renovação ou parar de atender',
  'sem-contrato-ativo': 'cliente ativo sem contrato registrado: formalizar ou registrar o contrato',
  'pausado-ativo': 'contrato pausado, mas o chat está ativo: retomar ou alinhar a pausa',
  'renovacao-30d': 'contrato vence em até 30 dias: abrir conversa de renovação',
  'sem-entrega-30d': 'cliente ativo e pagando, sem nenhuma entrega registrada em 30 dias',
  'acima-do-contrato': 'o cliente passou do limite de mensagens do plano em 30 dias: conversar sobre um plano maior',
};

export function explicarSinal(s: Sinal): string {
  return FRASES[s];
}

/**
 * Demanda do cliente: mensagem que não é minha nem de alguém do time. Sem papel
 * informado, o que não é meu conta como cliente (a leitura de antes do papel).
 */
export function ehDoCliente(m: { fromMe?: boolean; papel?: Role }): boolean {
  return !m.fromMe && (m.papel ?? 'client') === 'client';
}

/** Contrato cuja data de fim já passou (comparação de string YYYY-MM-DD, sem fuso). */
function encerradoPorFim(contrato: Contrato, hoje: string): boolean {
  return contrato.fim !== null && contrato.fim < hoje;
}

export function montarDashboard(
  entradas: EntradaMetrica[],
  contratos: Record<string, Contrato>,
  features: Feature[],
  agoraMs: number,
): Dashboard {
  const inicio = agoraMs - JANELA_MS;
  // O dia é o de Brasília: às 22 h do último dia o contrato ainda vale, como em Clientes.
  const hoje = diaBrt(agoraMs);
  const em30d = diaBrt(agoraMs + JANELA_MS);
  const porSlug = new Map<string, Feature[]>();
  for (const f of features) {
    const lista = porSlug.get(f.slug) ?? [];
    lista.push(f);
    porSlug.set(f.slug, lista);
  }

  const linhas: LinhaDashboard[] = entradas.map((e) => {
    let msgs30d = 0;
    let msgsCliente30d = 0;
    for (const m of e.mensagens) {
      const ts = Date.parse(m.timestamp);
      if (Number.isNaN(ts) || ts < inicio || ts > agoraMs) continue;
      msgs30d++;
      if (ehDoCliente(m)) msgsCliente30d++;
    }
    const contrato = contratos[e.slug] ?? CONTRATO_PADRAO_LOCAL;
    const fs = porSlug.get(e.slug) ?? [];
    const recentes = fs.filter((f) => Date.parse(f.em) >= inicio && Date.parse(f.em) <= agoraMs);
    const ultima = fs.reduce<string | null>((max, f) => (max === null || f.em > max ? f.em : max), null);
    const ativo = msgsCliente30d >= ATIVO_MIN_MSGS;
    // Data de fim vencida só encerra um contrato que existia: em 'sem' e 'pausado'
    // a data é resquício, e o sinal certo é o do próprio estado — juntar os dois
    // mandaria o operador cobrar renovação de contrato que nunca esteve valendo.
    const encerrado =
      contrato.estado === 'encerrado' || (contrato.estado === 'ativo' && encerradoPorFim(contrato, hoje));
    const sinais: Sinal[] = [];
    if (encerrado && ativo) sinais.push('encerrado-ativo');
    if (contrato.estado === 'sem' && ativo) sinais.push('sem-contrato-ativo');
    if (contrato.estado === 'pausado' && ativo) sinais.push('pausado-ativo');
    if (contrato.estado === 'ativo' && !encerrado && contrato.fim !== null && contrato.fim <= em30d) sinais.push('renovacao-30d');
    if (contrato.estado === 'ativo' && !encerrado && ativo && recentes.length === 0) sinais.push('sem-entrega-30d');
    // O limite conta só o que o cliente mandou (a demanda dele), não as respostas.
    if (contrato.estado === 'ativo' && !encerrado && contrato.limiteMensagens !== null && msgsCliente30d > contrato.limiteMensagens) {
      sinais.push('acima-do-contrato');
    }
    return {
      slug: e.slug,
      nome: e.nome,
      contrato,
      msgs30d,
      msgsCliente30d,
      features30d: recentes.length,
      featuresTotal: fs.length,
      ultimaFeatureEm: ultima,
      msgsPorFeature30d: recentes.length > 0 ? msgsCliente30d / recentes.length : null,
      valorPorFeature: contrato.valorMensal !== null && recentes.length > 0 ? contrato.valorMensal / recentes.length : null,
      sinais,
    };
  });

  linhas.sort((a, b) => b.sinais.length - a.sinais.length || b.msgsCliente30d - a.msgsCliente30d || a.slug.localeCompare(b.slug));

  return {
    geradoEm: new Date(agoraMs).toISOString(),
    linhas,
    totais: {
      clientes: linhas.length,
      // "ativo" no total é a mesma leitura dos sinais: estado ativo E ainda dentro
      // do prazo. Contrato ativo com fim vencido conta como encerrado nos dois lugares.
      ativos: linhas.filter((l) => l.contrato.estado === 'ativo' && !encerradoPorFim(l.contrato, hoje)).length,
      encerrados: linhas.filter((l) => l.contrato.estado === 'encerrado' || (l.contrato.estado === 'ativo' && encerradoPorFim(l.contrato, hoje))).length,
      features30d: linhas.reduce((s, l) => s + l.features30d, 0),
      comSinal: linhas.filter((l) => l.sinais.length > 0).length,
    },
  };
}
