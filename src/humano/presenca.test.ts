import { describe, expect, it } from 'vitest';
import { Presenca } from './presenca';

function fake() {
  const estados: string[] = [];
  const timers: Array<{ ms: number; fn: () => void }> = [];
  const p = new Presenca(
    {
      sendPresence: async (e) => {
        estados.push(e);
      },
    },
    true,
    () => 0.5,
    (fn, ms) => {
      const item = { ms, fn };
      timers.push(item);
      return {
        cancelar: () => {
          const i = timers.indexOf(item);
          if (i >= 0) timers.splice(i, 1);
        },
      };
    },
  );
  return { p, estados, timers };
}

describe('Presenca', () => {
  it('aoLer/aoEntregar mandam available; aoTerminar agenda unavailable em 20–90 s', () => {
    const { p, estados, timers } = fake();
    p.aoLer();
    p.aoEntregar();
    expect(estados).toEqual(['available', 'available']);
    p.aoTerminar();
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(55_000);
    timers[0]?.fn();
    expect(estados.at(-1)).toBe('unavailable');
  });

  it('nova leitura cancela o unavailable pendente', () => {
    const { p, timers } = fake();
    p.aoTerminar();
    p.aoLer();
    expect(timers).toHaveLength(0);
  });

  it('desligada não manda nada', () => {
    const estados: string[] = [];
    const p = new Presenca(
      {
        sendPresence: async (e) => {
          estados.push(e);
        },
      },
      false,
    );
    p.aoLer();
    p.aoTerminar();
    expect(estados).toEqual([]);
  });
});
