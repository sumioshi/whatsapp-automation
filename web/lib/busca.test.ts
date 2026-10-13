import { describe, expect, it } from 'vitest';
import { casaBusca, normalizarBusca } from './busca';

describe('normalizarBusca', () => {
  it('tira acento e caixa', () => {
    expect(normalizarBusca('Clínica ÉBANO')).toBe('clinica ebano');
  });

  it('mantém número, emoji e pontuação', () => {
    expect(normalizarBusca('#14 🔥 Oferta!')).toBe('#14 🔥 oferta!');
  });
});

describe('casaBusca', () => {
  it('consulta vazia (ou só espaço) casa com tudo', () => {
    expect(casaBusca('Qualquer coisa', '')).toBe(true);
    expect(casaBusca('Qualquer coisa', '   ')).toBe(true);
  });

  it('casa trecho em qualquer lugar, sem acento nem caixa', () => {
    expect(casaBusca('Clínica Ébano', 'ebano')).toBe(true);
    expect(casaBusca('Clínica Ébano', 'NICA V')).toBe(true);
  });

  it('procura em qualquer um dos textos dados', () => {
    expect(casaBusca(['Padaria Trigal', 'padaria-trigal', 'cliente'], 'client')).toBe(true);
    expect(casaBusca(['Padaria Trigal', 'padaria-trigal'], 'odonto')).toBe(false);
  });

  it('não casa o que não está lá', () => {
    expect(casaBusca('Rota Fit', 'lume')).toBe(false);
  });
});
