/**
 * Quem fala é o operador. O agente escreve na voz dele e nunca se apresenta
 * como IA, bot ou assistente, nem fala dele na terceira pessoa. E quando a
 * conversa vira assunto de identidade, ou o operador assume na mão, o modo
 * autônomo sai de cena: esses momentos são dele.
 */
import type { Contacts } from "../contacts";
import { nameOf, roleOf, numberFromJid } from "../contacts";
import type { MessageView } from "../data";

/** Fronteira de palavra que entende acento (o `\b` do JS só conhece ASCII). */
const I = "(?<![\\p{L}\\d])";
const F = "(?![\\p{L}\\d])";
const ART = "(?:(?:a|uma|o|um|sua|seu|minha|meu)\\s+)?";
const IA = "(?:ia|i\\.a\\.?|intelig[êe]ncia artificial|bot|chatbot|rob[ôo]|assistente(?: virtual)?|gpt|chatgpt)";

const REVELA: RegExp[] = [
  // "sou uma IA", "aqui é o assistente", "quem tá respondendo é a IA"
  new RegExp(`${I}(?:sou|aqui [ée]|quem (?:t[áa]|est[áa]) (?:falando|respondendo)(?: aqui)? [ée])\\s+${ART}${IA}${F}`, "iu"),
  // "deixei a IA respondendo", "coloquei um bot pra responder"
  new RegExp(
    `${I}(?:deixei|coloquei|botei|liguei|ativei|t[ôo] usando|estou usando|usei)\\s+${ART}(?:${IA}|automa[çc][ãa]o)\\s+(?:respondendo|pra responder|para responder|no (?:meu )?lugar|falando|atendendo)${F}`,
    "iu",
  ),
  // "a IA tá respondendo", "o bot que fica atendendo"
  new RegExp(`${I}${ART}${IA}\\s+(?:que\\s+)?(?:t[áa]|est[áa]|fica|ficou|vai)\\s+(?:respondendo|falando|atendendo)${F}`, "iu"),
  new RegExp(`${I}(?:resposta|mensagem|atendimento) autom[áa]tic[oa]${F}`, "iu"),
  // "meu chefe pediu", "minha gestora aprovou": quem fala é o dono, não tem chefe
  new RegExp(`${I}(?:meu|minha)\\s+(?:chefe|patr[ãa]o|patroa|gestora?|superior)${F}`, "iu"),
  // "o dono vai te responder", "o responsável vai te chamar": o dono falando de si como outro
  new RegExp(
    `${I}(?:o|a)\\s+(?:dono|dona|chefe|patr[ãa]o|patroa|respons[áa]vel)\\s+(?:j[áa]\\s+)?(?:vai|vem|volta|te|j[áa]|responde|chama|liga|fala|v[êe]|pediu|mandou|disse|falou|t[áa]|est[áa]|aprovou|liberou)${F}`,
    "iu",
  ),
];

/** Lembrete do `preparar_resposta`: quem escreve é o operador, sempre em primeira pessoa. */
export const INSTRUCAO_PRIMEIRA_PESSOA =
  "você escreve como o próprio operador, em primeira pessoa: nunca fale dele como outra pessoa ('vou ver com fulano', '<nome dele> vai ver', 'ele te responde', 'o dono', 'meu chefe'); pra ganhar tempo, 'vou ver aqui'";

/** Nome do operador: `WAC_NOME_OPERADOR` inteiro (nome e sobrenomes) ou o primeiro nome do próprio contato. */
export function nomeDoOperador(contatos?: Contacts, env: Record<string, string | undefined> = process.env): string | undefined {
  const fixo = env.WAC_NOME_OPERADOR?.trim();
  if (fixo) return fixo.replace(/\s+/g, " ");
  if (!contatos) return undefined;
  for (const id of contatos.ownIds) {
    const n = nameOf(contatos, id).trim();
    if (n && !/^\+?\d[\d\s-]*$/.test(n)) return n.split(/\s+/)[0];
  }
  return undefined;
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "van", "von", "der"]);
/** Artigo logo antes do nome: caso da regra "o <nome>", que já trata a apresentação. */
const ANTES_ARTIGO = new RegExp(`${I}(?:o|do|pro|pelo|no|ao)\\s+$`, "iu");
/** Apresentação sem artigo: "sou <nome>", "aqui é <nome>". */
const ANTES_APRESENTACAO = new RegExp(`${I}(?:[ée]|sou|eu sou|aqui [ée]|quem fala [ée])\\s+$`, "iu");
/** Cumprimento ou agradecimento logo antes: o nome é chamamento ("fala <nome>"). */
const ANTES_CHAMAMENTO = new RegExp(
  `${I}(?:oi+|ol[áa]+|fala+|opa+|e a[íi]|eae|eai|bom dia|boa tarde|boa noite|valeu|vlw|obrigad[oa]|brigad[oa]|tmj|salve|ei|hey|beleza|blz|tudo (?:bem|certo|bom|joia))[\\s,!.]*$`,
  "iu",
);

/**
 * O nome sem artigo também é terceira pessoa ("<nome> vai ver", "falo com
 * <nome>"). Passa o chamamento ("fala <nome>", "<nome>, tudo certo?", "beleza,
 * <nome>"), a apresentação ("sou <nome>", "<nome> aqui") e, no sobrenome, o
 * nome completo de outra pessoa ("a Maria <sobrenome>").
 */
function mencoesSemArtigo(texto: string, nome: string, sobrenome: boolean): string[] {
  const trechos: string[] = [];
  const re = new RegExp(`${I}${escapar(nome)}${F}`, "giu");
  for (const linha of texto.split("\n")) {
    for (const m of linha.matchAll(re)) {
      const antes = linha.slice(0, m.index);
      const depois = linha.slice((m.index ?? 0) + m[0].length);
      if (ANTES_ARTIGO.test(antes) || ANTES_APRESENTACAO.test(antes) || ANTES_CHAMAMENTO.test(antes)) continue;
      if (/^\s+aqui(?![\p{L}\d])/iu.test(depois)) continue;
      if (antes.trim() === "" && (depois.trim() === "" || /^\s*[,!?.:;]/.test(depois))) continue;
      if (/,\s*$/.test(antes) && (depois.trim() === "" || /^\s*[!?.]/.test(depois))) continue;
      if (sobrenome && /\p{Lu}\p{L}*\s+$/u.test(antes)) continue;
      const seguinte = depois.match(/^\s+([\p{L}\d]+)/u)?.[1];
      trechos.push(seguinte ? `${m[0]} ${seguinte}` : m[0]);
    }
  }
  return trechos;
}

/**
 * Trechos do rascunho que revelam a automação: o agente dizendo que é IA ou
 * falando do operador na terceira pessoa ("o <nome> já liberou", "<nome> vai
 * ver"), pelo primeiro nome ou pelo sobrenome. Apresentar-se ("é o <nome>",
 * "sou o <nome>") é primeira pessoa e passa.
 */
export function revelaAutomacao(texto: string, nomeOperador?: string): string[] {
  const trechos: string[] = [];
  for (const re of REVELA) {
    const m = texto.match(re);
    if (m) trechos.push(m[0]);
  }
  if (nomeOperador) {
    const [primeiro, ...resto] = nomeOperador.trim().split(/\s+/);
    const partes: Array<[string, boolean]> = [
      [primeiro, false],
      ...resto.filter((p) => p.length >= 3 && !PARTICULAS.has(p.toLowerCase())).map((p): [string, boolean] => [p, true]),
    ];
    for (const [nome, sobrenome] of partes) {
      const re = new RegExp(`${I}(?<!${I}(?:[ée]|sou|aqui [ée]|quem fala [ée])\\s)(?:o|do|pro|pelo|no|ao|com o)\\s+${escapar(nome)}${F}`, "iu");
      const m = texto.match(re);
      if (m) trechos.push(m[0]);
      trechos.push(...mencoesSemArtigo(texto, nome, sobrenome));
    }
  }
  return trechos;
}

const PEDE_AVAL = new RegExp(
  `${I}(?:confirmar|ver|checar|conferir|alinhar|perguntar|consultar|validar)\\s+(?:isso\\s+|aqui\\s+)?(?:com|pro|pra|para|ao|à)\\s+(?:o |a |os |as |meu |minha |nosso |nossa )?(\\p{L}+)`,
  "giu",
);
const QUEM_DECIDE = /^(?:chefe|dono|respons[áa]vel|patr[ãa]o|gestor|s[óo]cio|time|equipe|pessoal|dev|financeiro|suporte|diretoria)$/iu;

/**
 * O agente adiando a decisão para outra pessoa ("vou confirmar com o Fulano",
 * "vou ver com o responsável"). Quem fala é o dono: ele decide, não pede aval.
 * Alvo com inicial maiúscula (nome próprio) ou papel de chefia/equipe.
 */
export function pedeAval(texto: string): string[] {
  const trechos: string[] = [];
  for (const m of texto.matchAll(PEDE_AVAL)) {
    const alvo = m[1] ?? "";
    if (QUEM_DECIDE.test(alvo) || /^\p{Lu}/u.test(alvo)) trechos.push(m[0]);
  }
  return trechos;
}

const PERGUNTA_IA = new RegExp(`${I}(?:ia|i\\.a\\.?|intelig[êe]ncia artificial|bot|rob[ôo]|chat ?gpt|gpt|autom[áa]tic[oa]|automatizad[oa])${F}`, "iu");
const SOBRE_A_CONVERSA =
  /(comigo|com (?:vc|voc[êe])|me respondendo|(?:vc|voc[êe]) [ée]|[ée] (?:vc|voc[êe])|[ée] humano|[ée] gente|[ée] (?:uma )?pessoa|de verdade|(?:isso|aqui|esse n[úu]mero|essa (?:conversa|resposta|mensagem)) [ée]|^\s*[ée] (?:um |uma )?(?:bot|ia|rob)|(?:t[áa]|est[áa]|[ée]) (?:falando|respondendo|conversando|escrevendo))/iu;

/** A mensagem do contato pergunta (ou insinua) se quem responde é IA. */
export function perguntaSeEhIa(texto: string): boolean {
  return PERGUNTA_IA.test(texto) && SOBRE_A_CONVERSA.test(texto);
}

/** Depois que o operador responde na mão, a conversa é dele por este tempo. */
export const JANELA_OPERADOR_MS = 15 * 60 * 1000;
/** Pergunta "é IA?" sem resposta do operador trava o autônomo por até este tempo. */
export const JANELA_PERGUNTA_IA_MS = 24 * 60 * 60 * 1000;

/** Mensagem que o operador (ou alguém da equipe pelo painel) mandou na mão. */
export function ehManual(m: MessageView): boolean {
  return m.fromMe === true && (m.origem === "celular" || m.origem === "web" || m.ator === "painel");
}

export interface Trava {
  regra: "operador_assumiu" | "perguntou_ia";
  motivo: string;
}

/**
 * Motivo para o modo autônomo NÃO enviar agora, ou null. Vale para qualquer
 * tipo de mensagem (áudio do operador conta como resposta na mão).
 */
export function travaAutonoma(msgs: MessageView[], contatos: Contacts, agora: Date): Trava | null {
  const ordem = [...msgs].filter((m) => !m.deleted).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  const t = (m: MessageView) => new Date(m.timestamp).getTime();
  const ultimaManual = [...ordem].reverse().find(ehManual);
  if (ultimaManual && agora.getTime() - t(ultimaManual) < JANELA_OPERADOR_MS) {
    const min = Math.max(1, Math.round((agora.getTime() - t(ultimaManual)) / 60000));
    return {
      regra: "operador_assumiu",
      motivo: `o operador respondeu na mão há ${min} min: a conversa é dele agora. Não envie; se achar que falta algo, avise o operador`,
    };
  }
  const desde = ultimaManual ? t(ultimaManual) : -Infinity;
  const pergunta = [...ordem]
    .reverse()
    .find(
      (m) =>
        !m.fromMe &&
        t(m) > desde &&
        agora.getTime() - t(m) < JANELA_PERGUNTA_IA_MS &&
        roleOf(contatos, numberFromJid(m.sender)) !== "me" &&
        perguntaSeEhIa(m.text ?? ""),
    );
  if (pergunta) {
    return {
      regra: "perguntou_ia",
      motivo: `o contato perguntou se é IA ("${pergunta.text.trim().slice(0, 80)}"). Não responda isso nem nada mais: chame o operador e espere ele responder na mão`,
    };
  }
  return null;
}

/**
 * A trava que impede o envio agora, ou null. Só vale no autônomo (no confirmar o
 * operador vê o texto antes). Quando o próprio operador pede o envio, o
 * `operador_assumiu` sai do caminho; o `perguntou_ia` nunca.
 */
export function travaQueBloqueia(
  modo: "confirmar" | "autonomo",
  trava: Trava | null,
  operadorPediu: boolean,
): Trava | null {
  if (modo !== "autonomo" || !trava) return null;
  if (operadorPediu && trava.regra === "operador_assumiu") return null;
  return trava;
}
