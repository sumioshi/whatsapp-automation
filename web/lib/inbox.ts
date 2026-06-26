import { type Contacts, buildContacts, numberFromJid, roleOf } from "./contacts";
import { type GroupSummary, type MessageView, listGroups, readGroupMessages } from "./data";
import { readTriage } from "./triage";
import { type SlaBand, buildSlaInfo } from "./sla";

/** Por que um grupo aparece na caixa de entrada. Ordem = prioridade visual. */
export type InboxReason = "client-waiting" | "mentioned";

export interface InboxItem {
  slug: string;
  groupName: string;
  reason: InboxReason;
  /** Prévia curta do que disparou o item (texto ou rótulo de mídia). */
  preview: string;
  /** Quem escreveu a mensagem-gatilho (nome de exibição). */
  who: string;
  /** ISO timestamp da mensagem-gatilho (base do "resolvido"). */
  timestamp: string;
  // ── SLA / urgência ─────────────────────────────────────────────────────────
  /** ISO timestamp da 1ª mensagem do cliente não respondida (base da urgência). */
  waitingSince: string;
  /** Milissegundos de espera calculados server-side (agora − waitingSince). */
  waitingMs: number;
  /** Faixa de urgência: fresh < mild < warm < hot. */
  band: SlaBand;
  /** Rótulo relativo em pt-BR: "há 3h", "há 2 dias". */
  waitingLabel: string;
}

const TYPE_LABEL: Record<string, string> = {
  audio: "áudio",
  image: "imagem",
  video: "vídeo",
  gif: "GIF",
  document: "documento",
  sticker: "figurinha",
};

/** Prévia curta de uma mensagem: texto/transcrição ou rótulo de mídia. */
function previewOf(m: MessageView): string {
  const body = m.text?.trim() || m.transcript?.trim() || "";
  if (body) return body.length > 120 ? `${body.slice(0, 117)}…` : body;
  return m.type !== "text" ? `[${TYPE_LABEL[m.type] ?? m.type}]` : "";
}

/** true se o texto menciona algum dos ids que são "você" (@<ownId>). */
function mentionsMe(text: string, ownIds: Set<string>): boolean {
  for (const match of text.matchAll(/@(\d{6,})/g)) {
    const num = match[1];
    if (num && ownIds.has(num)) return true;
  }
  return false;
}

/**
 * Tipo interno de resultado da avaliação (antes de calcular SLA).
 * waitingSince = timestamp ISO da 1ª mensagem do cliente sem resposta.
 */
interface GroupVerdict {
  reason: InboxReason;
  preview: string;
  who: string;
  /** ISO da mensagem-gatilho (a mais recente sem resposta). */
  timestamp: string;
  /** ISO da 1ª mensagem do cliente ainda não respondida (início da espera). */
  waitingSince: string;
}

/**
 * Decide se um grupo "pede atenção" e por quê, olhando suas mensagens.
 *
 * Heurística (deliberadamente simples e honesta — sem NLP):
 *
 * - **cliente aguardando**: a última mensagem do grupo é de um cliente
 *   (roleOf === "client") e nenhuma mensagem sua (fromMe) veio depois.
 *   waitingSince = timestamp da PRIMEIRA mensagem do cliente nessa sequência
 *   ininterrupta sem resposta (= início real da espera, não só a última msg).
 *
 * - **você foi mencionado**: existe um @você sem resposta sua depois — alguém
 *   te citou e você ainda não escreveu nada após a citação.
 *   waitingSince = timestamp da menção mais recente não respondida.
 *
 * Limitações conhecidas: não entende o teor (um "obrigado!" do cliente conta
 * como "aguardando"); "respondeu" = qualquer fromMe posterior, não só um reply
 * direto; mídia sem transcrição entra como "[áudio]" etc. Comece honesto: é um
 * radar de "tem coisa parada", não um classificador de intenção.
 */
function evaluateGroup(messages: MessageView[], contacts: Contacts): GroupVerdict | null {
  if (messages.length === 0) return null;

  // Índice da última mensagem sua — tudo depois dela está "sem resposta".
  let lastMine = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.fromMe) {
      lastMine = i;
      break;
    }
  }

  const last = messages[messages.length - 1];
  if (!last) return null;
  const lastIsMine = lastMine === messages.length - 1;

  // 1) Cliente aguardando: última mensagem é de cliente e não respondi depois.
  if (!lastIsMine && roleOf(contacts, numberFromJid(last.sender)) === "client") {
    // Encontra a PRIMEIRA mensagem do cliente nessa sequência sem resposta.
    // Caminha de trás para frente a partir de lastMine+1 até encontrar uma
    // mensagem que não seja de cliente (ou chegar ao início).
    let waitingSince = last.timestamp; // fallback = última msg
    for (let i = lastMine + 1; i < messages.length; i++) {
      const m = messages[i];
      if (!m || m.fromMe) break; // deveria ser impossível aqui, mas garante
      // Só conta mensagens de cliente como "início da espera"
      if (roleOf(contacts, numberFromJid(m.sender)) === "client") {
        waitingSince = m.timestamp;
        break; // a mais antiga nessa sequência
      }
    }
    return {
      reason: "client-waiting",
      preview: previewOf(last),
      who: last.senderName,
      timestamp: last.timestamp,
      waitingSince,
    };
  }

  // 2) Você foi mencionado e não respondeu: procura a menção mais recente
  //    que esteja depois da sua última mensagem.
  for (let i = messages.length - 1; i > lastMine; i--) {
    const m = messages[i];
    if (!m || m.fromMe) continue;
    if (m.text && mentionsMe(m.text, contacts.ownIds)) {
      return {
        reason: "mentioned",
        preview: previewOf(m),
        who: m.senderName,
        timestamp: m.timestamp,
        // Para menções, a espera começa na mensagem da menção em si.
        waitingSince: m.timestamp,
      };
    }
  }

  return null;
}

/**
 * Varre todos os grupos monitorados (pulando silenciados) e devolve a lista
 * ordenada por **urgência real**: quem está esperando há mais tempo aparece
 * primeiro (waitingMs decrescente). Itens cujo timestamp já foi marcado
 * "resolvido" no grupo (resolved[slug] >= timestamp) são descartados.
 *
 * Regra de ordenação:
 *   1. Todos os itens (client-waiting e mentioned) são ordenados por
 *      waitingMs decrescente — quem espera há mais tempo aparece no topo.
 *   2. Menções não têm prioridade artificial sobre client-waiting: o que importa
 *      é o tempo de espera, seja qual for o motivo. A exceção seria um empate
 *      exato de ms (raro), onde 'mentioned' sobe por ser mais urgente para o
 *      operador (te citou nominalmente). Na prática, o tempo domina.
 *
 * Isso inverte a ordenação anterior (mais-recente primeiro), que colocava o
 * cliente mais recente no topo e afundava o mais antigo — urgência invertida.
 */
export async function buildInbox(): Promise<InboxItem[]> {
  const now = Date.now(); // calculado uma vez, server-side
  const [groups, contacts, triage] = await Promise.all([
    listGroups(),
    buildContacts(),
    readTriage(),
  ]);

  const candidates = groups.filter((g: GroupSummary) => !triage.muted[g.slug]);

  const items = await Promise.all(
    candidates.map(async (g) => {
      const messages = await readGroupMessages(g.slug);
      const verdict = evaluateGroup(messages, contacts);
      if (!verdict) return null;

      // Resolvido até aqui? (lastResolved >= timestamp do gatilho) → some.
      const resolvedAt = triage.resolved[g.slug];
      if (resolvedAt && resolvedAt >= verdict.timestamp) return null;

      const sla = buildSlaInfo(verdict.waitingSince, now);

      return {
        slug: g.slug,
        groupName: g.name,
        reason: verdict.reason,
        preview: verdict.preview,
        who: verdict.who,
        timestamp: verdict.timestamp,
        waitingSince: sla.waitingSince,
        waitingMs: sla.waitingMs,
        band: sla.band,
        waitingLabel: sla.label,
      } satisfies InboxItem;
    }),
  );

  return items
    .filter((it): it is InboxItem => it !== null)
    // Ordena por urgência: maior tempo de espera primeiro.
    // Empate de ms (raro): 'mentioned' sobe (mais urgente nominalmente).
    .sort((a, b) => {
      const diff = b.waitingMs - a.waitingMs;
      if (diff !== 0) return diff;
      if (a.reason === "mentioned" && b.reason !== "mentioned") return -1;
      if (b.reason === "mentioned" && a.reason !== "mentioned") return 1;
      return 0;
    });
}
