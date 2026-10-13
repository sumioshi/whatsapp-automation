/**
 * Qual seção de uma página longa está em leitura, para marcar o item certo na
 * navegação lateral (Configurações). É a última seção cujo topo já cruzou a linha
 * de leitura, um pouco abaixo do topo visível. No fim da rolagem vale a última
 * seção, mesmo que ela seja baixa demais para alcançar a linha.
 */

export interface PosicaoSecao {
  id: string;
  /** Distância do topo do conteúdo rolável até o topo da seção, em px. */
  topo: number;
}

export interface Rolagem {
  /** scrollTop */
  topo: number;
  /** clientHeight */
  altura: number;
  /** scrollHeight */
  total: number;
}

const FOLGA_FIM = 2;

export function secaoAtiva(secoes: PosicaoSecao[], rolagem: Rolagem, linha = 120): string | null {
  if (secoes.length === 0) return null;
  const ordenadas = [...secoes].sort((a, b) => a.topo - b.topo);
  const rola = rolagem.total > rolagem.altura;
  if (rola && rolagem.topo + rolagem.altura >= rolagem.total - FOLGA_FIM) {
    return ordenadas[ordenadas.length - 1].id;
  }
  let ativa = ordenadas[0].id;
  for (const s of ordenadas) {
    if (s.topo > rolagem.topo + linha) break;
    ativa = s.id;
  }
  return ativa;
}
