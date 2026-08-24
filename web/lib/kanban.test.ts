import { describe, expect, it } from 'vitest';
import {
  colunaDoCartao,
  criarColuna,
  estadoInicial,
  excluirColuna,
  type KanbanState,
  moverCartao,
  renomearColuna,
} from './kanban';

function base(): KanbanState {
  return {
    colunas: [
      { id: 'c1', nome: 'Entrada' },
      { id: 'c2', nome: 'Importante' },
    ],
    cartoes: { 'grupo-a': 'c2' },
  };
}

describe('kanban', () => {
  it('estadoInicial nasce com a coluna Entrada', () => {
    const s = estadoInicial();
    expect(s.colunas.length).toBe(1);
    expect(s.colunas[0]?.nome).toBe('Entrada');
  });

  it('cartão sem atribuição cai na primeira coluna', () => {
    const s = base();
    expect(colunaDoCartao(s, 'grupo-novo')).toBe('c1');
    expect(colunaDoCartao(s, 'grupo-a')).toBe('c2');
  });

  it('cartão atribuído a coluna que não existe mais cai na primeira', () => {
    const s = base();
    s.cartoes['orfao'] = 'c-apagada';
    expect(colunaDoCartao(s, 'orfao')).toBe('c1');
  });

  it('moverCartao atribui e mover pra primeira coluna limpa a atribuição', () => {
    let s = base();
    s = moverCartao(s, 'grupo-b', 'c2');
    expect(s.cartoes['grupo-b']).toBe('c2');
    s = moverCartao(s, 'grupo-b', 'c1');
    expect(s.cartoes['grupo-b']).toBeUndefined();
  });

  it('criarColuna gera id único e preserva as existentes', () => {
    const s = criarColuna(base(), 'Follow-up');
    expect(s.colunas.map((c) => c.nome)).toEqual(['Entrada', 'Importante', 'Follow-up']);
    const ids = new Set(s.colunas.map((c) => c.id));
    expect(ids.size).toBe(3);
  });

  it('renomearColuna troca só o nome; vazio é ignorado', () => {
    let s = renomearColuna(base(), 'c2', 'VIP');
    expect(s.colunas[1]?.nome).toBe('VIP');
    s = renomearColuna(s, 'c2', '   ');
    expect(s.colunas[1]?.nome).toBe('VIP');
  });

  it('excluirColuna devolve os cartões pra primeira e não exclui a última', () => {
    let s = excluirColuna(base(), 'c2');
    expect(s.colunas.length).toBe(1);
    expect(s.cartoes['grupo-a']).toBeUndefined(); // voltou pra Entrada (default)
    s = excluirColuna(s, 'c1');
    expect(s.colunas.length).toBe(1); // última coluna não sai
  });
});
