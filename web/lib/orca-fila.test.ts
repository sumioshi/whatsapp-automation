import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OrcaPendingCommand } from './orca-bridge';

// A fila mora em DATA_DIR (resolvido no import de ./paths): fixa o env antes de importar.
let tmp: string;
let mod: typeof import('./orca-bridge');

const cmd = (id: string, p: Partial<OrcaPendingCommand> = {}): OrcaPendingCommand => ({
  id,
  createdAt: new Date().toISOString(),
  acao: 'enviar_prompt',
  text: `prompt ${id}`,
  ...p,
});

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-orca-fila-'));
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./orca-bridge');
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('fila remota da ponte Orca', () => {
  it('enfileira e consome na ordem; a fila fica vazia e os resultados gravados', async () => {
    await mod.enqueueRemoteOrcaCommand(cmd('a'));
    await mod.enqueueRemoteOrcaCommand(cmd('b'));
    const entregues = await mod.consumePendingAndSaveResults([
      { id: 'antigo', ok: true, completedAt: new Date().toISOString() },
    ]);
    expect(entregues.map((c) => c.id)).toEqual(['a', 'b']);
    const fila = await mod.readRemoteQueue();
    expect(fila.pending).toEqual([]);
    expect(fila.results.antigo?.ok).toBe(true);
  });

  it('comando com mais de 3 min na fila não é entregue: vira resultado "expirado"', async () => {
    const velho = cmd('velho', { createdAt: new Date(Date.now() - 4 * 60_000).toISOString() });
    await mod.enqueueRemoteOrcaCommand(velho);
    await mod.enqueueRemoteOrcaCommand(cmd('novo'));
    mod.enqueueVolatileOrcaCommand(
      cmd('tecla-velha', { acao: 'enviar_teclas', createdAt: new Date(Date.now() - 10 * 60_000).toISOString() }),
    );
    const entregues = await mod.consumePendingAndSaveResults();
    expect(entregues.map((c) => c.id)).toEqual(['novo']);
    const fila = await mod.readRemoteQueue();
    expect(fila.results.velho).toMatchObject({ ok: false, error: 'expirado' });
    expect(fila.results['tecla-velha']).toMatchObject({ ok: false, error: 'expirado' });
    expect(mod.comandoExpirado(cmd('x', { createdAt: 'lixo' }))).toBe(true);
  });

  it('ações secretas (pairing code, teclas) ficam fora do arquivo da fila', async () => {
    expect(mod.isSecretOrcaAction('parear_ambiente')).toBe(true);
    expect(mod.isSecretOrcaAction('enviar_teclas')).toBe(true);
    expect(mod.isSecretOrcaAction('enviar_prompt')).toBe(false);

    mod.enqueueVolatileOrcaCommand(cmd('t1', { acao: 'enviar_teclas', data: 'segredo-digitado' }));
    const disco = await readFile(join(tmp, 'data', '.orca-remote-queue.json'), 'utf8');
    expect(disco).not.toContain('segredo-digitado');
    const entregues = await mod.consumePendingAndSaveResults();
    expect(entregues.map((c) => c.id)).toEqual(['t1']);
  });

  it('corrida: enfileirar durante o consume não perde comando', async () => {
    // Dispara 25 enqueues e 5 consumes intercalados, sem esperar um pelo outro.
    const ids = Array.from({ length: 25 }, (_, i) => `r${i}`);
    const operacoes: Promise<unknown>[] = [];
    const entregues: string[] = [];
    for (const [i, id] of ids.entries()) {
      operacoes.push(mod.enqueueRemoteOrcaCommand(cmd(id)));
      if (i % 5 === 4) {
        operacoes.push(
          mod.consumePendingAndSaveResults().then((lista) => {
            entregues.push(...lista.map((c) => c.id));
          }),
        );
      }
    }
    await Promise.all(operacoes);
    entregues.push(...(await mod.consumePendingAndSaveResults()).map((c) => c.id));
    expect([...entregues].sort()).toEqual([...ids].sort());
    expect(new Set(entregues).size).toBe(ids.length);
  });
});
