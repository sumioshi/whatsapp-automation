import { describe, expect, it } from 'vitest';
import { saudacaoDoMomento, textoDoErro } from './login-tela';

/** Hora de Brasília (UTC-3, sem horário de verão) num dia qualquer. */
const brt = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 12, h + 3, m));

describe('saudacaoDoMomento', () => {
  it('bom dia das 5h ao meio-dia', () => {
    expect(saudacaoDoMomento(brt(5))).toBe('Bom dia');
    expect(saudacaoDoMomento(brt(11, 59))).toBe('Bom dia');
  });
  it('boa tarde do meio-dia às 18h', () => {
    expect(saudacaoDoMomento(brt(12))).toBe('Boa tarde');
    expect(saudacaoDoMomento(brt(17, 59))).toBe('Boa tarde');
  });
  it('boa noite das 18h às 5h, inclusive de madrugada', () => {
    expect(saudacaoDoMomento(brt(18))).toBe('Boa noite');
    expect(saudacaoDoMomento(brt(23, 30))).toBe('Boa noite');
    expect(saudacaoDoMomento(brt(2))).toBe('Boa noite');
    expect(saudacaoDoMomento(brt(4, 59))).toBe('Boa noite');
  });
  it('usa o horário de Brasília, não o do servidor', () => {
    // 14h em UTC são 11h em Brasília.
    expect(saudacaoDoMomento(new Date(Date.UTC(2026, 9, 12, 14, 0)))).toBe('Bom dia');
  });
});

describe('textoDoErro', () => {
  it('começa com maiúscula e termina com ponto', () => {
    expect(textoDoErro('usuário ou senha incorretos')).toBe('Usuário ou senha incorretos.');
  });
  it('não duplica a pontuação que já existe', () => {
    expect(textoDoErro('Corpo inválido.')).toBe('Corpo inválido.');
  });
  it('sem mensagem do servidor, explica o que fazer', () => {
    expect(textoDoErro(undefined)).toBe('Não foi possível entrar. Tente de novo.');
    expect(textoDoErro('   ')).toBe('Não foi possível entrar. Tente de novo.');
  });
});
