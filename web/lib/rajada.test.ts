import { describe, expect, it } from 'vitest';
import { marcarRajadas } from './rajada';

const t = (s: number) => new Date(2026, 5, 26, 12, 0, s).toISOString();

describe('marcarRajadas', () => {
  it('marca msgs coladas do mesmo remetente como uma rajada', () => {
    const r = marcarRajadas([
      { de: 'Pedro', timestamp: t(0) },
      { de: 'Pedro', timestamp: t(10) },
      { de: 'Pedro', timestamp: t(25) },
    ]);
    expect(r.map((m) => m.rajada)).toEqual([1, 1, 1]);
  });

  it('msg isolada não recebe rajada', () => {
    const r = marcarRajadas([{ de: 'Pedro', timestamp: t(0) }]);
    expect(r[0].rajada).toBeUndefined();
  });

  it('quebra rajada quando muda o remetente', () => {
    const r = marcarRajadas([
      { de: 'Pedro', timestamp: t(0) },
      { de: 'Pedro', timestamp: t(5) },
      { de: 'Ana', timestamp: t(10) },
    ]);
    expect(r[0].rajada).toBe(1);
    expect(r[1].rajada).toBe(1);
    expect(r[2].rajada).toBeUndefined(); // Ana sozinha
  });

  it('quebra rajada quando o gap passa de 90s', () => {
    const r = marcarRajadas([
      { de: 'Pedro', timestamp: t(0) },
      { de: 'Pedro', timestamp: t(30) }, // ainda dentro
      { de: 'Pedro', timestamp: new Date(2026, 5, 26, 12, 3, 0).toISOString() }, // +2.5min: fora
    ]);
    expect(r[0].rajada).toBe(1);
    expect(r[1].rajada).toBe(1);
    expect(r[2].rajada).toBeUndefined();
  });

  it('numera rajadas distintas em sequência', () => {
    const r = marcarRajadas([
      { de: 'Pedro', timestamp: t(0) },
      { de: 'Pedro', timestamp: t(5) },
      { de: 'Ana', timestamp: t(40) },
      { de: 'Ana', timestamp: t(45) },
    ]);
    expect(r.map((m) => m.rajada)).toEqual([1, 1, 2, 2]);
  });
});
