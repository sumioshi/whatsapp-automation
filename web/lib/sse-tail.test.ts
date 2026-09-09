import { describe, expect, it } from 'vitest';
import { formatCursor, parseCursor, splitJsonlBuffer, tailJsonl } from './sse-tail';

const buf = (s: string) => Buffer.from(s, 'utf8');

describe('splitJsonlBuffer', () => {
  it('extrai linhas completas e devolve carry vazio', () => {
    const { lines, carry } = splitJsonlBuffer(Buffer.alloc(0), buf('{"a":1}\n{"b":2}\n'));
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(carry.length).toBe(0);
  });

  it('segura linha parcial no carry até o \\n chegar', () => {
    const r1 = splitJsonlBuffer(Buffer.alloc(0), buf('{"a":1}\n{"b":'));
    expect(r1.lines).toEqual(['{"a":1}']);
    const r2 = splitJsonlBuffer(r1.carry, buf('2}\n'));
    expect(r2.lines).toEqual(['{"b":2}']);
    expect(r2.carry.length).toBe(0);
  });

  it('não corrompe UTF-8 multibyte cortado entre chunks', () => {
    const full = buf('{"t":"você"}\n');
    const cut = 9; // corta no meio do "ê" (2 bytes)
    const r1 = splitJsonlBuffer(Buffer.alloc(0), full.subarray(0, cut));
    expect(r1.lines).toEqual([]);
    const r2 = splitJsonlBuffer(r1.carry, full.subarray(cut));
    expect(r2.lines).toEqual(['{"t":"você"}']);
  });

  it('ignora linhas vazias', () => {
    const { lines } = splitJsonlBuffer(Buffer.alloc(0), buf('\n\n{"a":1}\n\n'));
    expect(lines).toEqual(['{"a":1}']);
  });

  it('chunk vazio não emite nada e preserva carry', () => {
    const r = splitJsonlBuffer(buf('{"parc'), Buffer.alloc(0));
    expect(r.lines).toEqual([]);
    expect(r.carry.toString()).toBe('{"parc');
  });
});


describe('tailJsonl', () => {
  it('devolve o offset absoluto do fim de cada linha', () => {
    const r = tailJsonl(Buffer.alloc(0), buf('{"a":1}\n{"b":2}\n'), 100);
    expect(r.lines).toEqual([
      { line: '{"a":1}', end: 108 },
      { line: '{"b":2}', end: 116 },
    ]);
    expect(r.consumed).toBe(16);
  });

  it('linha parcial fica no carry e o offset da próxima considera o carry', () => {
    const r1 = tailJsonl(Buffer.alloc(0), buf('{"a":1}\n{"b":'), 0);
    expect(r1.lines.map((l) => l.end)).toEqual([8]);
    expect(r1.consumed).toBe(8);
    const r2 = tailJsonl(r1.carry, buf('2}\n'), 8);
    expect(r2.lines).toEqual([{ line: '{"b":2}', end: 16 }]);
  });

  it('multibyte cortado entre chunks conta bytes, não caracteres', () => {
    const full = buf('{"t":"você"}\n');
    const r1 = tailJsonl(Buffer.alloc(0), full.subarray(0, 9), 0);
    const r2 = tailJsonl(r1.carry, full.subarray(9), 0);
    expect(r2.lines).toEqual([{ line: '{"t":"você"}', end: full.length }]);
  });
});

describe('cursor', () => {
  it('ida e volta', () => {
    const m = new Map([
      ['a', 12],
      ['dm-55', 30],
    ]);
    expect(formatCursor(m)).toBe('a=12;dm-55=30');
    expect(parseCursor('a=12;dm-55=30')).toEqual(m);
  });

  it('ignora pedaços inválidos e valores negativos/não numéricos', () => {
    expect(parseCursor('a=12;lixo;b=-1;c=x;=5')).toEqual(new Map([['a', 12]]));
  });

  it('vazio/nulo vira mapa vazio', () => {
    expect(parseCursor(null).size).toBe(0);
    expect(parseCursor('').size).toBe(0);
  });
});
