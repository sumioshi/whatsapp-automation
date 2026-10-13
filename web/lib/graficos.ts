/**
 * Contas dos gráficos do Painel (SVG próprio, sem biblioteca): escala do eixo,
 * rótulos de data, fatias da rosca e níveis do mapa de calor. Puras.
 */

/** Escala de contagens: passo redondo (1, 2 ou 5 × 10ⁿ, nunca fração) e topo múltiplo dele. */
export function escalaDoEixo(maximo: number): { passo: number; topo: number } {
  if (!(maximo > 0)) return { passo: 1, topo: 4 };
  const bruto = maximo / 5;
  const grandeza = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / grandeza;
  const passo = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * grandeza);
  return { passo, topo: Math.ceil(maximo / passo) * passo };
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** `2026-09-08` → "8 set" (com o dia da semana: "ter, 8 set"). */
export function rotuloDoDia(dia: string, comSemana = false): string {
  const curto = `${Number(dia.slice(8, 10))} ${MESES_CURTOS[Number(dia.slice(5, 7)) - 1]}`;
  return comSemana ? `${DIAS_CURTOS[new Date(`${dia}T00:00:00Z`).getUTCDay()]}, ${curto}` : curto;
}

/** Rótulos do eixo das datas, contados para trás a partir de hoje: diário, semanal ou a cada 3 semanas. */
export function rotulosDoEixo(dias: string[]): Array<{ i: number; texto: string }> {
  const passo = dias.length <= 7 ? 1 : dias.length <= 31 ? 7 : 21;
  const out: Array<{ i: number; texto: string }> = [];
  for (let i = dias.length - 1; i >= 0; i -= passo) out.unshift({ i, texto: rotuloDoDia(dias[i] as string) });
  return out;
}

/**
 * Fatias da rosca como traço e deslocamento no contorno do círculo
 * (`stroke-dasharray`/`stroke-dashoffset`). Fatia vazia é null; com uma fatia
 * só, ela fecha o círculo sem folga.
 */
export function arcosDaRosca(valores: number[], raio: number, folga: number): Array<{ traco: number; deslocamento: number } | null> {
  const total = valores.reduce((s, v) => s + Math.max(0, v), 0);
  const contorno = 2 * Math.PI * raio;
  const fatias = valores.filter((v) => v > 0).length;
  let acumulado = 0;
  return valores.map((v) => {
    if (!(v > 0) || total === 0) return null;
    const comprimento = (v / total) * contorno;
    const arco = { traco: fatias > 1 ? comprimento - folga : comprimento, deslocamento: -acumulado };
    acumulado += comprimento;
    return arco;
  });
}

/** Nível de 0 (vazio) a 5 no mapa de calor; qualquer mensagem já aparece. */
export function nivelDoCalor(n: number, maximo: number): number {
  if (!(n > 0) || !(maximo > 0)) return 0;
  return Math.min(5, Math.floor((n / maximo) * 5) + 1);
}
