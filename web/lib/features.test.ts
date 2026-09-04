import { appendFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let tmp: string;
let mod: typeof import('./features');
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-features-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./features');
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

describe('registrarFeature / listarFeatures', () => {
  it('grava, gera id e em, normaliza slug, default origem mcp', async () => {
    const r = await mod.registrarFeature({ slug: 'Cliente A', nome: 'Exportar PDF', ref: 'https://github.com/o/r/pull/1' });
    expect(r.duplicada).toBe(false);
    expect(r.feature).toMatchObject({ slug: 'cliente-a', nome: 'Exportar PDF', origem: 'mcp', por: null });
    expect(r.feature.id).toMatch(/^\d{13}-[a-z0-9]{6}$/);
    expect(Number.isNaN(Date.parse(r.feature.em))).toBe(false);
  });
  it('mesma ref em chats diferentes são entregas distintas', async () => {
    // `ref` é texto livre no MCP: "issue 12" em dois clientes não é a mesma entrega.
    const a = await mod.registrarFeature({ slug: 'cliente-x', nome: 'Login', ref: 'issue 12' });
    const b = await mod.registrarFeature({ slug: 'cliente-y', nome: 'Relatório', ref: 'issue 12' });
    expect(a.duplicada).toBe(false);
    expect(b.duplicada).toBe(false);
    expect(b.feature.nome).toBe('Relatório');
    // Repetir no MESMO chat continua deduplicando.
    const c = await mod.registrarFeature({ slug: 'cliente-y', nome: 'outro nome', ref: 'issue 12' });
    expect(c.duplicada).toBe(true);
    expect(c.feature.nome).toBe('Relatório');
  });
  it('mesmo ref não duplica; ref null nunca deduplica', async () => {
    const dup = await mod.registrarFeature({ slug: 'cliente-a', nome: 'outro nome', ref: 'https://github.com/o/r/pull/1', origem: 'pr' });
    expect(dup.duplicada).toBe(true);
    expect(dup.feature.nome).toBe('Exportar PDF');
    await mod.registrarFeature({ slug: 'cliente-a', nome: 'sem ref 1' });
    await mod.registrarFeature({ slug: 'cliente-a', nome: 'sem ref 2' });
    expect((await mod.listarFeatures({ slug: 'cliente-a' })).length).toBe(3);
  });
  it('filtra por slug e desde; ignora linha corrompida', async () => {
    await mod.registrarFeature({ slug: 'cliente-b', nome: 'antiga', em: '2026-01-01T00:00:00.000Z' });
    await appendFile(join(tmp, 'data', 'features.jsonl'), '{lixo\n');
    const b = await mod.listarFeatures({ slug: 'cliente-b' });
    expect(b.map((f) => f.nome)).toEqual(['antiga']);
    expect((await mod.listarFeatures({ desde: '2026-06-01T00:00:00.000Z' })).some((f) => f.nome === 'antiga')).toBe(false);
  });
  it('recusa nome vazio ou slug vazio', async () => {
    await expect(mod.registrarFeature({ slug: '', nome: 'x' })).rejects.toThrow(/slug/);
    await expect(mod.registrarFeature({ slug: 'c', nome: '  ' })).rejects.toThrow(/nome/);
  });
});
