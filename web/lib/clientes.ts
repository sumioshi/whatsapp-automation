import { buildContacts } from './contacts';
import { type GroupSummary, listGroups, readGroupRecords } from './data';
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

const NOTA_MAX = 80;

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

/** Monta os cards de todos os chats monitorados, já ordenados para a grade. */
export async function buildClientes(): Promise<ClienteCard[]> {
  const now = Date.now();
  const [groups, contacts, triage] = await Promise.all([
    listGroups(),
    buildContacts(),
    readTriage(),
  ]);

  const cards = await Promise.all(
    groups.map(async (g: GroupSummary): Promise<ClienteCard> => {
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
        atividadeLabel: ultimaTimestamp
          ? relativeLabel(Math.max(0, now - new Date(ultimaTimestamp).getTime()))
          : null,
        mensagens: g.messageCount,
        nota: primeiraLinha(triage.notes[g.slug]),
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
      };
    }),
  );

  return ordenarCards(cards);
}
