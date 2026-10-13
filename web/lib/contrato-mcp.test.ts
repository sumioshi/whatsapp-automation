import { describe, expect, it } from 'vitest';
import { patchDaTool } from './contrato-mcp';

describe('patchDaTool (tool definir_contrato)', () => {
  it('limite_mensagens vira limiteMensagens; null tira o limite', () => {
    expect(patchDaTool({ limite_mensagens: 300 })).toEqual({ limiteMensagens: 300 });
    expect(patchDaTool({ limite_mensagens: null })).toEqual({ limiteMensagens: null });
  });

  it('só os campos passados entram no patch', () => {
    expect(patchDaTool({ estado: 'ativo', valorMensal: 1800 })).toEqual({ estado: 'ativo', valorMensal: 1800 });
    expect(patchDaTool({ nota: 'renova em dezembro', limite_mensagens: 450 })).toEqual({
      nota: 'renova em dezembro',
      limiteMensagens: 450,
    });
    expect(patchDaTool({})).toEqual({});
  });
});
