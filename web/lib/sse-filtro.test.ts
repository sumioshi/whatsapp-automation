import { describe, expect, it } from 'vitest';
import { parseFiltro, parseSlugs, passaFiltro } from './sse-filtro';

const q = (s: string) => new URLSearchParams(s);

describe('parseSlugs', () => {
  it('separa por vírgula, limpa espaços e repetições', () => {
    expect(parseSlugs(q('slug=a,%20b,,a'))).toEqual(['a', 'b']);
  });

  it('sem slug → vazio', () => {
    expect(parseSlugs(q(''))).toEqual([]);
  });
});

describe('passaFiltro', () => {
  const semFiltro = parseFiltro(q(''));
  const cliente = { fromMe: false, sender: '5511999999999@s.whatsapp.net' };
  const minhaColetor = { fromMe: true, origem: 'coletor', sender: '5511888888888@s.whatsapp.net' };
  const minhaCelular = { fromMe: true, origem: 'celular', sender: '5511888888888@s.whatsapp.net' };
  const papel = (s: string) => (s.startsWith('5511888') ? 'me' : 'client') as 'me' | 'client';

  it('sem filtro passa tudo', () => {
    expect([cliente, minhaColetor, minhaCelular].every((m) => passaFiltro(m, semFiltro, papel))).toBe(true);
  });

  it('fromMe=0 derruba tudo que é meu', () => {
    const f = parseFiltro(q('fromMe=0'));
    expect(passaFiltro(cliente, f, papel)).toBe(true);
    expect(passaFiltro(minhaCelular, f, papel)).toBe(false);
  });

  it('ocultar=coletor derruba só o que o coletor mandou; a resposta manual passa', () => {
    const f = parseFiltro(q('ocultar=coletor'));
    expect(passaFiltro(minhaColetor, f, papel)).toBe(false);
    expect(passaFiltro(minhaCelular, f, papel)).toBe(true);
    expect(passaFiltro(cliente, f, papel)).toBe(true);
  });

  it('ocultar=coletor esconde o eco do agente mas não o envio de pessoa no painel', () => {
    const f = parseFiltro(q('ocultar=coletor'));
    const doPainel = { fromMe: true, origem: 'coletor', ator: 'painel', sender: '5511888888888@s.whatsapp.net' };
    expect(passaFiltro(minhaColetor, f, papel)).toBe(false);
    expect(passaFiltro(doPainel, f, papel)).toBe(true);
    expect(passaFiltro(doPainel, parseFiltro(q('ocultar=painel')), papel)).toBe(false);
  });

  it('papel=client deixa só cliente', () => {
    const f = parseFiltro(q('papel=client'));
    expect(passaFiltro(cliente, f, papel)).toBe(true);
    expect(passaFiltro(minhaCelular, f, papel)).toBe(false);
  });

  it('papel inválido é ignorado', () => {
    expect(parseFiltro(q('papel=alien,team')).papel).toEqual(new Set(['team']));
  });
});
