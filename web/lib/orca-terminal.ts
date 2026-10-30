/**
 * Parte pura do terminal Orca na web: comparação de telas, montagem do frame
 * para o xterm.js e tradução das teclas digitadas no navegador para chamadas
 * da CLI do Orca (`orca terminal send`). Sem I/O, para ser testável.
 *
 * O que a CLI oferece (medido): `terminal read --screen` devolve a tela
 * renderizada já sem escapes ANSI (não há saída com cor); `--cursor` só existe
 * no modo stream, que empilha fragmentos de TUI e não serve aqui. `terminal
 * send --text` sem `--enter` escreve os bytes crus no PTY (setas, Esc, DEL,
 * Ctrl+C passam), e `--interrupt` é o Ctrl+C "entendido" pelo agente.
 */

export interface TelaTerminal {
  tail: string[];
  status?: string | null;
}

/** Hash FNV-1a (32 bits) da tela: barato e estável para detectar mudança entre leituras. */
export function hashTela(tela: TelaTerminal): string {
  // Separador fora do alfabeto de uma tela de terminal: "a\nb" ≠ ["a", "b"].
  const texto = `${tela.status ?? ''}\u0000${tela.tail.join('\u0001')}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Sequência que leva o cursor ao canto e limpa tela e scrollback antes de repintar. */
export const LIMPAR_TELA_XTERM = '\x1b[H\x1b[2J\x1b[3J';

/**
 * Monta o frame que repinta o xterm com a tela inteira num único `write`,
 * para o navegador trocar o quadro de uma vez, sem piscar. A tela do Orca é
 * sempre "as últimas N linhas renderizadas", então repintar é a estratégia
 * certa: não há histórico incremental para preservar.
 */
export function montarFrameXterm(tail: string[]): string {
  const linhas = tail.map((l) => l.replace(/\r?\n/g, ' '));
  return `${LIMPAR_TELA_XTERM}${linhas.join('\r\n')}`;
}

// Faixas que ocupam duas células no terminal (CJK, emoji, símbolos largos) e
// marcas combinantes/seletores de variação, que não ocupam nenhuma.
const LARGO = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u;
const INVISIVEL = /[̀-ͯ​-‍︀-️]/u;

/** Largura em células de uma linha, como o terminal a renderiza. */
export function larguraVisual(linha: string): number {
  let n = 0;
  for (const ch of linha) {
    if (INVISIVEL.test(ch)) continue;
    n += LARGO.test(ch) ? 2 : 1;
  }
  return n;
}

/**
 * Colunas que o xterm precisa ter para nenhuma linha da tela quebrar: a tela
 * do Orca vem de um terminal largo e quebrá-la na gaveta estreita embaralha a
 * TUI; melhor manter a largura real e rolar na horizontal.
 */
export function colunasParaTela(tail: string[], colunasDisponiveis: number): number {
  const maior = tail.reduce((m, l) => Math.max(m, larguraVisual(l)), 0);
  return Math.max(Math.max(1, colunasDisponiveis), maior);
}

export interface PlanoEnvioTecla {
  tipo: 'texto' | 'interrupt';
  /** Argumentos para `orca terminal send --terminal <handle> ...` (sem o handle). */
  args: string[];
}

const CTRL_C = '\x03';

/**
 * Traduz um lote de teclas vindas do `term.onData` do xterm em chamadas da
 * CLI. Tudo vai cru (`--text` sem `--enter`), inclusive Enter (`\r`) e
 * sequências de escape, porque é exatamente o que um terminal mandaria ao PTY.
 * Ctrl+C vira `--interrupt`, que o Orca entrega do jeito que o agente entende.
 * Um valor começando com `--` seria lido pela CLI como flag, então ele sai em
 * duas escritas (`-` e o resto).
 */
export function mapearTeclasParaCli(data: string): PlanoEnvioTecla[] {
  const planos: PlanoEnvioTecla[] = [];
  if (!data) return planos;

  const empurrarTexto = (texto: string) => {
    if (!texto) return;
    if (texto.startsWith('--')) {
      planos.push({ tipo: 'texto', args: ['--text', '-'] });
      texto = texto.slice(1);
    }
    planos.push({ tipo: 'texto', args: ['--text', texto] });
  };

  let buffer = '';
  for (const ch of data) {
    if (ch === CTRL_C) {
      empurrarTexto(buffer);
      buffer = '';
      planos.push({ tipo: 'interrupt', args: ['--interrupt'] });
      continue;
    }
    buffer += ch;
  }
  empurrarTexto(buffer);
  return planos;
}

/** Registro de terminais assistidos pelo stream: handle → instante (ms) até o qual vale. */
export type WatchTerminais = Record<string, number>;

/** Devolve só os handles cujo prazo ainda não venceu. */
export function filtrarWatchValido(watch: WatchTerminais | null | undefined, agora: number): string[] {
  if (!watch || typeof watch !== 'object') return [];
  return Object.entries(watch)
    .filter(([handle, ate]) => Boolean(handle) && typeof ate === 'number' && ate > agora)
    .map(([handle]) => handle);
}

/** Intervalo do relay: curto enquanto alguém assiste um terminal, normal caso contrário. */
export function intervaloRelay(assistidos: number, normalMs: number, assistidoMs = 1500): number {
  return assistidos > 0 ? Math.min(assistidoMs, normalMs) : normalMs;
}
