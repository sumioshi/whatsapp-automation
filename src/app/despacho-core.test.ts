import { describe, expect, it } from 'vitest';
import {
  type ArquivoDespacho,
  acharItem,
  formatarDespacho,
  parseComando,
  pendentes,
  rotuloPassada,
} from './despacho-core.js';

const base = (over: Partial<ArquivoDespacho> = {}): ArquivoDespacho => ({
  passada: '2026-09-04T0610',
  criadoEm: '2026-09-04T09:10:00.000Z',
  enviadoEm: null,
  itens: [
    {
      n: 1,
      id: 'a-1',
      slug: 'a',
      cliente: 'Cliente A',
      tipo: 'issue',
      titulo: 'Botão some no mobile',
      url: 'https://github.com/o/r/issues/42',
      texto: null,
      issue: { repo: 'o/r', numero: 42 },
      acao: 'label',
      label: 'claude',
      executadoEm: null,
      resultado: null,
    },
    {
      n: 2,
      id: 'a-2',
      slug: 'a',
      cliente: 'Cliente A',
      tipo: 'bug',
      titulo: 'Erro 500 ao salvar',
      url: 'https://github.com/o/r/issues/43',
      texto: null,
      issue: { repo: 'o/r', numero: 43 },
      acao: 'nenhuma',
      label: null,
      executadoEm: null,
      resultado: null,
    },
    {
      n: 3,
      id: 'c-1',
      slug: 'c',
      cliente: 'Cliente C',
      tipo: 'pergunta',
      titulo: 'Filtro',
      url: null,
      texto: 'vc quer o filtro por data ou por status?',
      issue: null,
      acao: 'enviar',
      label: null,
      executadoEm: null,
      resultado: null,
    },
    {
      n: 4,
      id: 'd-1',
      slug: 'd',
      cliente: 'Cliente D',
      tipo: 'info',
      titulo: 'pediu prazo da fase 2',
      url: null,
      texto: null,
      issue: null,
      acao: 'nenhuma',
      label: null,
      executadoEm: null,
      resultado: null,
    },
  ],
  ...over,
});

describe('formatarDespacho', () => {
  it('agrupa por tipo, numera e mostra o rodapé de comandos', () => {
    const txt = formatarDespacho(base());
    expect(txt).toContain('📋 *despacho — 04/09 06:10*');
    expect(txt).toContain('*Issues criadas (2)*');
    expect(txt).toContain('1. Cliente A — Botão some no mobile · #42');
    expect(txt).toContain('2. Cliente A — Erro 500 ao salvar · #43 _bug_');
    expect(txt).toContain('*Perguntas pra aprovar (1)*');
    expect(txt).toContain('3. Cliente C — "vc quer o filtro por data ou por status?"');
    expect(txt).toContain('*Pra você decidir (1)*');
    expect(txt).toContain('4. Cliente D — pediu prazo da fase 2');
    expect(txt).toContain('responda: ok N · não N · edita N: texto · ok todos');
  });
  it('seções vazias somem e o teto corta com "… e mais N"', () => {
    const muitos = base({
      itens: Array.from({ length: 15 }, (_, i) => ({
        ...base().itens[3]!,
        n: i + 1,
        id: `x-${i}`,
      })),
    });
    const txt = formatarDespacho(muitos);
    expect(txt).not.toContain('Issues criadas');
    expect(txt).toContain('_… e mais 3_');
  });
  it('sem itens: mensagem curta dizendo que não há nada', () => {
    expect(formatarDespacho(base({ itens: [] }))).toContain('nada novo pra decidir');
  });
});

describe('parseComando', () => {
  it('ok/não com número e "todos"; edita com texto', () => {
    expect(parseComando('ok 3')).toEqual({ tipo: 'ok', alvo: 3 });
    expect(parseComando('OK todos')).toEqual({ tipo: 'ok', alvo: 'todos' });
    expect(parseComando('não 2')).toEqual({ tipo: 'nao', alvo: 2 });
    expect(parseComando('nao 2')).toEqual({ tipo: 'nao', alvo: 2 });
    expect(parseComando('edita 3: vc prefere por data?')).toEqual({
      tipo: 'edita',
      n: 3,
      texto: 'vc prefere por data?',
    });
  });
  it('qualquer outra coisa é null (mensagem normal do operador)', () => {
    expect(parseComando('ok')).toBeNull();
    expect(parseComando('bom dia, ok 3 depois')).toBeNull();
    expect(parseComando('')).toBeNull();
  });
});

describe('acharItem / pendentes / rotuloPassada', () => {
  it('acha pelo n global entre arquivos e lista pendentes acionáveis', () => {
    const a = base();
    const b = base({ passada: '2026-09-04T1300', itens: [{ ...a.itens[2]!, n: 9, id: 'z-1' }] });
    expect(acharItem([a, b], 9)?.arquivo.passada).toBe('2026-09-04T1300');
    expect(acharItem([a, b], 99)).toBeNull();
    expect(pendentes(a).map((i) => i.n)).toEqual([1, 3]);
    expect(rotuloPassada('2026-09-04T0610')).toBe('04/09 06:10');
  });
});
