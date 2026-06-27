/** Teto padrão de itens num lote de transcrição por chamada. Evita que uma única
 * chamada MCP fique presa baixando/transcrevendo dezenas de mídias (o que travava
 * silenciosamente). Locais são rápidos; os da nuvem baixam em paralelo, mas com
 * teto baixo pra não estourar. */
export const BATCH_LIMIT = 8;

export interface BatchPlan {
  /** mediaPaths a processar nesta chamada: todos os locais + os da nuvem até o
   * teto total. Locais primeiro (são rápidos), depois os da nuvem. */
  processar: string[];
  /** Quantos sobraram além do teto (a IA chama de novo pra continuar). */
  restantes: number;
  /** Dos `processar`, quantos virão da nuvem (baixam sob demanda, em paralelo). */
  daNuvem: number;
}

/**
 * Decide o que um lote de transcrição processa, SEM I/O. Inclui os da nuvem
 * (baixam sob demanda), mas com teto: prioriza locais (rápidos), completa com os
 * da nuvem até `limite` no total. O travamento original vinha de processar TODOS
 * sem teto e em série; aqui o teto + o download paralelo (no transcribeBatch)
 * evitam isso. `locais` é o conjunto já no disco (checado via isMediaLocal).
 */
export function selectBatch(
  mediaPaths: string[],
  locais: ReadonlySet<string>,
  limite: number = BATCH_LIMIT,
): BatchPlan {
  const ordenado = [
    ...mediaPaths.filter((mp) => locais.has(mp)),
    ...mediaPaths.filter((mp) => !locais.has(mp)),
  ];
  const processar = ordenado.slice(0, limite);
  const restantes = ordenado.length - processar.length;
  const daNuvem = processar.filter((mp) => !locais.has(mp)).length;
  return { processar, restantes, daNuvem };
}
