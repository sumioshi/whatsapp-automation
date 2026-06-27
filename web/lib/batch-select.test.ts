import { describe, expect, it } from 'vitest';
import { BATCH_LIMIT, selectBatch } from './batch-select';

describe('selectBatch', () => {
  it('inclui os da nuvem, mas prioriza locais primeiro', () => {
    const paths = ['nuvem1.ogg', 'local1.ogg', 'nuvem2.ogg', 'local2.ogg'];
    const locais = new Set(['local1.ogg', 'local2.ogg']);
    const plan = selectBatch(paths, locais, 10);
    // locais vêm antes na ordem de processamento
    expect(plan.processar.slice(0, 2)).toEqual(['local1.ogg', 'local2.ogg']);
    expect(plan.processar).toContain('nuvem1.ogg');
    expect(plan.daNuvem).toBe(2);
    expect(plan.restantes).toBe(0);
  });

  it('respeita o teto (não processa dezenas de uma vez) — a proteção contra travar', () => {
    const paths = Array.from({ length: 30 }, (_, i) => `m${i}.ogg`);
    const locais = new Set(paths);
    const plan = selectBatch(paths, locais, 8);
    expect(plan.processar).toHaveLength(8);
    expect(plan.restantes).toBe(22);
  });

  it('o cenário real: rajada de 7 áudios toda na nuvem → processa todos (cabem no teto)', () => {
    const paths = Array.from({ length: 7 }, (_, i) => `nuvem${i}.ogg`);
    const plan = selectBatch(paths, new Set(), 8); // nenhum local
    expect(plan.processar).toHaveLength(7); // a IA chama 1x, recebe os 7
    expect(plan.daNuvem).toBe(7);
    expect(plan.restantes).toBe(0);
  });

  it('rajada na nuvem maior que o teto → corta no teto, reporta restantes', () => {
    const paths = Array.from({ length: 20 }, (_, i) => `nuvem${i}.ogg`);
    const plan = selectBatch(paths, new Set(), 8);
    expect(plan.processar).toHaveLength(8);
    expect(plan.daNuvem).toBe(8);
    expect(plan.restantes).toBe(12);
  });

  it('default usa BATCH_LIMIT', () => {
    const paths = Array.from({ length: BATCH_LIMIT + 5 }, (_, i) => `m${i}.ogg`);
    const plan = selectBatch(paths, new Set(paths));
    expect(plan.processar).toHaveLength(BATCH_LIMIT);
  });

  it('lista vazia → nada a fazer', () => {
    const plan = selectBatch([], new Set());
    expect(plan.processar).toEqual([]);
    expect(plan.restantes).toBe(0);
    expect(plan.daNuvem).toBe(0);
  });
});
