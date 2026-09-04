/**
 * O operador trata todo interlocutor por "você". Pronomes de segunda pessoa do
 * singular denunciam texto que não é dele; nada que o coletor envie em nome dele
 * pode carregar isso. Espelha a regra do painel (`web/lib/voz-guard.ts`) porque
 * o coletor não importa código do painel.
 */
const TRATAMENTO_RE = /\b(tu|teu|teus|tua|tuas|ti|contigo)\b/gi;

/** Palavras de tratamento errado encontradas, na ordem; vazio quando o texto está ok. */
export function tratamentoErrado(texto: string): string[] {
  return [...texto.matchAll(TRATAMENTO_RE)].map((m) => m[1] ?? m[0]);
}
