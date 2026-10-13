import { describe, expect, it } from 'vitest';
import { lerMinutos } from './minutos';

describe('lerMinutos', () => {
  it('aceita inteiro positivo, com ou sem espaço em volta', () => {
    expect(lerMinutos('15')).toEqual({ ok: true, valor: 15 });
    expect(lerMinutos('  30 ')).toEqual({ ok: true, valor: 30 });
  });

  it('arredonda fração como o servidor faz', () => {
    expect(lerMinutos('2.6')).toEqual({ ok: true, valor: 3 });
    expect(lerMinutos('1.4')).toEqual({ ok: true, valor: 1 });
  });

  it('vazio, zero, negativo, menos de 1 e texto são recusados', () => {
    for (const t of ['', '0', '-5', '0.6', 'abc', '2,5']) {
      expect(lerMinutos(t)).toEqual({ ok: false, erro: 'Use um número de minutos maior que zero.' });
    }
  });

  it('com teto, recusa o que passa dele e diz a faixa', () => {
    expect(lerMinutos('10080', { max: 10080 })).toEqual({ ok: true, valor: 10080 });
    expect(lerMinutos('10081', { max: 10080 })).toEqual({ ok: false, erro: 'Use de 1 a 10.080 minutos.' });
    expect(lerMinutos('0', { max: 10080 })).toEqual({ ok: false, erro: 'Use de 1 a 10.080 minutos.' });
  });
});
