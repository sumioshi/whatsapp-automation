import { describe, expect, it } from 'vitest';
import {
  colunasParaTela,
  filtrarWatchValido,
  hashTela,
  larguraVisual,
  intervaloRelay,
  LIMPAR_TELA_XTERM,
  mapearTeclasParaCli,
  montarFrameXterm,
} from './orca-terminal';

describe('hashTela', () => {
  it('é estável para a mesma tela', () => {
    const a = hashTela({ tail: ['x', 'y'], status: 'running' });
    const b = hashTela({ tail: ['x', 'y'], status: 'running' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('muda quando uma linha ou o status muda', () => {
    const base = hashTela({ tail: ['x', 'y'], status: 'running' });
    expect(hashTela({ tail: ['x', 'z'], status: 'running' })).not.toBe(base);
    expect(hashTela({ tail: ['x', 'y'], status: 'exited' })).not.toBe(base);
  });

  it('não confunde quebra de linha com conteúdo', () => {
    expect(hashTela({ tail: ['a\nb'] })).not.toBe(hashTela({ tail: ['a', 'b'] }));
  });
});

describe('montarFrameXterm', () => {
  it('limpa a tela e o scrollback antes de repintar, unindo por CRLF', () => {
    const frame = montarFrameXterm(['linha 1', 'linha 2']);
    expect(frame.startsWith(LIMPAR_TELA_XTERM)).toBe(true);
    expect(frame.slice(LIMPAR_TELA_XTERM.length)).toBe('linha 1\r\nlinha 2');
  });

  it('tela vazia vira só a limpeza', () => {
    expect(montarFrameXterm([])).toBe(LIMPAR_TELA_XTERM);
  });

  it('não deixa quebra de linha embutida desalinhar as linhas', () => {
    const frame = montarFrameXterm(['a\nb']);
    expect(frame).not.toContain('\n');
  });
});

describe('larguraVisual / colunasParaTela', () => {
  it('conta emoji e CJK como duas células e ignora seletores de variação', () => {
    expect(larguraVisual('abc')).toBe(3);
    expect(larguraVisual('🖥️')).toBe(2);
    expect(larguraVisual('日本')).toBe(4);
  });

  it('usa a maior linha quando ela passa das colunas disponíveis', () => {
    expect(colunasParaTela(['curta', 'x'.repeat(120)], 80)).toBe(120);
    expect(colunasParaTela(['curta'], 80)).toBe(80);
    expect(colunasParaTela([], 0)).toBe(1);
  });
});

describe('mapearTeclasParaCli', () => {
  it('texto comum vai cru num único --text, sem --enter', () => {
    expect(mapearTeclasParaCli('abc')).toEqual([{ tipo: 'texto', args: ['--text', 'abc'] }]);
  });

  it('Enter e sequências de escape vão crus', () => {
    expect(mapearTeclasParaCli('\r')).toEqual([{ tipo: 'texto', args: ['--text', '\r'] }]);
    expect(mapearTeclasParaCli('\x1b[A')).toEqual([{ tipo: 'texto', args: ['--text', '\x1b[A'] }]);
  });

  it('Ctrl+C vira --interrupt, preservando a ordem com o texto ao redor', () => {
    expect(mapearTeclasParaCli('ab\x03cd')).toEqual([
      { tipo: 'texto', args: ['--text', 'ab'] },
      { tipo: 'interrupt', args: ['--interrupt'] },
      { tipo: 'texto', args: ['--text', 'cd'] },
    ]);
    expect(mapearTeclasParaCli('\x03')).toEqual([{ tipo: 'interrupt', args: ['--interrupt'] }]);
  });

  it('texto que começa com -- não vira flag da CLI', () => {
    expect(mapearTeclasParaCli('--json')).toEqual([
      { tipo: 'texto', args: ['--text', '-'] },
      { tipo: 'texto', args: ['--text', '-json'] },
    ]);
    expect(mapearTeclasParaCli('-x')).toEqual([{ tipo: 'texto', args: ['--text', '-x'] }]);
  });

  it('lote vazio não gera chamada', () => {
    expect(mapearTeclasParaCli('')).toEqual([]);
  });
});

describe('filtrarWatchValido', () => {
  it('mantém só os handles com prazo no futuro', () => {
    const agora = 1_000_000;
    expect(
      filtrarWatchValido({ a: agora + 10, b: agora - 1, c: agora, '': agora + 50 }, agora),
    ).toEqual(['a']);
  });

  it('tolera registro ausente ou corrompido', () => {
    expect(filtrarWatchValido(null, 1)).toEqual([]);
    expect(filtrarWatchValido({ a: 'x' as unknown as number }, 1)).toEqual([]);
  });
});

describe('intervaloRelay', () => {
  it('encurta enquanto há terminal assistido e volta ao normal depois', () => {
    expect(intervaloRelay(1, 4500)).toBe(1500);
    expect(intervaloRelay(0, 4500)).toBe(4500);
    expect(intervaloRelay(2, 1000)).toBe(1000);
  });
});
