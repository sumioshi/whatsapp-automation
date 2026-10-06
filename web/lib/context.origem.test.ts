import { describe, expect, it } from 'vitest';
import type { Contacts } from './contacts';
import { compact } from './context';
import type { MessageView } from './data';

const contatos: Contacts = {
  names: new Map(),
  ownIds: new Set(['5511888888888']),
  teamIds: new Set(),
  phones: new Map(),
  lids: new Set(),
  hasSidecar: false,
};

function view(over: Partial<MessageView>): MessageView {
  return {
    id: 'ID1',
    timestamp: '2026-09-09T12:00:00.000Z',
    group: 'Fulano',
    groupJid: '5511999999999@s.whatsapp.net',
    sender: '5511888888888@s.whatsapp.net',
    senderName: 'Você',
    fromMe: true,
    type: 'text',
    text: 'oi',
    quotedText: null,
    quotedSender: null,
    mediaPath: null,
    transcript: null,
    reactions: [],
    receipt: null,
    poll: null,
    ...over,
  };
}

describe('compact — origem', () => {
  it('repassa origem quando existe', () => {
    expect(compact(view({ origem: 'celular' }), contatos).origem).toBe('celular');
  });

  it('sem origem a chave não aparece', () => {
    expect('origem' in compact(view({}), contatos)).toBe(false);
  });

  it('envio de pessoa pelo painel vira "<login> (painel)" e expõe ator/usuario', () => {
    const c = compact(view({ origem: 'coletor', ator: 'painel', usuario: 'ana' }), contatos);
    expect(c.de).toBe('ana (painel)');
    expect(c.ator).toBe('painel');
    expect(c.usuario).toBe('ana');
  });

  it('sem ator mantém o remetente e as chaves ausentes', () => {
    const c = compact(view({ origem: 'coletor' }), contatos);
    expect(c.de).toBe('Você');
    expect('ator' in c).toBe(false);
    expect('usuario' in c).toBe(false);
  });

  it('ia_meta troca o remetente por "IA da Meta"', () => {
    const c = compact(view({ origem: 'ia_meta' }), contatos);
    expect(c.de).toBe('IA da Meta');
    expect(c.origem).toBe('ia_meta');
  });
});
