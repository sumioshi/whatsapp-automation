/**
 * Entre dois ou três candidatos, escolhe o que menos destoa. Selecionar em
 * código funciona melhor do que proibir no prompt: nomear a forma proibida
 * ao modelo aumenta a chance de ela sair.
 */
import type { EntradaRevisao, Revisao } from "./revisar";
import { revisar } from "./revisar";

export function escolherCandidato(candidatos: string[][], e: Omit<EntradaRevisao, "baloes">): { indice: number; revisao: Revisao | null; todas: Revisao[] } {
  const todas = candidatos.map((baloes) => revisar({ ...e, baloes }));
  let indice = -1;
  for (let i = 0; i < todas.length; i++) {
    const r = todas[i];
    if (!r?.ok) continue;
    const atual = indice >= 0 ? todas[indice] : undefined;
    if (!atual || r.score < atual.score || (r.score === atual.score && r.hits.length < atual.hits.length)) indice = i;
  }
  return { indice, revisao: indice >= 0 ? (todas[indice] ?? null) : null, todas };
}
