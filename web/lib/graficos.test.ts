import { describe, expect, it } from 'vitest';
import { arcosDaRosca, escalaDoEixo, nivelDoCalor, rotuloDoDia, rotulosDoEixo } from './graficos';

describe('escalaDoEixo', () => {
  it('passo redondo (1, 2 ou 5 vezes potência de 10) e topo múltiplo dele', () => {
    expect(escalaDoEixo(230)).toEqual({ passo: 50, topo: 250 });
    expect(escalaDoEixo(7)).toEqual({ passo: 2, topo: 8 });
    expect(escalaDoEixo(1000)).toEqual({ passo: 200, topo: 1000 });
  });
  it('contagem não tem passo fracionário, e sem dado o eixo ainda tem altura', () => {
    expect(escalaDoEixo(1)).toEqual({ passo: 1, topo: 1 });
    expect(escalaDoEixo(0)).toEqual({ passo: 1, topo: 4 });
  });
});

describe('rotulos de data', () => {
  it('"8 set" a partir do dia', () => {
    expect(rotuloDoDia('2026-09-08')).toBe('8 set');
    expect(rotuloDoDia('2026-10-06', true)).toBe('ter, 6 out');
  });
  it('ancorados no último dia: todo dia em 7, semanal em 30, a cada três semanas em 90', () => {
    const dias = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 8, 7 + i)).toISOString().slice(0, 10));
    expect(rotulosDoEixo(dias(7)).map((r) => r.i)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rotulosDoEixo(dias(30)).map((r) => [r.i, r.texto])).toEqual([
      [1, '8 set'],
      [8, '15 set'],
      [15, '22 set'],
      [22, '29 set'],
      [29, '6 out'],
    ]);
    expect(rotulosDoEixo(dias(90)).map((r) => r.i)).toEqual([5, 26, 47, 68, 89]);
  });
});

describe('arcosDaRosca', () => {
  it('cada fatia vira traço e deslocamento no contorno, com folga entre elas', () => {
    const c = 2 * Math.PI * 60;
    const a = arcosDaRosca([3, 1], 60, 3);
    expect(a[0]?.traco).toBeCloseTo(c * 0.75 - 3);
    expect(a[0]?.deslocamento).toBeCloseTo(0);
    expect(a[1]?.traco).toBeCloseTo(c * 0.25 - 3);
    expect(a[1]?.deslocamento).toBeCloseTo(-c * 0.75);
  });
  it('fatia vazia some e uma fatia só fecha o círculo sem folga', () => {
    const c = 2 * Math.PI * 60;
    const a = arcosDaRosca([0, 5], 60, 3);
    expect(a[0]).toBeNull();
    expect(a[1]?.traco).toBeCloseTo(c);
    expect(arcosDaRosca([0, 0], 60, 3)).toEqual([null, null]);
  });
});

describe('nivelDoCalor', () => {
  it('zero é vazio; o resto vai de 1 a 5 em relação ao maior', () => {
    expect(nivelDoCalor(0, 10)).toBe(0);
    expect(nivelDoCalor(1, 100)).toBe(1);
    expect(nivelDoCalor(30, 100)).toBe(2);
    expect(nivelDoCalor(50, 100)).toBe(3);
    expect(nivelDoCalor(70, 100)).toBe(4);
    expect(nivelDoCalor(100, 100)).toBe(5);
  });
});
