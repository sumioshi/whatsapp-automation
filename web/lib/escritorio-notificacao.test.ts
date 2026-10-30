import { describe, expect, it } from 'vitest';
import {
  FreioPorChat,
  interpretarEventoMensagem,
  PREVIA_MAX_CHARS,
  previaDaMensagem,
} from './escritorio-notificacao';

const clientes = [
  {
    slug: 'clinica-x',
    contatosVinculados: [
      { nome: 'Érica', dmSlug: 'dm-5531999990000', dmSlugs: ['dm-5531999990000', 'dm-1234@lid'] },
      { nome: 'Sem DM', dmSlug: null },
    ],
  },
  { slug: 'loja-y', contatosVinculados: [] },
];

describe('interpretarEventoMensagem', () => {
  it('ignora mensagem da própria conta (fromMe)', () => {
    expect(
      interpretarEventoMensagem({ slug: 'clinica-x', fromMe: true, text: 'oi', origem: 'celular' }, clientes),
    ).toBeNull();
  });

  it('ignora payload inválido ou sem slug', () => {
    expect(interpretarEventoMensagem(null, clientes)).toBeNull();
    expect(interpretarEventoMensagem('x', clientes)).toBeNull();
    expect(interpretarEventoMensagem({ fromMe: false, text: 'oi' }, clientes)).toBeNull();
  });

  it('grupo direto → o próprio projeto, com autor e prévia', () => {
    const r = interpretarEventoMensagem(
      { slug: 'loja-y', fromMe: false, senderName: 'Paulo', text: 'tem novidade?', type: 'text' },
      clientes,
    );
    expect(r).toEqual({
      slugProjeto: 'loja-y',
      origemSlug: 'loja-y',
      autor: 'Paulo',
      previa: 'tem novidade?',
      tipo: 'text',
    });
  });

  it('DM vinculada → projeto do contato, autor marcado como DM', () => {
    const r = interpretarEventoMensagem(
      { slug: 'dm-5531999990000', fromMe: false, senderName: 'Dra. Érica', text: 'consegue hoje?' },
      clientes,
    );
    expect(r?.slugProjeto).toBe('clinica-x');
    expect(r?.origemSlug).toBe('dm-5531999990000');
    expect(r?.autor).toBe('Dra. Érica (DM)');
  });

  it('DM vinculada por dmSlugs (LID) também resolve; sem senderName usa o nome do contato', () => {
    const r = interpretarEventoMensagem({ slug: 'dm-1234@lid', fromMe: false, text: 'oi' }, clientes);
    expect(r?.slugProjeto).toBe('clinica-x');
    expect(r?.autor).toBe('Érica (DM)');
  });

  it('DM não vinculada a nenhum projeto → null', () => {
    expect(
      interpretarEventoMensagem({ slug: 'dm-5511000000000', fromMe: false, text: 'oi' }, clientes),
    ).toBeNull();
  });
});

describe('previaDaMensagem', () => {
  it('rótulo por tipo quando não há texto', () => {
    expect(previaDaMensagem({ type: 'audio', text: '' })).toBe('[áudio]');
    expect(previaDaMensagem({ type: 'image' })).toBe('[imagem]');
    expect(previaDaMensagem({ type: 'video' })).toBe('[vídeo]');
    expect(previaDaMensagem({ type: 'document' })).toBe('[documento]');
    expect(previaDaMensagem({ type: 'sticker' })).toBe('[figurinha]');
    expect(previaDaMensagem({ type: 'desconhecido' })).toBe('[mensagem]');
  });

  it('legenda de mídia vence o rótulo', () => {
    expect(previaDaMensagem({ type: 'image', text: 'olha isso' })).toBe('olha isso');
  });

  it('encurta texto longo e normaliza quebras de linha', () => {
    const longo = 'a'.repeat(200);
    const p = previaDaMensagem({ text: longo });
    expect(p.length).toBe(PREVIA_MAX_CHARS + 1);
    expect(p.endsWith('…')).toBe(true);
    expect(previaDaMensagem({ text: 'linha 1\n\nlinha  2' })).toBe('linha 1 linha 2');
  });
});

describe('FreioPorChat', () => {
  it('rajada do mesmo slug em 3 s = um som', () => {
    const f = new FreioPorChat();
    const t0 = 10_000;
    expect(f.permitir('a', t0)).toBe(true);
    expect(f.permitir('a', t0 + 500)).toBe(false);
    expect(f.permitir('a', t0 + 1_500)).toBe(false);
    expect(f.permitir('a', t0 + 2_999)).toBe(false);
    expect(f.permitir('a', t0 + 3_000)).toBe(true);
  });

  it('slugs diferentes respeitam o freio global de 1 s', () => {
    const f = new FreioPorChat();
    const t0 = 10_000;
    expect(f.permitir('a', t0)).toBe(true);
    expect(f.permitir('b', t0 + 200)).toBe(false);
    expect(f.permitir('b', t0 + 1_000)).toBe(true);
    // 'a' segue travado pelo próprio freio de 3 s mesmo com o global livre
    expect(f.permitir('a', t0 + 2_500)).toBe(false);
  });

  it('tentativa bloqueada não renova a janela', () => {
    const f = new FreioPorChat();
    expect(f.permitir('a', 0)).toBe(true);
    expect(f.permitir('a', 2_900)).toBe(false);
    expect(f.permitir('a', 3_000)).toBe(true);
  });
});
