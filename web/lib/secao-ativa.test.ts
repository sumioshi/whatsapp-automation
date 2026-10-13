import { describe, expect, it } from 'vitest';
import { secaoAtiva } from './secao-ativa';

const secoes = [
  { id: 'conexao', topo: 0 },
  { id: 'grupos', topo: 400 },
  { id: 'radar', topo: 900 },
];
const vista = (topo: number) => ({ topo, altura: 600, total: 2000 });

describe('secaoAtiva', () => {
  it('sem seções, nenhuma ativa', () => {
    expect(secaoAtiva([], vista(0))).toBeNull();
  });

  it('no topo da página, a primeira', () => {
    expect(secaoAtiva(secoes, vista(0))).toBe('conexao');
  });

  it('a seção vira ativa quando o topo dela cruza a linha de leitura (120 px)', () => {
    expect(secaoAtiva(secoes, vista(279))).toBe('conexao');
    expect(secaoAtiva(secoes, vista(280))).toBe('grupos');
    expect(secaoAtiva(secoes, vista(850))).toBe('radar');
  });

  it('no fim da rolagem (com 2 px de folga), a última, mesmo baixa demais para alcançar a linha', () => {
    const curtas = [...secoes, { id: 'time', topo: 1900 }];
    expect(secaoAtiva(curtas, vista(1397))).toBe('radar');
    expect(secaoAtiva(curtas, vista(1398))).toBe('time');
    expect(secaoAtiva(curtas, vista(1400))).toBe('time');
  });

  it('página que não rola fica na primeira', () => {
    expect(secaoAtiva(secoes, { topo: 0, altura: 2000, total: 2000 })).toBe('conexao');
  });

  it('a ordem de entrada não importa', () => {
    expect(secaoAtiva([secoes[2], secoes[0], secoes[1]], vista(500))).toBe('grupos');
  });

  it('a linha de leitura pode mudar', () => {
    expect(secaoAtiva(secoes, vista(300), 50)).toBe('conexao');
    expect(secaoAtiva(secoes, vista(350), 50)).toBe('grupos');
  });
});
