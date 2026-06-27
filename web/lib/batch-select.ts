/** Teto padrão de itens processados num lote de transcrição por chamada. Evita
 * que uma única chamada MCP fique presa transcrevendo dezenas de mídias em série
 * (o que travava silenciosamente, sem retorno nem log). */
export const BATCH_LIMIT = 10;

export interface BatchPlan {
  /** Os mediaPaths que SERÃO processados nesta chamada (locais, até o teto). */
  processar: string[];
  /** Quantos foram pulados por só estarem na nuvem (baixar penduraria até o
   * timeout do cloudFetch — fora do lote de propósito). */
  puladosNuvem: number;
  /** Quantos locais sobraram além do teto (a IA pode chamar de novo pra continuar). */
  restantesLocais: number;
}

/**
 * Decide o que um lote de transcrição processa, SEM I/O. Regras:
 *  - só itens que já estão LOCAIS (os da nuvem são pulados — baixar em série
 *    travaria a chamada);
 *  - no máximo `limite` por chamada (default BATCH_LIMIT);
 *  - reporta o que ficou de fora pra o chamador avisar.
 *
 * `locais` é o conjunto dos mediaPaths que já existem no disco (checado por quem
 * chama, via isMediaLocal). Mantém a ordem de `mediaPaths`.
 */
export function selectBatch(
  mediaPaths: string[],
  locais: ReadonlySet<string>,
  limite: number = BATCH_LIMIT,
): BatchPlan {
  const apenasLocais = mediaPaths.filter((mp) => locais.has(mp));
  const puladosNuvem = mediaPaths.length - apenasLocais.length;
  const processar = apenasLocais.slice(0, limite);
  const restantesLocais = apenasLocais.length - processar.length;
  return { processar, puladosNuvem, restantesLocais };
}
