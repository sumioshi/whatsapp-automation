import { describe, expect, it } from 'vitest';
import { type ContatoLinha, filtrarContatos } from './contatos-filtro';

const lista: ContatoLinha[] = [
  { id: '551190000053', nome: 'Dr Paulo Lima', papel: 'client', dmJid: '551190000053@s.whatsapp.net' },
  { id: '40085181472808', nome: 'Dr Paulo Lima', papel: 'client', dmJid: '551190000053@s.whatsapp.net' },
  { id: '551190000054', nome: 'BOT - Paulo Lima', papel: 'client', dmJid: '551190000054@s.whatsapp.net' },
  { id: '551190000052', nome: 'Amanda Souza', papel: 'client', dmJid: '551190000052@s.whatsapp.net' },
  { id: '123', nome: 'José Ação', papel: 'team', dmJid: null },
];

describe('filtrarContatos', () => {
  it('agrupa telefone e LID da mesma pessoa numa linha, com o slug da DM', () => {
    const r = filtrarContatos(lista, 'dr paulo');
    expect(r.total).toBe(1);
    expect(r.mostrados[0]).toMatchObject({
      nome: 'Dr Paulo Lima',
      dmJid: '551190000053@s.whatsapp.net',
      slug: 'dm-5511900000076',
      ids: ['551190000053', '40085181472808'],
    });
  });

  it('busca por número acha pelo id/dmJid, com ou sem formatação', () => {
    expect(filtrarContatos(lista, '+55 11 98765-4321').mostrados[0]?.slug).toBe('dm-5511900000076');
    expect(filtrarContatos(lista, '87654321').total).toBe(1);
  });

  it('busca por nome ignora acento e caixa', () => {
    expect(filtrarContatos(lista, 'jose acao').total).toBe(1);
  });

  it('sem busca aplica o limite e avisa que truncou', () => {
    const r = filtrarContatos(lista, undefined, 2);
    expect(r.mostrados).toHaveLength(2);
    expect(r.total).toBe(4);
    expect(r.truncado).toBe(true);
  });

  it('sem dmJid o contato fica sozinho e sem slug', () => {
    const r = filtrarContatos(lista, 'ação');
    expect(r.mostrados[0]).toMatchObject({ slug: null, ids: ['123'] });
  });
});
