import { describe, expect, it } from 'vitest';
import { splitJsonlBuffer } from './sse-tail';

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
