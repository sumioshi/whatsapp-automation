import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { InboundDelete } from '../core/message.js';
import { BaileysGateway } from './gateway.js';

// Em DM o WhatsApp manda `key.participant` como string vazia: quem apagou e o
// contato aprendido têm que vir do `remoteJid`, como quando o campo vinha ausente.
type Priv = {
  sock: unknown;
  handleRevoke(jid: string, targetId: string, key: { participant?: string | null }): void;
  captureSenderFromMessage(wa: unknown): void;
};

async function makeGateway() {
  const base = await mkdtemp(join(tmpdir(), 'wac-gw-remetente-'));
  await mkdir(join(base, 'auth'));
  await mkdir(join(base, 'data'));
  const gw = new BaileysGateway(join(base, 'auth'), join(base, 'data'));
  (gw as unknown as Priv).sock = { user: { id: '5511888888888:2@s.whatsapp.net' } };
  return gw;
}

describe('DM com participant vazio no gateway', () => {
  it('mensagem apagada na DM sai com o contato como autor', async () => {
    const gw = await makeGateway();
    const apagadas: InboundDelete[] = [];
    gw.onDelete((d) => apagadas.push(d));
    (gw as unknown as Priv).handleRevoke('5511999999999@s.whatsapp.net', 'ALVO1', {
      participant: '',
    });
    expect(apagadas[0]?.by).toBe('5511999999999@s.whatsapp.net');
  });

  it('mensagem recebida na DM por LID liga o LID ao telefone', async () => {
    const gw = await makeGateway();
    (gw as unknown as Priv).captureSenderFromMessage({
      key: {
        remoteJid: '111122223333444@lid',
        remoteJidAlt: '5511999999999@s.whatsapp.net',
        participant: '',
        fromMe: false,
        id: 'MSG1',
      },
      message: { conversation: 'oi' },
      pushName: 'Fulano',
    });
    expect(gw.phoneOfContact('111122223333444')).toBe('5511999999999');
  });
});
