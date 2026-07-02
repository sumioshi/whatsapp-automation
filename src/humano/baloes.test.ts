import { describe, expect, it } from 'vitest';
import { PERFIL_DEFAULT, quebrarEmBaloes } from './baloes';

describe('quebrarEmBaloes', () => {
  it('texto curto (≤80 chars) nunca quebra', () => {
    expect(quebrarEmBaloes('blz, vou ver isso agora')).toEqual(['blz, vou ver isso agora']);
  });

  it('parágrafos (linha em branco) viram balões', () => {
    const t = 'primeiro pensamento aqui, com um pouco mais de corpo pra passar do limite\n\nsegundo pensamento, outro assunto';
    expect(quebrarEmBaloes(t)).toEqual([
      'primeiro pensamento aqui, com um pouco mais de corpo pra passar do limite',
      'segundo pensamento, outro assunto',
    ]);
  });

  it('parágrafo único longo quebra por sentença perto do alvo do perfil', () => {
    const t =
      'a ideia é a seguinte: o coletor da nuvem captura tudo em tempo real. ' +
      'o painel lê direto do volume e mostra na hora. ' +
      'e o mcp conversa com esse painel por http autenticado quando o modo remoto liga.';
    const baloes = quebrarEmBaloes(t, { ...PERFIL_DEFAULT, tamanhoMedioBalao: 80 });
    expect(baloes.length).toBeGreaterThanOrEqual(2);
    expect(baloes.length).toBeLessThanOrEqual(3);
    expect(baloes.join(' ')).toBe(t); // não perde nem duplica conteúdo
  });

  it('nunca passa de 3 balões (excedente funde no último)', () => {
    const t = Array.from({ length: 8 }, (_, i) => `pensamento numero ${i} com corpo suficiente aqui`).join('\n\n');
    expect(quebrarEmBaloes(t).length).toBe(3);
  });

  it('texto vazio ou só espaços → nenhum balão', () => {
    expect(quebrarEmBaloes('')).toEqual([]);
    expect(quebrarEmBaloes('   \n  ')).toEqual([]);
  });

  it('parágrafo único longo SEM pontuação quebra por palavra', () => {
    const t = 'palavra '.repeat(45).trim();
    const baloes = quebrarEmBaloes(t, { ...PERFIL_DEFAULT, tamanhoMedioBalao: 100 });
    expect(baloes.length).toBeGreaterThanOrEqual(2);
    expect(baloes.join(' ')).toBe(t);
  });

  it('fusão por excesso de parágrafos preserva conteúdo', () => {
    const partes = Array.from({ length: 5 }, (_, i) => `pensamento ${i} com corpo suficiente aqui dentro`);
    const baloes = quebrarEmBaloes(partes.join('\n\n'));
    expect(baloes.length).toBe(3);
    expect(baloes.join(' ')).toBe(partes.join(' '));
  });
});
