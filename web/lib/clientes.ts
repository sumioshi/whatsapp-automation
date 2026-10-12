import { atividadeDiaria } from './clientes-tabela';
import { buildContacts } from './contacts';
import { CONTRATO_PADRAO, type Contrato, readContratos } from './contratos';
import { type Sinal, montarDashboard } from './dashboard';
import { type GroupSummary, listGroups, readGroupRecords } from './data';
import { lerUsuarios } from './equipe/usuarios';
import { type Feature, listarFeatures } from './features';
import { evaluateGroup } from './inbox';
import { type SlaBand, aguardandoValido, buildSlaInfo, relativeLabel } from './sla';
import { readTriage } from './triage';

/** Card da visão CRM (/clientes): um chat monitorado com seu estado de conversa. */
export interface ClienteCard {
  slug: string;
  nome: string;
  tipo: 'grupo' | 'dm';
  avatarPath: string | null;
  /** Prévia da última mensagem, já formatada ("Fulano: texto" / "Você: [áudio]"). */
  ultimaPreview: string | null;
  ultimaTimestamp: string | null;
  /** Rótulo relativo da última atividade: "há 5min", "há 2 dias". */
  atividadeLabel: string | null;
  mensagens: number;
  /** Primeira linha das notas de triagem (mini-CRM), se houver. */
  nota: string | null;
  silenciado: boolean;
  /** Mensagens de terceiros desde a última visita (badge de conversa nova). */
  naoLidas: number;
  /** true se o WhatsApp conhece atividade mais nova que a última msg local. */
  desatualizado: boolean;
  /** Etiquetas do chat (empresa/contrato), definidas pelo operador ou pela IA. */
  etiquetas: string[];
  /** true se a última palavra é do cliente (sem resposta sua depois). */
  aguardando: boolean;
  waitingMs: number;
  band: SlaBand | null;
  /** Rótulo do tempo de espera ("há 26h") quando aguardando. */
  waitingLabel: string | null;
}

/** O que a tabela de clientes mostra além da conversa: atividade, contrato, entregas e equipe. */
export interface NegocioDoChat {
  /** Mensagens por dia de Brasília nos últimos 30 dias, do mais antigo para hoje. */
  atividade30d: number[];
  /** Soma de `atividade30d`: as mensagens das duas partes na janela. */
  msgs30d: number;
  contrato: Contrato;
  /** Mensagens em 30 dias que o contrato comporta; null = sem limite. */
  limite: number | null;
  entregas30d: number;
  entregasTotal: number;
  msgsPorEntrega: number | null;
  valorPorEntrega: number | null;
  sinais: Sinal[];
  /** Quem da equipe tem o chat liberado (nome, ou o login quando não há nome). */
  equipe: string[];
}

export type ClienteLinha = ClienteCard & NegocioDoChat;

const NOTA_MAX = 80;
const MS_7D = 7 * 24 * 60 * 60 * 1000;

/**
 * Rótulo de tempo pro card: relativo enquanto comunica urgência (até 7 dias),
 * data absoluta dd/mm/aa quando é histórico — "há 27 dias" não informa nada.
 */
export function rotuloTempo(iso: string | null, agoraMs: number): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  const delta = Math.max(0, agoraMs - ts);
  if (delta <= MS_7D) return relativeLabel(delta);
  const d = new Date(ts);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const aa = String(d.getUTCFullYear() % 100).padStart(2, '0');
  return `${dd}/${mm}/${aa}`;
}

/** Primeira linha não vazia de uma nota, truncada; null se não sobra nada. */
export function primeiraLinha(nota: string | undefined, max = NOTA_MAX): string | null {
  if (!nota) return null;
  const linha = nota
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!linha) return null;
  return linha.length > max ? `${linha.slice(0, max - 1)}…` : linha;
}

/** DMs usam slug `dm-<id>`; qualquer outro diretório é grupo. */
export function tipoDoSlug(slug: string): 'grupo' | 'dm' {
  return slug.startsWith('dm-') ? 'dm' : 'grupo';
}

interface Ordenavel {
  slug: string;
  aguardando: boolean;
  waitingMs: number;
  ultimaTimestamp: string | null;
  silenciado: boolean;
}

/**
 * Ordena os cards para a grade:
 *   1. quem aguarda resposta, mais tempo de espera primeiro;
 *   2. em dia, atividade mais recente primeiro;
 *   3. silenciados por último (mesma ordenação interna).
 */
export function ordenarCards<T extends Ordenavel>(cards: T[]): T[] {
  const ts = (c: T) => (c.ultimaTimestamp ? new Date(c.ultimaTimestamp).getTime() : 0);
  return [...cards].sort((a, b) => {
    if (a.silenciado !== b.silenciado) return a.silenciado ? 1 : -1;
    if (a.aguardando !== b.aguardando) return a.aguardando ? -1 : 1;
    if (a.aguardando && b.aguardando) return b.waitingMs - a.waitingMs;
    return ts(b) - ts(a);
  });
}

/**
 * Contrato, entregas, equipe e atividade de um chat. Os sinais e as contas por
 * entrega vêm do mesmo cálculo do painel, para as duas telas dizerem o mesmo.
 */
export function negocioDoChat(
  chat: { slug: string; nome: string; mensagens: ReadonlyArray<{ timestamp: string; fromMe?: boolean }> },
  contratos: Record<string, Contrato>,
  features: Feature[],
  equipe: ReadonlyArray<{ login: string; nome: string; ativo: boolean; chats: string[] }>,
  agoraMs: number,
): NegocioDoChat {
  const atividade30d = atividadeDiaria(chat.mensagens, agoraMs);
  const doChat = features.filter((f) => f.slug === chat.slug);
  const [linha] = montarDashboard(
    [{ slug: chat.slug, nome: chat.nome, mensagens: chat.mensagens.map((m) => ({ timestamp: m.timestamp, fromMe: Boolean(m.fromMe) })) }],
    contratos,
    doChat,
    agoraMs,
  ).linhas;
  return {
    atividade30d,
    msgs30d: atividade30d.reduce((a, b) => a + b, 0),
    contrato: contratos[chat.slug] ?? CONTRATO_PADRAO,
    limite: null,
    entregas30d: linha?.features30d ?? 0,
    entregasTotal: doChat.length,
    msgsPorEntrega: linha?.msgsPorFeature30d ?? null,
    valorPorEntrega: linha?.valorPorFeature ?? null,
    sinais: linha?.sinais ?? [],
    equipe: equipe.filter((u) => u.ativo && u.chats.includes(chat.slug)).map((u) => u.nome.trim() || u.login),
  };
}

/** Monta os cards de todos os chats monitorados, já ordenados para a grade. */
export async function buildClientes(): Promise<ClienteLinha[]> {
  const now = Date.now();
  const [groups, contacts, triage, contratos, features, equipe] = await Promise.all([
    listGroups(),
    buildContacts(),
    readTriage(),
    readContratos(),
    listarFeatures(),
    lerUsuarios(),
  ]);

  const cards = await Promise.all(
    groups.map(async (g: GroupSummary): Promise<ClienteLinha> => {
      const messages = await readGroupRecords(g.slug);
      const verdict = evaluateGroup(messages, contacts);
      const pedeAtencao = verdict?.reason === 'client-waiting' || verdict?.reason === 'mentioned';
      let sla = pedeAtencao && verdict ? buildSlaInfo(verdict.waitingSince, now) : null;
      // Espera antiga demais = histórico morto, não cliente aguardando.
      if (sla && !aguardandoValido(sla.waitingMs)) sla = null;
      const aguardando = sla !== null;
      const ultimaTimestamp = g.lastTimestamp;

      return {
        slug: g.slug,
        nome: g.name,
        tipo: tipoDoSlug(g.slug),
        avatarPath: g.avatarPath,
        ultimaPreview: g.lastPreview,
        ultimaTimestamp,
        atividadeLabel: rotuloTempo(ultimaTimestamp, now),
        mensagens: g.messageCount,
        nota: primeiraLinha(triage.notes[g.slug]),
        naoLidas: g.unread,
        desatualizado:
          g.lastActivity != null &&
          g.lastActivity * 1000 - (ultimaTimestamp ? new Date(ultimaTimestamp).getTime() : 0) >
            5 * 60_000,
        etiquetas: triage.etiquetas[g.slug] ?? [],
        silenciado: Boolean(triage.muted[g.slug]),
        aguardando,
        waitingMs: sla?.waitingMs ?? 0,
        band: sla?.band ?? null,
        waitingLabel: sla?.label ?? null,
        ...negocioDoChat({ slug: g.slug, nome: g.name, mensagens: messages }, contratos, features, equipe, now),
      };
    }),
  );

  return ordenarCards(cards);
}
