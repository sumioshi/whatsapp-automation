import { describe, expect, it } from 'vitest';
import { mimeDoNome, nomeSeguro } from './nome-arquivo';

describe('nomeSeguro', () => {
  it('tira diretórios, pontos iniciais e controle', () => {
    expect(nomeSeguro('a/../../x.json', 'f')).toBe('x.json');
    expect(nomeSeguro('..\\..\\y.pdf', 'f')).toBe('y.pdf');
    expect(nomeSeguro('.oculto', 'f')).toBe('oculto');
    expect(nomeSeguro('a\u0000b.txt', 'f')).toBe('ab.txt');
  });
  it('cai no fallback quando nada sobra', () => {
    expect(nomeSeguro('', 'f')).toBe('f');
    expect(nomeSeguro(null, 'f')).toBe('f');
    expect(nomeSeguro('../', 'f')).toBe('f');
  });
  it('limita a 120 e preserva nome normal', () => {
    expect(nomeSeguro('a'.repeat(200), 'f')).toHaveLength(120);
    expect(nomeSeguro('nota fiscal.pdf', 'f')).toBe('nota fiscal.pdf');
  });
});

describe('mimeDoNome', () => {
  it('mapeia as extensões comuns, sem diferenciar maiúscula', () => {
    expect(mimeDoNome('nota.pdf')).toBe('application/pdf');
    expect(mimeDoNome('CONTRATO.DOCX')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(mimeDoNome('a.doc')).toBe('application/msword');
    expect(mimeDoNome('p.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(mimeDoNome('p.xls')).toBe('application/vnd.ms-excel');
    expect(mimeDoNome('d.csv')).toBe('text/csv');
    expect(mimeDoNome('l.txt')).toBe('text/plain');
    expect(mimeDoNome('z.zip')).toBe('application/zip');
    expect(mimeDoNome('f.jpg')).toBe('image/jpeg');
    expect(mimeDoNome('f.jpeg')).toBe('image/jpeg');
    expect(mimeDoNome('f.png')).toBe('image/png');
    expect(mimeDoNome('v.mp4')).toBe('video/mp4');
    expect(mimeDoNome('s.mp3')).toBe('audio/mpeg');
    expect(mimeDoNome('s.ogg')).toBe('audio/ogg');
    expect(mimeDoNome('s.m4a')).toBe('audio/mp4');
  });
  it('sem extensão conhecida → undefined', () => {
    expect(mimeDoNome('arquivo')).toBeUndefined();
    expect(mimeDoNome('x.exe')).toBeUndefined();
    expect(mimeDoNome('pdf')).toBeUndefined();
  });
});
