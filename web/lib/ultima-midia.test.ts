import { describe, expect, it } from 'vitest';
import type { MessageView } from './data';
import { ultimaMidiaPath } from './ultima-midia';

function m(p: { type: string; mediaPath?: string | null; ts: string }): MessageView {
  return {
    id: p.ts,
    group: 'G',
    timestamp: p.ts,
    type: p.type,
    text: '',
    mediaPath: p.mediaPath ?? null,
    transcript: null,
  } as MessageView;
}

const MSGS = [
  m({ type: 'text', ts: '1' }),
  m({ type: 'image', mediaPath: 'G/image/foto1.jpg', ts: '2' }),
  m({ type: 'audio', mediaPath: 'G/audio/a1.ogg', ts: '3' }),
  m({ type: 'image', mediaPath: 'G/image/foto2.jpg', ts: '4' }),
  m({ type: 'text', ts: '5' }),
];

describe('ultimaMidiaPath', () => {
  it('pega a ÚLTIMA imagem (foto2, não foto1)', () => {
    expect(ultimaMidiaPath(MSGS, ['image', 'sticker'])).toBe('G/image/foto2.jpg');
  });

  it('pega a última de outro tipo (áudio)', () => {
    expect(ultimaMidiaPath(MSGS, ['audio', 'video'])).toBe('G/audio/a1.ogg');
  });

  it('null quando não há mídia do tipo', () => {
    expect(ultimaMidiaPath(MSGS, ['document'])).toBeNull();
  });

  it('ignora mensagem do tipo certo mas sem mediaPath', () => {
    const msgs = [m({ type: 'image', mediaPath: null, ts: '1' })];
    expect(ultimaMidiaPath(msgs, ['image'])).toBeNull();
  });

  it('lista vazia → null', () => {
    expect(ultimaMidiaPath([], ['image'])).toBeNull();
  });
});
