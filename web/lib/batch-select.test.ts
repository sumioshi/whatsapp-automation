import { describe, expect, it } from 'vitest';
import { BATCH_LIMIT, selectBatch } from './batch-select';

describe('selectBatch', () => {
  it('pula os que NÃO estão locais (só na nuvem) — a causa do travamento', () => {
    const paths = ['a.ogg', 'b.ogg', 'c.ogg'];
    const locais = new Set(['a.ogg', 'c.ogg']); // b está só na nuvem
    const plan = selectBatch(paths, locais);
    expect(plan.processar).toEqual(['a.ogg', 'c.ogg']);
    expect(plan.puladosNuvem).toBe(1);
  });

  it('respeita o teto (não processa dezenas de uma vez)', () => {
    const paths = Array.from({ length: 30 }, (_, i) => `m${i}.ogg`);
    const locais = new Set(paths); // todos locais
    const plan = selectBatch(paths, locais, 10);
    expect(plan.processar).toHaveLength(10);
    expect(plan.restantesLocais).toBe(20);
    expect(plan.puladosNuvem).toBe(0);
  });

  it('o cenário real que travou: 34 pendentes, 16 na nuvem, 18 locais', () => {
    const locaisArr = Array.from({ length: 18 }, (_, i) => `local${i}.ogg`);
    const nuvemArr = Array.from({ length: 16 }, (_, i) => `nuvem${i}.ogg`);
    const plan = selectBatch([...locaisArr, ...nuvemArr], new Set(locaisArr), 10);
    expect(plan.processar).toHaveLength(10); // teto, não 34
    expect(plan.puladosNuvem).toBe(16); // não trava baixando esses
    expect(plan.restantesLocais).toBe(8); // 18 locais - 10 do teto
  });

  it('default usa BATCH_LIMIT', () => {
    const paths = Array.from({ length: BATCH_LIMIT + 5 }, (_, i) => `m${i}.ogg`);
    const plan = selectBatch(paths, new Set(paths));
    expect(plan.processar).toHaveLength(BATCH_LIMIT);
  });

  it('lista vazia → nada a fazer', () => {
    const plan = selectBatch([], new Set());
    expect(plan.processar).toEqual([]);
    expect(plan.puladosNuvem).toBe(0);
    expect(plan.restantesLocais).toBe(0);
  });

  it('mantém a ordem dos paths', () => {
    const paths = ['z.ogg', 'a.ogg', 'm.ogg'];
    const plan = selectBatch(paths, new Set(paths), 10);
    expect(plan.processar).toEqual(['z.ogg', 'a.ogg', 'm.ogg']);
  });
});
