import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireOrcaRelayLock, orcaRelayLockFile, renewOrcaRelayLock } from './orca-relay';

let tmp: string;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-orca-relay-'));
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('lock do relay por destino', () => {
  it('destinos diferentes usam arquivos diferentes; barra final não muda o nome', () => {
    const a = orcaRelayLockFile({ url: 'https://business.example' });
    const b = orcaRelayLockFile({ url: 'https://pessoal.example' });
    expect(a).not.toBe(b);
    expect(orcaRelayLockFile({ url: 'https://business.example/' })).toBe(a);
    expect(a).toMatch(/wac-orca-relay-[0-9a-f]{8}\.lock$/);
  });

  it('o dono mantém o lock sem regravar; outro pid só entra quando o lock envelhece', async () => {
    const lock = join(tmp, 'a.lock');
    expect(await acquireOrcaRelayLock(lock, 100)).toBe(true);
    const gravado = await readFile(lock, 'utf8');

    // Dono de novo: aceita sem renovar o timestamp.
    expect(await acquireOrcaRelayLock(lock, 100)).toBe(true);
    expect(await readFile(lock, 'utf8')).toBe(gravado);

    // Outro processo, lock fresco: recusa.
    expect(await acquireOrcaRelayLock(lock, 200)).toBe(false);

    // Lock velho (dono parou de renovar): outro processo assume.
    await writeFile(lock, JSON.stringify({ pid: 100, ts: Date.now() - 13_000 }), 'utf8');
    expect(await acquireOrcaRelayLock(lock, 200)).toBe(true);
    expect(JSON.parse(await readFile(lock, 'utf8')).pid).toBe(200);
  });

  it('renovar atualiza o timestamp do dono', async () => {
    const lock = join(tmp, 'b.lock');
    await writeFile(lock, JSON.stringify({ pid: 7, ts: 1 }), 'utf8');
    await renewOrcaRelayLock(lock, 7);
    const { pid, ts } = JSON.parse(await readFile(lock, 'utf8')) as { pid: number; ts: number };
    expect(pid).toBe(7);
    expect(Date.now() - ts).toBeLessThan(5000);
  });

  it('lock corrompido é tratado como livre', async () => {
    const lock = join(tmp, 'c.lock');
    await writeFile(lock, '{broken', 'utf8');
    expect(await acquireOrcaRelayLock(lock, 300)).toBe(true);
  });
});
