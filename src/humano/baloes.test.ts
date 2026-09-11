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

  it('ponto SEM espaço depois (versão 2.1.0, URL, decimal) NÃO é fim de sentença', () => {
    const t =
      'irmão fechei aquele pacote de ajustes que a gente tinha listado na call de ontem à noite ' +
      'e acabei de publicar a versão 2.1.0 no servidor de produção agora há pouco. ' +
      'dá uma olhada quando puder e me fala se ficou do jeito que vc queria, qualquer coisa eu ajusto ainda hoje.';
    const baloes = quebrarEmBaloes(t, { ...PERFIL_DEFAULT, tamanhoMedioBalao: 80 });
    // nenhum balão pode terminar no meio da versão (ex.: "... versão 2." / "1.")
    for (const b of baloes) {
      expect(b).not.toMatch(/\d\.$/);
    }
    // a versão inteira sobrevive intacta em algum balão
    expect(baloes.some((b) => b.includes('2.1.0'))).toBe(true);
    expect(baloes.join(' ')).toBe(t);
  });

  it('decimais e URLs atravessam a quebra por sentença sem rachar', () => {
    const t =
      'o custo ficou em 3.75 por mil tokens, bem abaixo do teto que a gente tinha definido antes. ' +
      'a doc completa tá em https://exemplo.com/v2.docs.html pra você conferir os detalhes com calma.';
    const baloes = quebrarEmBaloes(t, { ...PERFIL_DEFAULT, tamanhoMedioBalao: 80 });
    expect(baloes.some((b) => b.includes('3.75'))).toBe(true);
    expect(baloes.some((b) => b.includes('https://exemplo.com/v2.docs.html'))).toBe(true);
    expect(baloes.join(' ')).toBe(t);
  });

  it('fusão por excesso de parágrafos preserva conteúdo', () => {
    const partes = Array.from({ length: 5 }, (_, i) => `pensamento ${i} com corpo suficiente aqui dentro`);
    const baloes = quebrarEmBaloes(partes.join('\n\n'));
    expect(baloes.length).toBe(3);
    expect(baloes.join('\n\n')).toBe(partes.join('\n\n'));
  });

  it('excedente de parágrafos funde com linha em branco, não colado por espaço', () => {
    const partes = Array.from({ length: 5 }, (_, i) => `pensamento ${i} com corpo suficiente aqui dentro`);
    const ultimo = quebrarEmBaloes(partes.join('\n\n'))[2] as string;
    // os parágrafos 3, 4 e 5 caem todos no último balão: cada um precisa
    // continuar sendo uma frase separada, senão o leitor recebe um parágrafo
    // corrido com frases colando umas nas outras.
    expect(ultimo).toBe([partes[2], partes[3], partes[4]].join('\n\n'));
    expect(ultimo).not.toContain('dentro pensamento');
  });
});
