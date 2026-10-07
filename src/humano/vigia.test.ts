import { describe, expect, it } from 'vitest';
import { enfileirar, marcarEntregando, novoEstado, novoTicket, proximo } from './fila-core';
import { aoPresenca, aoReceberMensagem } from './vigia';

const JID = '5511000000001@s.whatsapp.net';
const GRUPO = '120363000000000000@g.us';
const T0 = 1_700_000_000_000;
const rng = () => 0.5;

function estadoCom(jid: string, entregando = false) {
  const e = novoEstado();
  const t = novoTicket({
    id: 't1',
    jid,
    slug: 'chat',
    baloes: ['a', 'b'],
    origem: 'mcp',
    opts: { typos: false, umBalao: false, urgencia: 'normal' },
    criadoEm: T0,
    lerEm: T0 + 5000,
    entregarEm: T0 + 30_000,
    regime: 'ativa',
  });
  enfileirar(e, t, T0);
  if (entregando) marcarEntregando(e, t.id, T0 + 30_000);
  return { e, t };
}

describe('vigia — mensagens', () => {
  it('cliente escreve num chat com ticket agendado: adia e conta', () => {
    const { e, t } = estadoCom(JID);
    const r = aoReceberMensagem(
      e,
      { groupJid: JID, fromMe: false, sender: JID },
      new Set(),
      T0 + 10_000,
      rng,
    );
    expect(r).toEqual({ ticket: t, acao: 'adiou' });
    expect(t.mensagensNovas).toBe(1);
    expect(t.entregarEm).toBeGreaterThan(T0 + 30_000);
  });

  it('cliente escreve durante a entrega: interrompe', () => {
    const { e, t } = estadoCom(JID, true);
    const r = aoReceberMensagem(
      e,
      { groupJid: JID, fromMe: false, sender: JID },
      new Set(),
      T0 + 31_000,
      rng,
    );
    expect(r?.acao).toBe('interrompeu');
    expect(t.motivo).toBe('mensagem_nova');
  });

  it('colega da equipe num grupo não mexe no ticket; cliente no grupo mexe', () => {
    const { e, t } = estadoCom(GRUPO);
    const equipe = new Set(['5511000000009']);
    expect(
      aoReceberMensagem(
        e,
        { groupJid: GRUPO, fromMe: false, sender: '5511000000009:12@s.whatsapp.net' },
        equipe,
        T0 + 1,
        rng,
      ),
    ).toBeNull();
    expect(t.mensagensNovas).toBe(0);
    expect(
      aoReceberMensagem(
        e,
        { groupJid: GRUPO, fromMe: false, sender: '5511000000002@s.whatsapp.net' },
        equipe,
        T0 + 1,
        rng,
      )?.acao,
    ).toBe('adiou');
  });

  it('operador respondeu na mão (origem celular/web): interrompe; eco do coletor não', () => {
    const { e, t } = estadoCom(JID);
    expect(
      aoReceberMensagem(
        e,
        { groupJid: JID, fromMe: true, sender: 'me', origem: 'coletor' },
        new Set(),
        T0 + 1,
        rng,
      ),
    ).toBeNull();
    const r = aoReceberMensagem(
      e,
      { groupJid: JID, fromMe: true, sender: 'me', origem: 'celular' },
      new Set(),
      T0 + 2,
      rng,
    );
    expect(r?.acao).toBe('interrompeu');
    expect(t.motivo).toBe('operador_respondeu');
  });

  it('chat sem ticket: nada', () => {
    const e = novoEstado();
    expect(
      aoReceberMensagem(e, { groupJid: JID, fromMe: false, sender: JID }, new Set(), T0, rng),
    ).toBeNull();
  });

  it('envio de uma pessoa pelo painel interrompe o ticket do agente', () => {
    const { e, t } = estadoCom(JID);
    const r = aoReceberMensagem(
      e,
      { groupJid: JID, fromMe: true, sender: JID, origem: 'coletor', ator: 'painel' },
      new Set(),
      T0 + 10_000,
      rng,
    );
    expect(r?.acao).toBe('interrompeu');
    expect(t.motivo).toBe('operador_respondeu');
  });

  it('eco da própria fila (coletor sem ator) não interrompe', () => {
    const { e } = estadoCom(JID, true);
    const r = aoReceberMensagem(
      e,
      { groupJid: JID, fromMe: true, sender: JID, origem: 'coletor' },
      new Set(),
      T0 + 31_000,
      rng,
    );
    expect(r).toBeNull();
  });
});

describe('vigia — presença', () => {
  it('composing do cliente segura a entrega; paused/available libera', () => {
    const { e } = estadoCom(JID);
    expect(aoPresenca(e, { chatJid: JID, participant: JID, state: 'composing' }, T0 + 30_000)).toBe(
      'digitando',
    );
    expect(proximo(e, T0 + 30_000)).toBeNull();
    expect(aoPresenca(e, { chatJid: JID, participant: JID, state: 'paused' }, T0 + 31_000)).toBe(
      'parou',
    );
    expect(proximo(e, T0 + 31_000)).not.toBeNull();
  });

  it('presença em chat sem ticket é ignorada', () => {
    const e = novoEstado();
    expect(aoPresenca(e, { chatJid: JID, participant: JID, state: 'composing' }, T0)).toBeNull();
  });
});
