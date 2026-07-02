/**
 * Núcleo puro do tail incremental de JSONL pro stream SSE (/api/events).
 *
 * Opera em Buffer (não string) porque a leitura é por FAIXA DE BYTES do
 * arquivo: um caractere UTF-8 multibyte pode ser cortado no meio entre duas
 * leituras — decodificar cedo corromperia o texto. Só decoda linha COMPLETA
 * (terminada em \n); o resto fica no carry pra próxima rodada.
 */
export function splitJsonlBuffer(
  carry: Buffer,
  chunk: Buffer,
): { lines: string[]; carry: Buffer } {
  const all = carry.length ? Buffer.concat([carry, chunk]) : chunk;
  const lines: string[] = [];
  let start = 0;
  for (let i = all.indexOf(0x0a); i !== -1; i = all.indexOf(0x0a, start)) {
    const line = all.toString('utf8', start, i).trim();
    if (line) lines.push(line);
    start = i + 1;
  }
  return { lines, carry: all.subarray(start) };
}
