import { describe, expect, it } from 'vitest';
import {
  type EstadoCodigos,
  MAX_ENVIOS,
  MAX_TENTATIVAS,
  VALIDADE_MS,
  conferirCodigo,
  emailDoCodigo,
  registrarCodigo,
} from './codigo-email';

const CHAVE = 'chave-de-teste';
const T0 = 1_800_000_000_000;
const MIN = 60_000;

describe('registrarCodigo', () => {
  it('guarda só o hash do código, com validade', () => {
    const r = registrarCodigo({}, 'dono@x.com', '123456', T0, CHAVE);
    expect(r.ok).toBe(true);
    const e = r.estado['dono@x.com']!;
    expect(JSON.stringify(e)).not.toContain('123456');
    expect(e.expira).toBe(T0 + VALIDADE_MS);
    expect(e.tentativas).toBe(0);
  });
  it(`limita a ${MAX_ENVIOS} envios a cada 10 minutos por e-mail`, () => {
    let estado: EstadoCodigos = {};
    for (let i = 0; i < MAX_ENVIOS; i++) {
      const r = registrarCodigo(estado, 'dono@x.com', '11111' + i, T0 + i * MIN, CHAVE);
      expect(r.ok).toBe(true);
      estado = r.estado;
    }
    expect(registrarCodigo(estado, 'dono@x.com', '999999', T0 + 3 * MIN, CHAVE).ok).toBe(false);
    // Passados os 10 minutos do primeiro envio, libera de novo.
    expect(registrarCodigo(estado, 'dono@x.com', '999999', T0 + 10 * MIN + 1, CHAVE).ok).toBe(true);
  });
  it('código novo substitui o anterior', () => {
    const a = registrarCodigo({}, 'dono@x.com', '111111', T0, CHAVE).estado;
    const b = registrarCodigo(a, 'dono@x.com', '222222', T0 + MIN, CHAVE).estado;
    expect(conferirCodigo(b, 'dono@x.com', '111111', T0 + MIN, CHAVE).ok).toBe(false);
  });
  it('limpa entradas velhas de outros e-mails', () => {
    const velho = registrarCodigo({}, 'velho@x.com', '111111', T0, CHAVE).estado;
    const r = registrarCodigo(velho, 'dono@x.com', '222222', T0 + 2 * 60 * MIN, CHAVE);
    expect(Object.keys(r.estado)).toEqual(['dono@x.com']);
  });
});

describe('conferirCodigo', () => {
  const base = registrarCodigo({}, 'dono@x.com', '123456', T0, CHAVE).estado;
  it('código certo entra uma vez só', () => {
    const r = conferirCodigo(base, 'dono@x.com', '123456', T0 + MIN, CHAVE);
    expect(r.ok).toBe(true);
    expect(conferirCodigo(r.estado, 'dono@x.com', '123456', T0 + MIN, CHAVE).ok).toBe(false);
  });
  it('aceita o código com espaços em volta', () => {
    expect(conferirCodigo(base, 'dono@x.com', ' 123 456 ', T0 + MIN, CHAVE).ok).toBe(true);
  });
  it('código vencido não entra', () => {
    const r = conferirCodigo(base, 'dono@x.com', '123456', T0 + VALIDADE_MS + 1, CHAVE);
    expect(r).toMatchObject({ ok: false, motivo: 'vencido' });
  });
  it(`depois de ${MAX_TENTATIVAS} erros o código morre, até o certo`, () => {
    let estado = base;
    for (let i = 0; i < MAX_TENTATIVAS; i++) {
      const r = conferirCodigo(estado, 'dono@x.com', '000000', T0 + MIN, CHAVE);
      expect(r.ok).toBe(false);
      estado = r.estado;
    }
    expect(conferirCodigo(estado, 'dono@x.com', '123456', T0 + MIN, CHAVE)).toMatchObject({ ok: false, motivo: 'tentativas' });
  });
  it('e-mail sem código pedido não entra', () => {
    expect(conferirCodigo({}, 'dono@x.com', '123456', T0, CHAVE)).toMatchObject({ ok: false, motivo: 'sem_codigo' });
  });
});

describe('emailDoCodigo', () => {
  it('assunto com o código e corpo que diz a validade e o que fazer se não pediu', () => {
    const e = emailDoCodigo('482913', 'Balcão <acesso@exemplo.com>', 'dono@x.com');
    expect(e.from).toBe('Balcão <acesso@exemplo.com>');
    expect(e.to).toEqual(['dono@x.com']);
    expect(e.subject).toContain('482913');
    expect(e.text).toContain('482913');
    expect(e.text).toMatch(/10 minutos/);
    expect(e.text).toMatch(/não pediu/i);
    expect(e.html).toContain('482913');
  });
});
