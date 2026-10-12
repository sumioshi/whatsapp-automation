import { describe, expect, it } from 'vitest';
import {
  MATIZES,
  corDoMatiz,
  formatarEspera,
  fracaoAnel,
  iniciais,
  matizDaEtiqueta,
  matizDoNome,
  nivelEspera,
  tipoPeloSlug,
} from './aparencia';

const MIN = 60_000;
const H = 60 * MIN;

describe('matizDoNome', () => {
  it('é estável para o mesmo nome', () => {
    expect(matizDoNome('Clínica Ébano')).toBe(matizDoNome('Clínica Ébano'));
  });
  it('ignora caixa e espaços nas pontas', () => {
    expect(matizDoNome('  norte logística ')).toBe(matizDoNome('Norte Logística'));
  });
  it('espalha nomes diferentes por vários matizes', () => {
    const nomes = Array.from({ length: 60 }, (_, i) => `Cliente ${i}`);
    expect(new Set(nomes.map(matizDoNome)).size).toBeGreaterThanOrEqual(7);
  });
  it('sempre devolve um matiz conhecido, inclusive para vazio', () => {
    expect(MATIZES).toContain(matizDoNome(''));
  });
});

describe('corDoMatiz', () => {
  it('aponta para o token do matiz', () => {
    expect(corDoMatiz('teal')).toBe('var(--color-hue-teal)');
  });
});

describe('matizDaEtiqueta', () => {
  it('usa a cor fixa das etiquetas conhecidas, sem diferenciar caixa', () => {
    expect(matizDaEtiqueta('Bug')).toBe('red');
    expect(matizDaEtiqueta('contrato')).toBe('indigo');
    expect(matizDaEtiqueta('Proposta')).toBe('amber');
    expect(matizDaEtiqueta('Lead')).toBe('violet');
    expect(matizDaEtiqueta('Parceiro')).toBe('teal');
  });
  it('etiqueta nova cai no matiz pelo nome', () => {
    expect(matizDaEtiqueta('Urgente')).toBe(matizDoNome('Urgente'));
  });
});

describe('iniciais', () => {
  it('pega a primeira letra das duas primeiras palavras', () => {
    expect(iniciais('Norte Logística')).toBe('NL');
    expect(iniciais('Hotel Serra Azul')).toBe('HS');
  });
  it('mantém acento e maiúscula', () => {
    expect(iniciais('ótica élan')).toBe('ÓÉ');
  });
  it('ignora & e pontuação', () => {
    expect(iniciais('Pixel & Co.')).toBe('PC');
  });
  it('ignora tratamento como Dr. e Sra.', () => {
    expect(iniciais('Dr. Paulo')).toBe('P');
    expect(iniciais('Sra. Ana Lima')).toBe('AL');
  });
  it('palavra única dá uma letra', () => {
    expect(iniciais('Juliana')).toBe('J');
  });
  it('ignora emoji', () => {
    expect(iniciais('🚀 Rocket Team')).toBe('RT');
  });
  it('telefone, só emoji ou vazio vira #', () => {
    expect(iniciais('+55 11 99999-0000')).toBe('#');
    expect(iniciais('🎉🎉')).toBe('#');
    expect(iniciais('')).toBe('#');
    expect(iniciais('   ')).toBe('#');
  });
});

describe('tipoPeloSlug', () => {
  it('dm- é conversa direta, o resto é grupo', () => {
    expect(tipoPeloSlug('dm-5511999990000')).toBe('dm');
    expect(tipoPeloSlug('clinica-ebano')).toBe('grupo');
  });
});

describe('nivelEspera', () => {
  it('neutro abaixo de 30 min', () => {
    expect(nivelEspera(0)).toBe('neutro');
    expect(nivelEspera(29 * MIN + 59_000)).toBe('neutro');
  });
  it('atenção de 30 min até 4 h inclusive', () => {
    expect(nivelEspera(30 * MIN)).toBe('atencao');
    expect(nivelEspera(3 * H + 59 * MIN + 59_000)).toBe('atencao');
    expect(nivelEspera(4 * H)).toBe('atencao');
  });
  it('urgente acima de 4 h', () => {
    expect(nivelEspera(4 * H + 1000)).toBe('urgente');
    expect(nivelEspera(30 * H)).toBe('urgente');
  });
  it('valor inválido ou negativo é neutro', () => {
    expect(nivelEspera(Number.NaN)).toBe('neutro');
    expect(nivelEspera(-5000)).toBe('neutro');
  });
});

describe('formatarEspera', () => {
  it('minutos abaixo de 1 h', () => {
    expect(formatarEspera(48 * MIN)).toEqual([{ valor: '48', unidade: 'min' }]);
    expect(formatarEspera(20_000)).toEqual([{ valor: '0', unidade: 'min' }]);
  });
  it('horas e minutos com dois dígitos', () => {
    expect(formatarEspera(5 * H + 12 * MIN)).toEqual([
      { valor: '5', unidade: 'h' },
      { valor: '12', unidade: 'm' },
    ]);
    expect(formatarEspera(1 * H + 5 * MIN)).toEqual([
      { valor: '1', unidade: 'h' },
      { valor: '05', unidade: 'm' },
    ]);
  });
  it('dias e horas a partir de 24 h', () => {
    expect(formatarEspera(24 * H + 20 * MIN)).toEqual([
      { valor: '1', unidade: 'd' },
      { valor: '0', unidade: 'h' },
    ]);
    expect(formatarEspera(50 * H)).toEqual([
      { valor: '2', unidade: 'd' },
      { valor: '2', unidade: 'h' },
    ]);
  });
  it('negativo ou inválido vira 0 min', () => {
    expect(formatarEspera(-1)).toEqual([{ valor: '0', unidade: 'min' }]);
    expect(formatarEspera(Number.NaN)).toEqual([{ valor: '0', unidade: 'min' }]);
  });
});

describe('fracaoAnel', () => {
  it('enche linearmente até 4 h e para em 1', () => {
    expect(fracaoAnel(0)).toBe(0);
    expect(fracaoAnel(2 * H)).toBe(0.5);
    expect(fracaoAnel(4 * H)).toBe(1);
    expect(fracaoAnel(10 * H)).toBe(1);
  });
  it('negativo ou inválido é 0', () => {
    expect(fracaoAnel(-1)).toBe(0);
    expect(fracaoAnel(Number.NaN)).toBe(0);
  });
});
