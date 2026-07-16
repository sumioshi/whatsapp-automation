/**
 * Quebra o texto da IA em 1-3 balões, como um humano digitando pensamentos.
 * Puro (sem I/O) pra ser testável. Regras: curto não quebra; parágrafo é a
 * quebra natural; parágrafo único longo quebra por sentença mirando o
 * tamanho-alvo do perfil; máximo 3 balões (excedente funde no último).
 */
export interface PerfilEnvio {
  tamanhoMedioBalao: number;
  baloesPorRajada: number;
  fracaoRespostaCurta: number;
}

export const PERFIL_DEFAULT: PerfilEnvio = {
  tamanhoMedioBalao: 120,
  baloesPorRajada: 2,
  fracaoRespostaCurta: 0.3,
};

const CURTO = 80;
const MAX_BALOES = 3;

export function quebrarEmBaloes(texto: string, perfil: PerfilEnvio = PERFIL_DEFAULT): string[] {
  const t = texto.trim();
  if (!t) return [];
  if (t.length <= CURTO) return [t];

  const paragrafos = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const partes = paragrafos.length > 1 ? paragrafos : quebrarPorSentenca(t, perfil.tamanhoMedioBalao);

  if (partes.length <= MAX_BALOES) return partes;
  return [...partes.slice(0, MAX_BALOES - 1), partes.slice(MAX_BALOES - 1).join(' ')];
}

/** Junta sentenças até chegar perto do alvo; nunca corta no meio de uma sentença.
 * Fim de sentença = pontuação seguida de ESPAÇO (ou fim do texto) — ponto colado
 * em outro caractere (versão 2.1.0, decimal 3.75, URL) não é fronteira. */
function quebrarPorSentenca(texto: string, alvo: number): string[] {
  if (texto.length <= alvo * 1.5) return [texto];
  const sentencas = texto.split(/(?<=[.!?])\s+/);
  const baloes: string[] = [];
  let atual = '';
  for (const s of sentencas) {
    if (atual && `${atual} ${s}`.length > alvo * 1.4) {
      baloes.push(atual);
      atual = s;
    } else {
      atual = atual ? `${atual} ${s}` : s;
    }
  }
  if (atual) baloes.push(atual);
  return baloes.flatMap((b) => (b.length > alvo * 2 ? quebrarPorPalavra(b, alvo) : [b]));
}

/** Último recurso pra texto sem pontuação: quebra por palavra perto do alvo. */
function quebrarPorPalavra(texto: string, alvo: number): string[] {
  const palavras = texto.split(' ');
  const out: string[] = [];
  let atual = '';
  for (const p of palavras) {
    if (atual && `${atual} ${p}`.length > alvo * 1.3) {
      out.push(atual);
      atual = p;
    } else {
      atual = atual ? `${atual} ${p}` : p;
    }
  }
  if (atual) out.push(atual);
  return out;
}
