/**
 * Guarda de tratamento: o operador trata o interlocutor por "você/vc", nunca
 * por "tu".
 *
 * Não é preferência de estilo — é medida. Nas 2.405 mensagens de trabalho que
 * ele escreveu antes de existir automação, "tu" aparece ZERO vezes contra 187
 * de "vc/você". Quando a automação passou a escrever por ele, "tu/teu/tua/ti"
 * vazou 930 vezes em 30 chats, e foi a primeira coisa que um interlocutor
 * poderia estranhar: o texto some com a pessoa.
 *
 * O falso positivo é o erro caro aqui (bloquearia envio legítimo), então a
 * checagem casa palavra inteira e ignora qualquer palavra que apenas contenha
 * essas letras — situação, atua, tutorial, tudo, estatuto.
 */

const PRONOMES = ["tu", "teu", "tua", "teus", "tuas", "ti", "contigo", "tigo"] as const;

// \b não basta: precisa de fronteira que respeite acento, senão "atua" casa.
const RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(${PRONOMES.join("|")})(?![\\p{L}\\p{N}])`,
  "giu",
);

/**
 * Devolve os pronomes de segunda pessoa encontrados, na ordem em que
 * aparecem e sem repetir. Lista vazia = tratamento correto.
 */
export function tratamentoErrado(texto: string): string[] {
  const achados: string[] = [];
  for (const m of texto.matchAll(RE)) {
    const palavra = m[1]?.toLowerCase();
    if (palavra && !achados.includes(palavra)) achados.push(palavra);
  }
  return achados;
}

/** Frase pronta para explicar a recusa a quem tentou enviar. */
export function avisoDeTratamento(achados: string[]): string {
  return (
    `tratamento errado: ${achados.map((a) => `"${a}"`).join(", ")}. ` +
    `O operador trata por "você"/"vc" — "tu" aparece ZERO vezes nas 2.405 mensagens ` +
    `de trabalho dele. Reescreva com você/vc/seu/sua e envie de novo.`
  );
}
