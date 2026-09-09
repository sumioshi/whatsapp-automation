import { describe, expect, it } from 'vitest';
import { origemDe } from './origem.js';

function wa(over: { fromMe?: boolean; id?: string; bot?: boolean; biz?: boolean }) {
  return {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      fromMe: over.fromMe ?? true,
      id: over.id ?? '2AA364FEE9990F4C1BC5',
    },
    message: over.bot
      ? { conversation: 'x', messageContextInfo: { botMetadata: { personaId: 'p' } } }
      : { conversation: 'x' },
    is1PBizBotMessage: over.biz ?? null,
  };
}

describe('origemDe', () => {
  it('mensagem recebida (não fromMe) não tem origem', () => {
    expect(origemDe(wa({ fromMe: false }))).toBeUndefined();
  });

  it('fromMe com id de 20 hex (aparelho principal) é celular', () => {
    expect(origemDe(wa({ id: '2AA364FEE9990F4C1BC5' }))).toBe('celular');
  });

  it('fromMe com id 3EB0 + 18 hex (cliente web) é web', () => {
    expect(origemDe(wa({ id: '3EB0608D240A0F7CCFAE12' }))).toBe('web');
  });

  it('bot de negócios da Meta (is1PBizBotMessage) é ia_meta', () => {
    expect(origemDe(wa({ biz: true }))).toBe('ia_meta');
  });

  it('botMetadata no contexto é ia_meta mesmo sem fromMe', () => {
    expect(origemDe(wa({ fromMe: false, bot: true }))).toBe('ia_meta');
  });
});
