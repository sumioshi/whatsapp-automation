import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DisconnectReason } from 'baileys';
import { describe, expect, it, vi } from 'vitest';
import type { GatewayStatus } from '../core/message.js';
import { BaileysGateway } from './gateway.js';

async function makeGateway(): Promise<{
  gw: BaileysGateway;
  authDir: string;
  statuses: GatewayStatus[];
  connectStub: ReturnType<typeof vi.fn>;
}> {
  const base = await mkdtemp(join(tmpdir(), 'wac-gw-logout-'));
  const authDir = join(base, 'auth');
  const dataDir = join(base, 'data');
  await mkdir(authDir);
  await mkdir(dataDir);
  await writeFile(join(authDir, 'creds.json'), '{"registered":true}', 'utf8');
  const gw = new BaileysGateway(authDir, dataDir);
  const statuses: GatewayStatus[] = [];
  gw.onStatus((s) => statuses.push(s));
  const connectStub = vi.fn().mockResolvedValue(undefined);
  // Evita rede: o teste valida a decisão do onClose, não o socket do Baileys.
  (gw as unknown as { connect: typeof connectStub }).connect = connectStub;
  return { gw, authDir, statuses, connectStub };
}

function closeUpdate(statusCode: number) {
  return {
    connection: 'close' as const,
    lastDisconnect: {
      error: { output: { statusCode } } as unknown as Error,
      date: new Date(),
    },
  };
}

describe('BaileysGateway em loggedOut', () => {
  it('arquiva o auth, emite logged_out e volta a conectar (modo pareamento)', async () => {
    const { gw, authDir, statuses, connectStub } = await makeGateway();

    (gw as unknown as { onConnectionUpdate: (u: unknown) => void }).onConnectionUpdate(
      closeUpdate(DisconnectReason.loggedOut),
    );

    await vi.waitFor(() => expect(connectStub).toHaveBeenCalled());
    await expect(access(authDir)).rejects.toThrow();
    expect(statuses.some((s) => s.connection === 'logged_out')).toBe(true);
    expect(statuses.some((s) => s.connection === 'close')).toBe(false);
  });

  it('close comum não arquiva o auth e emite close', async () => {
    vi.useFakeTimers();
    try {
      const { gw, authDir, statuses } = await makeGateway();

      (gw as unknown as { onConnectionUpdate: (u: unknown) => void }).onConnectionUpdate(
        closeUpdate(DisconnectReason.connectionClosed),
      );

      await expect(access(authDir)).resolves.toBeUndefined();
      expect(statuses.some((s) => s.connection === 'close')).toBe(true);
      expect(statuses.some((s) => s.connection === 'logged_out')).toBe(false);
      const timer = (gw as unknown as { reconnectTimer: NodeJS.Timeout | null }).reconnectTimer;
      expect(timer).not.toBeNull();
      if (timer) clearTimeout(timer);
    } finally {
      vi.useRealTimers();
    }
  });
});
