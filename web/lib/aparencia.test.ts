import { describe, expect, it } from 'vitest';
import {
  MATIZES,
  barrasDaAtividade,
  medidaDoUso,
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
  it('letras estilizadas de perfil viram letras normais', () => {
    expect(iniciais('𝓐𝓷𝓪 Lima')).toBe('AL');
    expect(iniciais('𝐁𝐞𝐭𝐨 𝐒𝐢𝐥𝐯𝐚')).toBe('BS');
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

describe('medidaDoUso', () => {
  it('dentro do limite: barra até o valor e marca no limite, com folga de 10%', () => {
    const m = medidaDoUso(142, 150);
    expect(m.cheio).toBeCloseTo((142 / 165) * 100);
    expect(m.excesso).toBe(0);
    expect(m.marca).toBeCloseTo((150 / 165) * 100);
  });
  it('acima do limite: azul até o limite e âmbar do limite até o valor', () => {
    const m = medidaDoUso(412, 300);
    const teto = 412 * 1.1;
    expect(m.cheio).toBeCloseTo((300 / teto) * 100);
    expect(m.excesso).toBeCloseTo((112 / teto) * 100);
    expect(m.marca).toBeCloseTo(m.cheio);
  });
  it('zero de zero não divide por zero', () => {
    expect(medidaDoUso(0, 0)).toEqual({ cheio: 0, excesso: 0, marca: 0 });
  });
  it('valor negativo ou inválido conta como zero', () => {
    expect(medidaDoUso(-5, 100).cheio).toBe(0);
    expect(medidaDoUso(Number.NaN, 100).cheio).toBe(0);
  });
});

describe('barrasDaAtividade', () => {
  it('a maior barra ocupa a altura toda e o resto é proporcional', () => {
    const b = barrasDaAtividade([0, 5, 10], { altura: 20 });
    expect(b.map((x) => x.altura)).toEqual([2, 10, 20]);
  });
  it('dia sem mensagem ainda aparece com o mínimo de 2 px', () => {
    expect(barrasDaAtividade([0, 0], { altura: 20 }).map((x) => x.altura)).toEqual([2, 2]);
  });
  it('marca acima quem passa 15% do limite diário', () => {
    const b = barrasDaAtividade([10, 11.5, 11.6], { altura: 20, limiteDiario: 10 });
    expect(b.map((x) => x.acima)).toEqual([false, false, true]);
  });
  it('sem limite diário nenhuma barra fica acima', () => {
    expect(barrasDaAtividade([1, 999]).every((x) => !x.acima)).toBe(true);
  });
});
