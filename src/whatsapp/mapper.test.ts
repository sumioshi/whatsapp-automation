import type { WAMessage, WASocket } from 'baileys';
import { describe, expect, it } from 'vitest';
import { mapMessage, mapPoll, mapReaction } from './mapper.js';

// Em DM o WhatsApp manda `key.participant` como string vazia (não nulo): o
// remetente tem que cair no `remoteJid`, como quando o campo vinha ausente.
const DM = '5511999999999@s.whatsapp.net';
const sock = { user: { id: '5511888888888:2@s.whatsapp.net' } } as unknown as WASocket;

function recebidaNaDm(extra: Partial<WAMessage> = {}): WAMessage {
  return {
    key: { remoteJid: DM, fromMe: false, id: 'ABC123', participant: '' },
    message: { conversation: 'oi' },
    messageTimestamp: 1_700_000_000,
    pushName: 'Fulano',
    ...extra,
  } as WAMessage;
}

describe('remetente em DM com participant vazio', () => {
  it('mensagem recebida fica com o remoteJid como remetente', () => {
    const m = mapMessage(recebidaNaDm(), sock, 'Fulano');
    expect(m?.sender).toBe(DM);
  });

  it('sem pushName, o nome não sai vazio', () => {
    const m = mapMessage(recebidaNaDm({ pushName: null }), sock, 'Fulano');
    expect(m?.senderName).toBe('desconhecido');
  });

  it('citação com participant vazio não vira autor vazio', () => {
    const m = mapMessage(
      recebidaNaDm({
        message: {
          extendedTextMessage: {
            text: 'resposta',
            contextInfo: { quotedMessage: { conversation: 'original' }, participant: '' },
          },
        },
      }),
      sock,
      'Fulano',
    );
    expect(m?.quotedText).toBe('original');
    expect(m?.quotedSender).toBeNull();
  });

  it('em grupo o participant continua sendo o remetente', () => {
    const m = mapMessage(
      recebidaNaDm({
        key: {
          remoteJid: '120363000000000000@g.us',
          fromMe: false,
          id: 'GRP1',
          participant: '5511777777777@s.whatsapp.net',
        },
      }),
      sock,
      'Grupo',
    );
    expect(m?.sender).toBe('5511777777777@s.whatsapp.net');
  });

  it('reação na DM fica com o remoteJid como autor', () => {
    const r = mapReaction(
      {
        key: { remoteJid: DM, id: 'ALVO1' },
        reaction: {
          key: { remoteJid: DM, fromMe: false, participant: '' },
          text: '👍',
          senderTimestampMs: 1_700_000_000_000,
        },
      },
      'Fulano',
    );
    expect(r?.reactor).toBe(DM);
    expect(r?.reactorName).toBe('5511999999999');
  });

  it('enquete na DM fica com o remoteJid como autor', () => {
    const p = mapPoll(
      recebidaNaDm({
        message: {
          pollCreationMessageV3: {
            name: 'Qual dia?',
            options: [{ optionName: 'segunda' }, { optionName: 'terça' }],
            selectableOptionsCount: 1,
          },
          messageContextInfo: { messageSecret: new Uint8Array(32).fill(7) },
        },
      }),
      'Fulano',
    );
    expect(p?.creatorJid).toBe(DM);
  });
});
