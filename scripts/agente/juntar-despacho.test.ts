import { describe, expect, it } from 'vitest';
import { juntar } from './juntar-despacho.mjs';

describe('juntar', () => {
  it('achata os itens preenchendo slug e cliente do arquivo', () => {
    const r = juntar([
      { slug: 'a', cliente: 'A', itens: [{ tipo: 'info', titulo: 'x', acao: 'nenhuma' }] },
      { slug: 'b', cliente: 'B', itens: [{ tipo: 'pergunta', titulo: 'y', texto: 't', acao: 'enviar', slug: 'b' }] },
    ]);
    expect(r.itens).toEqual([
      { tipo: 'info', titulo: 'x', acao: 'nenhuma', slug: 'a', cliente: 'A' },
      { tipo: 'pergunta', titulo: 'y', texto: 't', acao: 'enviar', slug: 'b', cliente: 'B' },
    ]);
  });
  it('ignora arquivo sem slug e itens que não são objeto', () => {
    const r = juntar([{ cliente: 'X', itens: [{ tipo: 'info', titulo: 'x' }] }, { slug: 'c', cliente: 'C', itens: ['lixo', null] }]);
    expect(r.itens).toEqual([]);
  });
});
