/**
 * Linguagem de auto-incriminação, drama e hedge em mensagem profissional.
 * Assumir a origem de um erro UMA vez, em voz de fato, repara confiança; o que
 * custa é a confissão repetida, o minimizador e a narrativa de acidente.
 * Grupo A bloqueia; B–D e F somam no score; E é contado por conversa.
 */

export type GrupoCulpa = "A" | "B" | "C" | "D" | "E" | "F";

export interface Culpa {
  grupo: GrupoCulpa;
  trecho: string;
  peso: number;
  sugestao: string;
}

const SUG: Record<GrupoCulpa, string> = {
  A: "diz o estado e a correção: 'X não estava entrando; já entra'",
  B: "voz de sistema: 'X tinha saído da conta; voltou'",
  C: "'o principal' e o número, sem adjetivo",
  D: "afirma o fato conferido",
  E: "uma vez, curta, depois do estado",
  F: "diz o que dá e quando",
};

const PESO: Record<GrupoCulpa, number> = { A: 0, B: 2, C: 2, D: 1, E: 0, F: 1 };

const RE: Record<Exclude<GrupoCulpa, "F">, RegExp> = {
  A: /\b(culpa minha|minha culpa|foi culpa|erro meu|falha minha|fiz besteira|vacilei|vacilo|mancada|pisei na bola|me perdoa|perdão|perdao|foi mal|mil desculpas|desculpa qualquer coisa)\b/giu,
  B: /\b(acabei \p{L}+(?:ando|endo|indo)|sem querer|por descuido|esqueci de|deixei passar|me passou|não vi que|nao vi que|quebrei|derrubei)\b/giu,
  C: /\b(a mais séria|a mais seria|o pior|grave|ia te pegar|ia estourar|bomba|por sorte|ainda bem que|por pouco|quase deu ruim)\b/giu,
  D: /\b(acho que|eu acho|acredito que|talvez|mais ou menos|meio que|apenas|tentei|vou tentar|se fizer sentido|não sei se|nao sei se|pode ser bobagem|desculpa incomodar|rapidinho|só (uma|um) \p{L}+(inha|inho)\b|só queria|(coisinha|probleminha|errinho|ajustezinho|bugzinho|detalhezinho|mudancinha|mudançinha|correçãozinha|correcaozinha))\b/giu,
  E: /\b(desculpa|desculpe|desculpas|sinto muito|lamento)\b/giu,
};

const NAO_DA_RE = /\b(não consigo|nao consigo|não dá|nao da|não tem como|nao tem como)/iu;
// Alternativa = outra hora/caminho na MESMA mensagem. "dá pra"/"consigo" ficam de fora:
// estão dentro do próprio "não dá pra"/"não consigo" e anulariam a regra.
const ALTERNATIVA_RE = /(mas|porém|porem|o que dá|o que da|amanhã|amanha|depois|à tarde|a tarde|à noite|a noite|cedo|semana que vem)/iu;

function casos(re: RegExp, texto: string): string[] {
  return [...texto.matchAll(re)].map((m) => m[0]);
}

export function contarDesculpas(texto: string): number {
  return casos(RE.E, texto).length;
}

export function detectarCulpa(texto: string): Culpa[] {
  const out: Array<Culpa & { pos: number }> = [];
  for (const grupo of ["A", "B", "C", "D", "E"] as const) {
    for (const m of texto.matchAll(RE[grupo])) {
      out.push({ grupo, trecho: m[0], peso: PESO[grupo], sugestao: SUG[grupo], pos: m.index ?? 0 });
    }
  }
  const naoDa = NAO_DA_RE.exec(texto);
  if (naoDa && !ALTERNATIVA_RE.test(texto)) {
    out.push({ grupo: "F", trecho: naoDa[0], peso: PESO.F, sugestao: SUG.F, pos: naoDa.index });
  }
  return out.sort((a, b) => a.pos - b.pos).map(({ pos: _p, ...c }) => c);
}
