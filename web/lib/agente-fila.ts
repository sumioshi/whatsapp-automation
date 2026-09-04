import type { AgenteExecutor, AgenteModo } from './triage';

/** Sem checkpoint, a primeira passada olha só as últimas 24h — não o histórico todo. */
export const JANELA_INICIAL_MS = 24 * 60 * 60_000;

export interface FilaEntrada {
  slug: string;
  cliente: string;
  github?: string;
  brainDir?: string;
  agente: AgenteModo;
  executor: AgenteExecutor;
  /** Checkpoint da triagem (ISO) ou null na primeira vez. */
  seen: string | null;
  mensagens: Array<{ timestamp: string; fromMe: boolean }>;
}

export interface ItemFila {
  slug: string;
  cliente: string;
  github: string;
  brainDir: string;
  agente: 'issue' | 'pr';
  executor: AgenteExecutor;
  novas: number;
  desde: string;
  ate: string;
}

/**
 * Decide quais chats o workflow processa nesta passada: agente ligado, repo
 * conhecido e pelo menos uma mensagem de terceiro depois do checkpoint.
 * Puro — o chamador injeta o relógio.
 */
export function selecionarFila(entradas: FilaEntrada[], agoraMs: number, teto = 10): ItemFila[] {
  const itens: ItemFila[] = [];
  for (const e of entradas) {
    if (e.agente === 'off' || !e.github) continue;
    const desde = e.seen ?? new Date(agoraMs - JANELA_INICIAL_MS).toISOString();
    let novas = 0;
    let ate = desde;
    for (const m of e.mensagens) {
      if (m.fromMe || m.timestamp <= desde) continue;
      novas++;
      if (m.timestamp > ate) ate = m.timestamp;
    }
    if (novas === 0) continue;
    itens.push({
      slug: e.slug,
      cliente: e.cliente,
      github: e.github,
      brainDir: e.brainDir ?? '',
      agente: e.agente,
      executor: e.executor,
      novas,
      desde,
      ate,
    });
  }
  itens.sort((a, b) => b.novas - a.novas || a.slug.localeCompare(b.slug));
  return itens.slice(0, teto);
}
