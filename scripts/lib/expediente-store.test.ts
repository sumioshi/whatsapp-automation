import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXPEDIENTE_DEFAULT,
  gravarEstadoAplicado,
  lerEstadoAplicado,
  lerExpediente,
} from './expediente-store';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wac-exp-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('lerExpediente', () => {
  it('arquivo ausente → default (ativo:false)', async () => {
    const cfg = await lerExpediente(dir);
    expect(cfg.ativo).toBe(false);
    expect(cfg.timezone).toBe(EXPEDIENTE_DEFAULT.timezone);
    expect(cfg.dias.seg).toEqual(['09:00', '18:00']);
  });

  it('merge: arquivo parcial preenche o resto com default', async () => {
    await writeFile(
      join(dir, 'expediente.json'),
      JSON.stringify({ ativo: true, recado_fora: 'Volto segunda' }),
      'utf8',
    );
    const cfg = await lerExpediente(dir);
    expect(cfg.ativo).toBe(true);
    expect(cfg.recado_fora).toBe('Volto segunda');
    // não veio no arquivo → default
    expect(cfg.timezone).toBe(EXPEDIENTE_DEFAULT.timezone);
    expect(cfg.recado_dentro).toBe(EXPEDIENTE_DEFAULT.recado_dentro);
  });

  it('JSON inválido → default (não quebra)', async () => {
    await writeFile(join(dir, 'expediente.json'), '{ não é json', 'utf8');
    const cfg = await lerExpediente(dir);
    expect(cfg.ativo).toBe(false);
  });
});

describe('estado aplicado', () => {
  it('null quando nunca gravado', async () => {
    expect(await lerEstadoAplicado(dir)).toBeNull();
  });

  it('grava e relê (round-trip)', async () => {
    await gravarEstadoAplicado(dir, 'fora');
    expect(await lerEstadoAplicado(dir)).toBe('fora');
    await gravarEstadoAplicado(dir, 'dentro');
    expect(await lerEstadoAplicado(dir)).toBe('dentro');
  });

  it('valor corrompido → null', async () => {
    await writeFile(join(dir, '.expediente-state.json'), JSON.stringify({ estado: 'banana' }), 'utf8');
    expect(await lerEstadoAplicado(dir)).toBeNull();
  });
});
