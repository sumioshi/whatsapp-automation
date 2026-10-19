/**
 * Tells de texto gerado por IA detectáveis sem contexto, em pt-BR de chat.
 * Cada tell vem com uma sugestão POSITIVA (o que fazer no lugar): nomear a
 * forma proibida ao modelo aumenta a chance de ela sair de novo.
 */

export type TellId =
  | "dois_pontos_intro"
  | "travessao"
  | "triade"
  | "nao_so_mas"
  | "nao_e_x_e_y"
  | "ponto_final"
  | "validacao_abertura"
  | "recibo_abertura"
  | "fechamento_reflexo"
  | "vocabulario_ia"
  | "gerundio_profundidade"
  | "markdown"
  | "bullets"
  | "negrito"
  | "emoji_marcador";

export interface Tell {
  id: TellId;
  trecho: string;
  sugestao: string;
}

export const SUGESTAO_TELL: Record<TellId, string> = {
  dois_pontos_intro: "'X: Y' vira 'X, Y', 'X. Y' ou dois balões",
  travessao: "vírgula, ponto ou balão novo no lugar do travessão",
  triade: "dois itens, ou um item por balão",
  nao_so_mas: "afirma direto o segundo termo",
  nao_e_x_e_y: "afirma direto o que é",
  ponto_final: "balão termina sem ponto",
  validacao_abertura: "abre pelo fato ou pela resposta",
  recibo_abertura: "abre pelo que já fez ou pela resposta; quem responde já mostrou que leu",
  fechamento_reflexo: "termina no fato ou numa pergunta concreta",
  vocabulario_ia: "palavra comum equivalente (melhorar, ajustar, deixar, ficar)",
  gerundio_profundidade: "frase nova com verbo direto",
  markdown: "texto puro, sem formatação",
  bullets: "um item por balão",
  negrito: "texto puro, sem asteriscos",
  emoji_marcador: "emoji só como reação, no fim do balão",
};

const ROTULO_TECNICO = /(^|\s)(ex|obs|link|email|e-mail|cnpj|cpf|senha|user|usuário|usuario|login|token|url|id|ref|nota)\s*:/i;
const DOIS_PONTOS_RE = /(?<!\d)(?<!https?)(?<!http):(?!\d|\/\/)\s*(\n|\p{L})/u;
const EMOJI_INICIO_RE = /^\s*\p{Extended_Pictographic}/mu;
// Recibo de leitura abrindo a resposta, repetindo o assunto ou antes do conteúdo.
// O recibo curto sozinho, ou explicando a demora, é uso legítimo do operador.
const RECIBO_ABERTURA_RE =
  /^\s*(?:(?:opa|oi|olá|ola|fala|e a[ií]|bom dia|boa tarde|boa noite)(?![\p{L}])[^\n]{0,30}?[,!.]?\s+)?(?:vi|recebi|li)\s+(?:a |sua |tua |seu |teu |o seu |o teu )?(?:mensagem|msg|áudio|audio|recado|pedido|pergunta|e-?mail)(?![\p{L}])(?:\s+(?:d[oae]s?|sobre)\s[^\n]*|[!.,]?\s*\n\s*\S)/iu;

const TESTES: Record<TellId, (t: string) => RegExpMatchArray | null | boolean> = {
  dois_pontos_intro: (t) => {
    if (!DOIS_PONTOS_RE.test(t)) return null;
    // Rótulo técnico de uma palavra ("ex:", "obs:") é uso legítimo do operador.
    const semRotulos = t.replace(new RegExp(ROTULO_TECNICO.source, "gi"), "$1");
    return DOIS_PONTOS_RE.exec(semRotulos);
  },
  travessao: (t) => t.match(/[—–]|(?<=\p{L})\s-\s(?=\p{L})/u),
  triade: (t) => t.match(/\b\p{L}+(?: \p{L}+)?, \p{L}+(?: \p{L}+)? e \p{L}+(?: \p{L}+)?\b/u),
  nao_so_mas: (t) => t.match(/não (só|apenas|somente)[^.!?\n]{0,60}(mas|como)/i),
  nao_e_x_e_y: (t) => t.match(/não é (sobre |só |apenas )?[^,.!?\n]{2,40}, (é|mas) /i),
  ponto_final: (t) => t.match(/\.\s*$/),
  recibo_abertura: (t) => t.match(RECIBO_ABERTURA_RE),
  validacao_abertura: (t) => t.match(/^\s*(boa pergunta|ótimo ponto|otimo ponto|faz (todo )?sentido|perfeito[,!.]|excelente|com certeza)/i),
  fechamento_reflexo: (t) => t.match(/qualquer (coisa|dúvida|duvida)[^.!?\n]{0,25}(chama|fala|avisa|só|so)|à disposição|a disposição/i),
  vocabulario_ia: (t) =>
    t.match(
      /\b(crucial|fundamental|essencial|aprimorar|otimizar|potencializar|impulsionar|alavancar|vale (ressaltar|destacar)|é importante (ressaltar|destacar)|nesse sentido|dessa forma|além disso|em suma|portanto|no entanto|contudo|ademais|garantir|assegurar|proporcionar|robust[oa]s?|fluid[oa]|jornada|abordagem|cenário|panorama)\b/i,
    ),
  gerundio_profundidade: (t) => t.match(/\b(garantindo|permitindo|proporcionando|possibilitando|assegurando|contribuindo|reforçando)\b/i),
  markdown: (t) => t.match(/\*\*[^*\n]+\*\*|^#{1,6}\s|`[^`\n]+`/m),
  bullets: (t) => t.match(/^\s*([-•*]|\d+[.)])\s/m),
  negrito: (t) => (/\*\*/.test(t) ? null : t.match(/\*[^*\n]+\*/)),
  emoji_marcador: (t) => t.match(EMOJI_INICIO_RE),
};

export function temTell(id: TellId, texto: string): boolean {
  return Boolean(TESTES[id](texto));
}

export function detectarTells(texto: string): Tell[] {
  const out: Tell[] = [];
  for (const id of Object.keys(TESTES) as TellId[]) {
    const r = TESTES[id](texto);
    if (!r) continue;
    const trecho = typeof r === "boolean" ? "" : (r[0] ?? "").trim();
    out.push({ id, trecho, sugestao: SUGESTAO_TELL[id] });
  }
  return out;
}
