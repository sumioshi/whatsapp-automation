import { describe, expect, it } from 'vitest';
import { analisarNumero, formatarTelefone } from './numero-whatsapp';

describe('formatarTelefone', () => {
  it('celular do Brasil, com o nono dígito', () => {
    expect(formatarTelefone('5511987654321')).toBe('+55 11 98765-4321');
  });

  it('fixo ou celular antigo do Brasil, sem o nono dígito', () => {
    expect(formatarTelefone('551132654321')).toBe('+55 11 3265-4321');
  });

  it('outro país fica só com o + na frente', () => {
    expect(formatarTelefone('14155550100')).toBe('+14155550100');
    expect(formatarTelefone('351912345678')).toBe('+351912345678');
  });

  it('ignora espaço, parêntese, traço e +', () => {
    expect(formatarTelefone('+55 (11) 98765-4321')).toBe('+55 11 98765-4321');
  });

  it('sem dígito nenhum devolve vazio', () => {
    expect(formatarTelefone('')).toBe('');
    expect(formatarTelefone('abc')).toBe('');
  });
});

describe('analisarNumero', () => {
  it('número com DDI vira jid, slug da DM e exibição', () => {
    expect(analisarNumero('+55 11 98765-4321')).toEqual({
      valido: true,
      digitos: '5511987654321',
      jid: '5511987654321@s.whatsapp.net',
      slug: 'dm-5511987654321',
      exibicao: '+55 11 98765-4321',
      aviso: null,
    });
  });

  it('campo vazio é inválido, mas sem mensagem de erro', () => {
    expect(analisarNumero('   ')).toEqual({ valido: false, digitos: '', erro: null });
  });

  it('menos de 8 dígitos pede o número completo', () => {
    const r = analisarNumero('1234567');
    expect(r.valido).toBe(false);
    expect(r.valido ? null : r.erro).toMatch(/8 dígitos/);
  });

  it('8 dígitos é o mínimo aceito', () => {
    expect(analisarNumero('12345678').valido).toBe(true);
  });

  it('mais de 15 dígitos não é telefone', () => {
    const r = analisarNumero('1234567890123456');
    expect(r.valido).toBe(false);
    expect(r.valido ? null : r.erro).toMatch(/15 dígitos/);
  });

  it('15 dígitos ainda passa', () => {
    expect(analisarNumero('123456789012345').valido).toBe(true);
  });

  it('celular do Brasil digitado sem o 55 passa, com aviso do DDI', () => {
    const r = analisarNumero('(11) 98765-4321');
    expect(r.valido).toBe(true);
    expect(r.valido ? r.aviso : null).toMatch(/55/);
  });

  it('fixo do Brasil digitado sem o 55 também ganha o aviso', () => {
    const r = analisarNumero('11 3265-4321');
    expect(r.valido ? r.aviso : null).toMatch(/55/);
  });

  it('com o 55 não há aviso', () => {
    expect(analisarNumero('5511987654321')).toMatchObject({ valido: true, aviso: null });
  });

  it('outro país com DDI não ganha aviso', () => {
    expect(analisarNumero('+1 415 555 0100')).toMatchObject({ valido: true, aviso: null });
  });
});
