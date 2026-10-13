/**
 * Busca das listas do painel (grupos, pessoas, conversas, contatos): sem acento e sem
 * caixa, por trecho em qualquer lugar do texto. Puro, para a tela importar direto.
 */

export function normalizarBusca(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Consulta vazia casa com tudo; com vários textos, basta um conter o trecho. */
export function casaBusca(textos: string | string[], consulta: string): boolean {
  const q = normalizarBusca(consulta.trim());
  if (!q) return true;
  const lista = Array.isArray(textos) ? textos : [textos];
  return lista.some((t) => normalizarBusca(t).includes(q));
}
