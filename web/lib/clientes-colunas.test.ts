import { describe, expect, it } from 'vitest';
import { COLUNAS, alternarColuna, classeDaColuna, colunaVisivel, colunasDoHtml } from './clientes-colunas';

const col = (id: string) => COLUNAS.find((c) => c.id === id)!;

describe('colunas da tabela de clientes', () => {
  it('padrão: principais sempre, extras só em tela larga, prévia e nota escondidas', () => {
    expect(colunaVisivel(col('contrato'), null, false)).toBe(true);
    expect(colunaVisivel(col('renovacao'), null, false)).toBe(false);
    expect(colunaVisivel(col('renovacao'), null, true)).toBe(true);
    expect(colunaVisivel(col('nota'), null, true)).toBe(false);
  });

  it('no padrão, as extras vão para o HTML com a classe que as esconde em tela menor', () => {
    const ids = colunasDoHtml(null).map((c) => c.id);
    expect(ids).toContain('renovacao');
    expect(ids).not.toContain('nota');
    expect(classeDaColuna(col('renovacao'), null)).toBe('max-[1599px]:hidden');
    expect(classeDaColuna(col('contrato'), null)).toBe('');
  });

  it('escolha explícita vale em qualquer largura e tira a classe', () => {
    const escolha = { renovacao: true, tipo: false, nota: true };
    expect(colunaVisivel(col('renovacao'), escolha, false)).toBe(true);
    expect(classeDaColuna(col('renovacao'), escolha)).toBe('');
    const ids = colunasDoHtml(escolha).map((c) => c.id);
    expect(ids).toContain('nota');
    expect(ids).not.toContain('tipo');
  });

  it('alternar parte do que está na tela e muda só a coluna clicada', () => {
    const depois = alternarColuna(null, 'tipo', false);
    expect(depois.tipo).toBe(false);
    // o resto fica como estava na tela estreita: extras escondidas, principais à mostra
    expect(depois.renovacao).toBe(false);
    expect(depois.contrato).toBe(true);
    expect(alternarColuna(depois, 'tipo', false).tipo).toBe(true);
    expect(alternarColuna(null, 'renovacao', true).renovacao).toBe(false);
  });
});
