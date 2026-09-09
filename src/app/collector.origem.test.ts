import { describe, expect, it } from 'vitest';
import type { GroupConfig } from '../config/groups.js';
import type { InboundMessage, MessageRecord } from '../core/message.js';
import type { MessageStore } from '../core/ports.js';
import type { PresenceStore } from '../storage/presenceStore.js';
import { Collector } from './collector.js';

function msg(over: Partial<InboundMessage>): InboundMessage {
  return {
    id: 'ID1',
    groupJid: '5511999999999@s.whatsapp.net',
    groupName: 'Fulano',
    isDirect: true,
    conversationSlug: 'dm-5511999999999',
    sender: '5511888888888@s.whatsapp.net',
    senderName: 'Você',
    fromMe: true,
    timestamp: new Date('2026-09-09T12:00:00Z'),
    type: 'text',
    text: 'oi',
    quotedText: null,
    quotedSender: null,
    media: null,
    ...over,
  };
}

function collector(gravadas: MessageRecord[]) {
  const store = {
    saveRecord: async (_slug: string, r: MessageRecord) => {
      gravadas.push(r);
    },
  } as unknown as MessageStore;
  const groups = { isWatched: () => true } as unknown as GroupConfig;
  return new Collector(store, groups, {} as PresenceStore);
}

describe('Collector grava origem', () => {
  it('origem presente vai pro registro', async () => {
    const gravadas: MessageRecord[] = [];
    await collector(gravadas).handle(msg({ origem: 'celular' }));
    expect(gravadas[0]?.origem).toBe('celular');
  });

  it('sem origem (mensagem recebida) o registro não ganha a chave', async () => {
    const gravadas: MessageRecord[] = [];
    await collector(gravadas).handle(msg({ fromMe: false, origem: undefined }));
    expect('origem' in (gravadas[0] ?? {})).toBe(false);
  });
});
