import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BaileysGateway } from './gateway.js';

type Update = { connection?: 'open' | 'close' | 'connecting'; qr?: string };
type Priv = {
  onConnectionUpdate: (u: Update) => void;
  sock: { requestPairingCode: ReturnType<typeof vi.fn> } | null;
  refreshGroups: () => Promise<void>;
};

async function makeGateway(pairNumber?: string) {
  const base = await mkdtemp(join(tmpdir(), 'wac-gw-pair-'));
  const authDir = join(base, 'auth');
  const dataDir = join(base, 'data');
  await mkdir(authDir);
  await mkdir(dataDir);
  const gw = new BaileysGateway(authDir, dataDir, pairNumber);
  const priv = gw as unknown as Priv;
  const requestPairingCode = vi.fn().mockResolvedValue('ABCD1234');
  priv.sock = { requestPairingCode };
  priv.refreshGroups = vi.fn().mockResolvedValue(undefined);
  return { priv, requestPairingCode };
}

describe('pareamento por código (PAIR_NUMBER)', () => {
  it('pede o código quando chega um QR (sessão não autenticada), uma vez por socket', async () => {
    const { priv, requestPairingCode } = await makeGateway('5511999999999');
    priv.onConnectionUpdate({ qr: 'qr-1' });
    priv.onConnectionUpdate({ qr: 'qr-2' }); // rotação do QR não repete o pedido
    expect(requestPairingCode).toHaveBeenCalledTimes(1);
    expect(requestPairingCode).toHaveBeenCalledWith('5511999999999');
  });

  it('NÃO pede o código quando a conexão abre sem QR (sessão pareada pelo QR)', async () => {
    const { priv, requestPairingCode } = await makeGateway('5511999999999');
    priv.onConnectionUpdate({ connection: 'connecting' });
    priv.onConnectionUpdate({ connection: 'open' });
    expect(requestPairingCode).not.toHaveBeenCalled();
  });

  it('sem PAIR_NUMBER nunca pede código', async () => {
    const { priv, requestPairingCode } = await makeGateway(undefined);
    priv.onConnectionUpdate({ qr: 'qr-1' });
    expect(requestPairingCode).not.toHaveBeenCalled();
  });
});
