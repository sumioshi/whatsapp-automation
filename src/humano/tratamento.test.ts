import { describe, expect, it } from 'vitest';
import { tratamentoErrado } from './tratamento.js';

describe('tratamentoErrado', () => {
  it('pega tu/teu/tua/teus/tuas/ti/contigo, sem diferenciar caixa', () => {
    expect(tratamentoErrado('Tu viu o teu email? falo contigo depois')).toEqual([
      'Tu',
      'teu',
      'contigo',
    ]);
    expect(tratamentoErrado('mandei pra ti a tua senha')).toEqual(['ti', 'tua']);
  });
  it('não pega "te", "tudo", "atual" nem "titulo"', () => {
    expect(tratamentoErrado('te mando tudo atual do titulo')).toEqual([]);
    expect(tratamentoErrado('vc quer que eu te avise?')).toEqual([]);
  });
});
