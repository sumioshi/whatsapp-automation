import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type ExpedienteConfig,
  foraDoExpediente,
  horaLocal,
  lerExpediente,
  proximaAbertura,
} from './expediente';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wac-humano-exp-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const CFG_BASE = {
  ativo: true,
  timezone: 'America/Sao_Paulo',
  dias: {
    seg: ['09:00', '18:00'],
    ter: ['09:00', '18:00'],
    qua: ['09:00', '18:00'],
    qui: ['09:00', '18:00'],
    sex: ['09:00', '18:00'],
  },
  recado_dentro: 'Disponível',
  recado_fora: 'Fora do expediente',
};

describe('foraDoExpediente', () => {
  it('arquivo ausente → false (nunca lança)', async () => {
    await expect(foraDoExpediente(dir)).resolves.toBe(false);
  });

  it('JSON inválido → false (nunca lança)', async () => {
    await writeFile(join(dir, 'expediente.json'), '{ inválido', 'utf8');
    await expect(foraDoExpediente(dir)).resolves.toBe(false);
  });

  it('ativo: false → false mesmo fora da faixa', async () => {
    await writeFile(
      join(dir, 'expediente.json'),
      JSON.stringify({ ...CFG_BASE, ativo: false }),
      'utf8',
    );
    // quarta 03:00 BRT — fora de qualquer faixa configurada
    const agora = new Date('2026-07-01T06:00:00Z');
    expect(await foraDoExpediente(dir, agora)).toBe(false);
  });

  it('ativo + dentro da faixa do dia → false', async () => {
    await writeFile(join(dir, 'expediente.json'), JSON.stringify(CFG_BASE), 'utf8');
    // quarta 10:00 BRT (2026-07-01 é quarta) = 13:00 UTC
    const agora = new Date('2026-07-01T13:00:00Z');
    expect(await foraDoExpediente(dir, agora)).toBe(false);
  });

  it('ativo + fora da faixa do dia → true', async () => {
    await writeFile(join(dir, 'expediente.json'), JSON.stringify(CFG_BASE), 'utf8');
    // quarta 22:00 BRT = 2026-07-02 01:00 UTC
    const agora = new Date('2026-07-02T01:00:00Z');
    expect(await foraDoExpediente(dir, agora)).toBe(true);
  });

  it('ativo + dia sem faixa configurada (domingo) → true', async () => {
    await writeFile(join(dir, 'expediente.json'), JSON.stringify(CFG_BASE), 'utf8');
    // domingo 2026-06-28 12:00 BRT = 15:00 UTC
    const agora = new Date('2026-06-28T15:00:00Z');
    expect(await foraDoExpediente(dir, agora)).toBe(true);
  });
});

const cfgV2: ExpedienteConfig = {
  ativo: true,
  timezone: 'America/Sao_Paulo',
  dias: { seg: ['09:00', '18:00'], ter: ['09:00', '18:00'] },
  recado_dentro: '',
  recado_fora: '',
  segurarEnvios: true,
};

describe('expediente v2', () => {
  it('horaLocal converte pro fuso', () => {
    expect(horaLocal(new Date('2026-09-14T22:30:00Z'), 'America/Sao_Paulo')).toEqual({
      hora: 19,
      diaSemana: 1,
    });
  });

  it('proximaAbertura: fora à noite de segunda → terça 09:00 local', () => {
    const p = proximaAbertura(new Date('2026-09-14T22:30:00Z'), cfgV2);
    expect(p?.toISOString()).toBe('2026-09-15T12:00:00.000Z');
  });

  it('proximaAbertura: dentro do expediente → null; sem dia configurado → null', () => {
    expect(proximaAbertura(new Date('2026-09-14T15:00:00Z'), cfgV2)).toBeNull();
    expect(proximaAbertura(new Date('2026-09-14T15:00:00Z'), { ...cfgV2, dias: {} })).toBeNull();
  });

  it('lerExpediente lê segurarEnvios/presencaCoerente e devolve null sem arquivo', async () => {
    expect(await lerExpediente(dir)).toBeNull();
    await writeFile(
      join(dir, 'expediente.json'),
      JSON.stringify({ ...cfgV2, presencaCoerente: false }),
    );
    const lido = await lerExpediente(dir);
    expect(lido?.segurarEnvios).toBe(true);
    expect(lido?.presencaCoerente).toBe(false);
  });
});
