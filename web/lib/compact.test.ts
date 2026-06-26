import { describe, expect, it } from 'vitest';
import { compact } from './context';
import type { Contacts } from './contacts';
import type { MessageView } from './data';

const c = {
  names: new Map<string, string>(),
  ownIds: new Set<string>(),
  teamIds: new Set<string>(),
  phones: new Map<string, string>(),
  lids: new Set<string>(),
  hasSidecar: false,
} as Contacts;

function msg(p: Partial<MessageView> & { type: string }): MessageView {
  return {
    id: 'x',
    group: 'G',
    groupJid: 'g@g.us',
    sender: '5522@s.whatsapp.net',
    senderName: 'Fulano',
    timestamp: '2026-06-26T12:00:00.000Z',
    fromMe: false,
    type: p.type,
    text: p.text ?? '',
    quotedText: null,
    quotedSender: null,
    mediaPath: null,
    transcript: null,
    reactions: [],
    receipt: null,
    poll: null,
    ...p,
  } as MessageView;
}

describe('compact — legenda vs texto', () => {
  it('texto numa msg de VÍDEO vira legenda (não texto)', () => {
    const r = compact(msg({ type: 'video', text: 'olha a tela de login', mediaPath: 'G/video/v.mp4' }), c);
    expect(r.legenda).toBe('olha a tela de login');
    expect(r.texto).toBeUndefined();
  });

  it('texto numa msg de TEXTO vira texto (não legenda)', () => {
    const r = compact(msg({ type: 'text', text: 'viu? era isso' }), c);
    expect(r.texto).toBe('viu? era isso');
    expect(r.legenda).toBeUndefined();
  });

  it('vídeo SEM legenda não traz nem texto nem legenda', () => {
    const r = compact(msg({ type: 'video', text: '', mediaPath: 'G/video/v.mp4' }), c);
    expect(r.texto).toBeUndefined();
    expect(r.legenda).toBeUndefined();
  });

  it('imagem com caption também vira legenda', () => {
    const r = compact(msg({ type: 'image', text: 'quem vc acha que ganha?', mediaPath: 'G/image/i.jpg' }), c);
    expect(r.legenda).toBe('quem vc acha que ganha?');
    expect(r.texto).toBeUndefined();
  });
});

describe('compact — midia_pendente', () => {
  it('mídia sem arquivo local marca midia_pendente (está na nuvem)', () => {
    const r = compact(msg({ type: 'video', mediaPath: null }), c);
    expect(r.midia_pendente).toBe(true);
  });

  it('mídia COM arquivo não marca pendente', () => {
    const r = compact(msg({ type: 'video', mediaPath: 'G/video/v.mp4' }), c);
    expect(r.midia_pendente).toBeUndefined();
  });

  it('texto nunca marca pendente (não tem arquivo)', () => {
    const r = compact(msg({ type: 'text', text: 'oi', mediaPath: null }), c);
    expect(r.midia_pendente).toBeUndefined();
  });

  it('location (não-texto sem arquivo) não marca pendente', () => {
    const r = compact(msg({ type: 'location', mediaPath: null }), c);
    expect(r.midia_pendente).toBeUndefined();
  });
});
