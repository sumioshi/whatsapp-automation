import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { InboundMessage } from '../core/message.js';
import { BaileysGateway } from './gateway.js';

type Priv = { sock: unknown; echoSent(jid: string, sent: unknown): void };

async function makeGateway() {
  const base = await mkdtemp(join(tmpdir(), 'wac-gw-echo-'));
  await mkdir(join(base, 'auth'));
  await mkdir(join(base, 'data'));
  const gw = new BaileysGateway(join(base, 'auth'), join(base, 'data'));
  (gw as unknown as Priv).sock = { user: { id: '5511888888888:2@s.whatsapp.net' } };
  return gw;
}

describe('eco do próprio envio', () => {
  it('mensagem que o coletor mesmo enviou sai com origem coletor (mesmo com id de cliente web)', async () => {
    const gw = await makeGateway();
    const vistas: InboundMessage[] = [];
    gw.onMessage((m) => vistas.push(m));
    (gw as unknown as Priv).echoSent('5511999999999@s.whatsapp.net', {
      key: {
        remoteJid: '5511999999999@s.whatsapp.net',
        fromMe: true,
        id: '3EB0AAAAAAAAAAAAAAAAAA',
      },
      message: { conversation: 'oi' },
      messageTimestamp: 1_700_000_000,
    });
    expect(vistas).toHaveLength(1);
    expect(vistas[0]?.origem).toBe('coletor');
  });
  it('envio do painel sai carimbado com ator e usuario', async () => {
    const gw = await makeGateway();
    const vistas: InboundMessage[] = [];
    gw.onMessage((m) => vistas.push(m));
    (gw as unknown as Priv).echoSent(
      '5511999999999@s.whatsapp.net',
      {
        key: {
          remoteJid: '5511999999999@s.whatsapp.net',
          fromMe: true,
          id: '3EB0BBBBBBBBBBBBBBBBBB',
        },
        message: { conversation: 'oi' },
        messageTimestamp: 1_700_000_000,
      },
      { ator: 'painel', usuario: 'ana' },
    );
    expect(vistas[0]).toMatchObject({ origem: 'coletor', ator: 'painel', usuario: 'ana' });
  });
});
