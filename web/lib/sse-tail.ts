/**
 * Núcleo puro do tail incremental de JSONL pro stream SSE (/api/events).
 *
 * Opera em Buffer (não string) porque a leitura é por FAIXA DE BYTES do
 * arquivo: um caractere UTF-8 multibyte pode ser cortado no meio entre duas
 * leituras — decodificar cedo corromperia o texto. Só decoda linha COMPLETA
 * (terminada em \n); o resto fica no carry pra próxima rodada.
 */

export interface LinhaJsonl {
  line: string;
  /** Offset absoluto no arquivo logo após o `\n` desta linha — o cursor de retomada. */
  end: number;
}

/**
 * Divide `carry + chunk` em linhas completas. `base` é o offset, no arquivo, do
 * primeiro byte de `carry`; `consumed` são os bytes que viraram linha completa
 * (o novo base é `base + consumed`).
 */
export function tailJsonl(
  carry: Buffer,
  chunk: Buffer,
  base: number,
): { lines: LinhaJsonl[]; carry: Buffer; consumed: number } {
  const all = carry.length ? Buffer.concat([carry, chunk]) : chunk;
  const lines: LinhaJsonl[] = [];
  let start = 0;
  for (let i = all.indexOf(0x0a); i !== -1; i = all.indexOf(0x0a, start)) {
    const line = all.toString('utf8', start, i).trim();
    if (line) lines.push({ line, end: base + i + 1 });
    start = i + 1;
  }
  return { lines, carry: all.subarray(start), consumed: start };
}

export function splitJsonlBuffer(carry: Buffer, chunk: Buffer): { lines: string[]; carry: Buffer } {
  const r = tailJsonl(carry, chunk, 0);
  return { lines: r.lines.map((l) => l.line), carry: r.carry };
}

/**
 * Cursor de retomada: `slugA=offsetA;slugB=offsetB`. Viaja no `id:` de cada
 * evento e volta no header `Last-Event-ID`. Pedaço inválido é ignorado.
 */
export function parseCursor(s: string | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const parte of (s ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i <= 0) continue;
    const slug = parte.slice(0, i).trim();
    const n = Number(parte.slice(i + 1));
    if (slug && Number.isInteger(n) && n >= 0) out.set(slug, n);
  }
  return out;
}

export function formatCursor(m: Map<string, number>): string {
  return [...m].map(([slug, n]) => `${slug}=${n}`).join(';');
}
