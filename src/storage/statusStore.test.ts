import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { StatusStore } from './statusStore.js';

async function readStatusFile(dataDir: string): Promise<{ connection: string; qr: string | null }> {
  const raw = await readFile(join(dataDir, '.collector-status.json'), 'utf8');
  return JSON.parse(raw);
}

describe('StatusStore', () => {
  it('persiste o estado logged_out', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'wac-status-'));
    const store = new StatusStore(dataDir);

    await store.setConnection('logged_out', null);

    const status = await readStatusFile(dataDir);
    expect(status.connection).toBe('logged_out');
  });

  it('QR posterior ao logged_out volta o estado para qr', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'wac-status-'));
    const store = new StatusStore(dataDir);

    await store.setConnection('logged_out', null);
    await store.setConnection(undefined, 'QR-DATA');

    const status = await readStatusFile(dataDir);
    expect(status.connection).toBe('qr');
    expect(status.qr).toBe('QR-DATA');
  });
});
