import { describe, expect, it } from 'vitest';
import { destinoSemSessao, rotasPainel } from './rotas-painel';

const msg = { id: 'M1', groupJid: '120363000000000000@g.us', sender: '5511999999999@s.whatsapp.net', fromMe: false };

describe('rotas do dono = as de hoje (sem mudança de comportamento)', () => {
  const r = rotasPainel('dono');
  it('leitura', () => {
    expect(r.inicio).toBe('/clientes');
    expect(r.caixa).toBe('/inbox');
    expect(r.chat('grupo-a')).toBe('/g/grupo-a');
    expect(r.status).toBe('/api/status');
    expect(r.mensagens('grupo a')).toBe('/api/messages?slug=grupo%20a');
    expect(r.mensagens('g', { before: 'M1', limit: 150 })).toBe('/api/messages?slug=g&before=M1&limit=150');
    expect(r.presenca('g')).toBe('/api/presence?slug=g');
    expect(r.midia('g/audio/a b.ogg')).toBe('/api/media/g/audio/a%20b.ogg');
  });
  it('escrita', () => {
    expect(r.transcrever('g', 'g/audio/x.ogg')).toEqual({ url: '/api/transcribe', body: { slug: 'g', mediaPath: 'g/audio/x.ogg' } });
    expect(r.documento('g', 'g/document/x.pdf')).toEqual({ url: '/api/document', body: { mediaPath: 'g/document/x.pdf' } });
    expect(r.reagir('g', msg, '👍')).toEqual({
      url: '/api/react',
      body: { jid: msg.groupJid, msgId: 'M1', participant: msg.sender, fromMe: false, emoji: '👍' },
    });
    expect(r.enviarTexto('g', 'J@g.us', 'oi')).toEqual({ url: '/api/send', body: { jid: 'J@g.us', text: 'oi' } });
    expect(r.enviarTexto('g', null, 'oi')).toBeNull();
    expect(r.enviarMidia('g', 'J@g.us')).toEqual({ url: '/api/send-media', campos: { jid: 'J@g.us' } });
    expect(r.visto('g', '2026-10-06T00:00:00.000Z')).toEqual({
      url: '/api/triage', body: { action: 'lastSeen', slug: 'g', value: '2026-10-06T00:00:00.000Z' },
    });
    expect(r.recursos).toEqual({ copiloto: true, time: true });
    expect(r.aoNaoAutenticado).toBe(false);
  });
});

describe('rotas do atendimento', () => {
  const r = rotasPainel('atendimento');
  it('tudo sob /api/atendimento, endereçado por slug, sem copiloto/time', () => {
    expect(r.inicio).toBe('/atendimento');
    expect(r.caixa).toBe('/atendimento');
    expect(r.chat('g')).toBe('/atendimento/g/g');
    expect(r.status).toBe('/api/atendimento/status');
    expect(r.mensagens('g', { before: 'M1', limit: 150 })).toBe('/api/atendimento/mensagens?slug=g&before=M1&limit=150');
    expect(r.presenca('g')).toBe('/api/atendimento/presenca?slug=g');
    expect(r.midia('g/audio/x.ogg')).toBe('/api/atendimento/midia/g/audio/x.ogg');
    expect(r.transcrever('g', 'g/audio/x.ogg')).toEqual({ url: '/api/atendimento/transcrever', body: { slug: 'g', mediaPath: 'g/audio/x.ogg' } });
    expect(r.documento('g', 'g/document/x.pdf')).toEqual({ url: '/api/atendimento/documento', body: { slug: 'g', mediaPath: 'g/document/x.pdf' } });
    expect(r.reagir('g', msg, '👍')).toEqual({ url: '/api/atendimento/reagir', body: { slug: 'g', msgId: 'M1', emoji: '👍' } });
    expect(r.enviarTexto('g', null, 'oi')).toEqual({ url: '/api/atendimento/enviar', body: { slug: 'g', texto: 'oi' } });
    expect(r.enviarMidia('g', null)).toEqual({ url: '/api/atendimento/enviar-midia', campos: { slug: 'g' } });
    expect(r.visto('g', 'X')).toEqual({ url: '/api/atendimento/visto', body: { slug: 'g' } });
    expect(r.recursos).toEqual({ copiloto: false, time: false });
    expect(r.aoNaoAutenticado).toBe(true);
  });
});

describe('destinoSemSessao', () => {
  it('atendimento: 401 leva ao login voltando pra onde estava', () => {
    expect(destinoSemSessao(rotasPainel('atendimento'), 401, '/atendimento/g/grupo-a')).toBe('/login?next=%2Fatendimento%2Fg%2Fgrupo-a');
  });
  it('atendimento: outros status não mexem na navegação', () => {
    for (const s of [200, 403, 404, 422, 500]) expect(destinoSemSessao(rotasPainel('atendimento'), s, '/atendimento')).toBeNull();
  });
  it('dono: nunca redireciona (comportamento de sempre)', () => {
    expect(destinoSemSessao(rotasPainel('dono'), 401, '/g/grupo-a')).toBeNull();
  });
});
