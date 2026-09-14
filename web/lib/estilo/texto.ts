/**
 * Utilitários de texto para os guards de envio: tokenização pt-BR, stopwords,
 * um stemmer leve (só o bastante para juntar "ajustei/ajustar/ajustado") e
 * corte de frases que respeita versão e decimal.
 */

export const STOPWORDS = new Set(
  (
    "a o e é de da do em um uma pra pro pras pros para que não nao sim ok tb tbm vc você voce eu ele ela " +
    "isso essa esse isto este aqui aí ai lá la já ja só so mais mas com por se ou os as no na nos nas ao à " +
    "te me tem tá ta foi ser vai vou pode dá da fazer faz fez pelo pela pelos pelas como bem tudo muito " +
    "também tambem até ate sobre então entao aí quando onde qual quais quem porque pq pois assim tipo " +
    "hoje amanhã amanha ontem agora depois antes ainda nada algo aquele aquela aquilo meu minha seu sua " +
    "dele dela deles delas nosso nossa está esta estão estao são sao era eram ter tinha tem havia há ha"
  ).split(/\s+/),
);

const TOKEN_RE = /[\p{L}\p{N}]+/gu;

export function tokenizar(t: string): string[] {
  return (t.toLowerCase().match(TOKEN_RE) ?? []).slice();
}

const SUFIXOS = ["ando", "endo", "indo", "amos", "emos", "imos", "ado", "ido", "ei", "ou", "ar", "er", "ir", "s"];

export function radical(w: string): string {
  const p = w.toLowerCase();
  for (const s of SUFIXOS) {
    if (p.length - s.length >= 3 && p.endsWith(s)) return p.slice(0, -s.length);
  }
  return p;
}

export function primeiraPalavra(t: string): string {
  return tokenizar(t)[0] ?? "";
}

// Fim de frase = pontuação seguida de espaço ou fim; ponto colado (2.1.0, 3.75, URL) não é fronteira.
export function frases(t: string): string[] {
  const out: string[] = [];
  let current = "";
  let i = 0;
  while (i < t.length) {
    current += t[i];
    // Verifica se chegou em ponto, interrogação ou exclamação
    if (t[i] === "." || t[i] === "!" || t[i] === "?") {
      // Se for ponto, verifica se é decimal (número antes e depois)
      if (t[i] === ".") {
        const before = i > 0 && /\d/.test(t[i - 1]);
        const after = i + 1 < t.length && /\d/.test(t[i + 1]);
        if (before && after) {
          // É decimal, não é fim de frase
          i++;
          continue;
        }
      }
      // Verifica se tem espaço ou fim depois
      if (i + 1 >= t.length || t[i + 1] === " ") {
        out.push(current.trim());
        current = "";
      }
    }
    i++;
  }
  if (current.trim()) {
    out.push(current.trim());
  }
  return out.filter(Boolean);
}

const INTERROGATIVO_RE = /^(como|quando|quanto|quanta|quantos|quantas|qual|quais|onde|por ?que|pq|dá pra|da pra|consegue|pode|tem como|será que|sera que)\b/i;

export function ehPergunta(t: string): boolean {
  const s = t.trim();
  if (!s) return false;
  return s.endsWith("?") || INTERROGATIVO_RE.test(s);
}

export function palavrasDeConteudo(t: string): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const w of tokenizar(t)) {
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    const r = radical(w);
    if (!vistos.has(r)) {
      vistos.add(r);
      out.push(r);
    }
  }
  return out;
}
