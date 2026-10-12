/**
 * Qual skill de voz o MCP manda o agente carregar antes de escrever no WhatsApp.
 *
 * Sem `WAC_SKILL_VOZ`, é o molde do projeto (`voz-do-operador`), que avisa quando
 * ainda está com placeholders. Com ela, é a versão preenchida desta máquina, pelo
 * nome: o MCP é global, e um agente aberto em outro repositório não enxerga as
 * skills deste projeto, então "procure a versão preenchida" não basta.
 */
export function skillDeVoz(env: Record<string, string | undefined> = process.env): {
  nome: string;
  preenchida: boolean;
} {
  const nome = env.WAC_SKILL_VOZ?.trim();
  return nome ? { nome, preenchida: true } : { nome: "voz-do-operador", preenchida: false };
}
