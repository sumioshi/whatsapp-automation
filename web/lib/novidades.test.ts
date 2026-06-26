import { describe, expect, it } from 'vitest';
import type { Contacts } from './contacts';
import type { MessageView } from './data';
import { selectNew } from './novidades';

const contacts = {
  names: new Map<string, string>(),
  ownIds: new Set(['5500']), // eu
  teamIds: new Set(['5511']), // meu time
  phones: new Map<string, string>(),
  lids: new Set<string>(),
  hasSidecar: false,
} as Contacts;

/** MessageView mínima pro selectNew (só os campos que ele lê). */
function msg(p: Partial<MessageView> & { timestamp: string; sender: string }): MessageView {
  return {
    id: p.sender + p.timestamp,
    group: 'G',
    groupJid: 'g@g.us',
    senderName: p.senderName ?? p.sender,
    type: p.type ?? 'text',
    text: p.text ?? 'oi',
    quotedText: null,
    mediaPath: null,
    transcript: null,
    reactions: [],
    receipt: null,
    poll: null,
    ...p,
  } as MessageView;
}

const ME = '5500@s.whatsapp.net';
const TEAM = '5511@s.whatsapp.net';
const CLIENT = '5522@s.whatsapp.net';

describe('selectNew', () => {
  it('pega só mensagens de cliente após o since (estrito)', () => {
    const msgs = [
      msg({ timestamp: '2026-06-24T10:00:00.000Z', sender: CLIENT, text: 'antiga' }),
      msg({ timestamp: '2026-06-24T11:00:00.000Z', sender: CLIENT, text: 'no since' }),
      msg({ timestamp: '2026-06-24T12:00:00.000Z', sender: CLIENT, text: 'nova' }),
    ];
    const { mensagens, latest } = selectNew(msgs, '2026-06-24T11:00:00.000Z', contacts);
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0].texto).toBe('nova');
    expect(latest).toBe('2026-06-24T12:00:00.000Z');
  });

  it('descarta fromMe e mensagens do meu time, mas avança o checkpoint até o fim', () => {
    const msgs = [
      msg({ timestamp: '2026-06-24T12:00:00.000Z', sender: CLIENT, text: 'cliente' }),
      msg({ timestamp: '2026-06-24T12:01:00.000Z', sender: TEAM, text: 'time' }),
      msg({ timestamp: '2026-06-24T12:02:00.000Z', sender: ME, fromMe: true, text: 'eu' }),
    ];
    const { mensagens, latest } = selectNew(msgs, undefined, contacts);
    expect(mensagens.map((m) => m.texto)).toEqual(['cliente']);
    // latest avança até a última (mesmo sendo minha) pra não re-escanear depois.
    expect(latest).toBe('2026-06-24T12:02:00.000Z');
  });

  it('since ausente traz todas as de cliente', () => {
    const msgs = [
      msg({ timestamp: '2026-06-24T09:00:00.000Z', sender: CLIENT, text: 'a' }),
      msg({ timestamp: '2026-06-24T10:00:00.000Z', sender: CLIENT, text: 'b' }),
    ];
    expect(selectNew(msgs, undefined, contacts).mensagens).toHaveLength(2);
  });

  it('rotula mídia sem texto', () => {
    const msgs = [msg({ timestamp: '2026-06-24T12:00:00.000Z', sender: CLIENT, type: 'audio', text: '' })];
    expect(selectNew(msgs, undefined, contacts).mensagens[0].texto).toBe('[áudio]');
  });

  it('nada novo → vazio e latest null', () => {
    const msgs = [msg({ timestamp: '2026-06-24T09:00:00.000Z', sender: CLIENT })];
    const r = selectNew(msgs, '2026-06-24T10:00:00.000Z', contacts);
    expect(r.mensagens).toEqual([]);
    expect(r.latest).toBeNull();
    expect(r.ignoradasNaoCliente).toBe(0);
  });

  it('inclui o reply (citacao/citacao_de) quando a msg responde outra', () => {
    const msgs = [
      msg({
        timestamp: '2026-06-24T12:00:00.000Z',
        sender: CLIENT,
        text: 'pode sim',
        quotedText: 'consigo entregar amanhã?',
        quotedSender: '5500@s.whatsapp.net',
      }),
    ];
    const r = selectNew(msgs, undefined, contacts);
    expect(r.mensagens[0].citacao).toBe('consigo entregar amanhã?');
    expect(r.mensagens[0].citacao_de).toBeDefined();
  });

  it('sem reply, citacao fica ausente', () => {
    const msgs = [msg({ timestamp: '2026-06-24T12:00:00.000Z', sender: CLIENT, text: 'oi' })];
    const r = selectNew(msgs, undefined, contacts);
    expect(r.mensagens[0].citacao).toBeUndefined();
    expect(r.mensagens[0].citacao_de).toBeUndefined();
  });

  it('conta as ignoradas por papel (grupo interno: só team) sem contar fromMe', () => {
    // o caso real que deu atrito: grupo onde todos são team → mensagens=0 mas
    // ignoradasNaoCliente>0, pra distinguir de "nada novo".
    const msgs = [
      msg({ timestamp: '2026-06-24T12:00:00.000Z', sender: TEAM, text: 'a' }),
      msg({ timestamp: '2026-06-24T12:01:00.000Z', sender: TEAM, text: 'b' }),
      msg({ timestamp: '2026-06-24T12:02:00.000Z', sender: ME, fromMe: true, text: 'minha' }),
    ];
    const r = selectNew(msgs, undefined, contacts);
    expect(r.mensagens).toEqual([]);
    expect(r.ignoradasNaoCliente).toBe(2); // os 2 do team; a minha (fromMe) não conta
  });
});
