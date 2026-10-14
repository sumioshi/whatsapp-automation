import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// .triage.json deriva de DATA_DIR (resolvido no import de ./paths a partir de
// WAC_DATA_DIR). Seta a env e importa dinamicamente pra não tocar o data/ real.
let tmp: string;
let mod: typeof import('./triage');

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-triage-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./triage');
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const TRIAGE = () => join(tmp, 'data', '.triage.json');

describe('setAlert / readTriage.alertar', () => {
  it('default vazio', async () => {
    expect((await mod.readTriage()).alertar).toEqual({});
  });

  it('liga, é idempotente, e desliga remove a chave', async () => {
    await mod.setAlert('dm-1', true);
    await mod.setAlert('dm-1', true); // idempotente
    expect((await mod.readTriage()).alertar).toEqual({ 'dm-1': true });

    await mod.setAlert('dm-1', false);
    expect((await mod.readTriage()).alertar['dm-1']).toBeUndefined();
  });

  it('normaliza a chave com slugify (nome de grupo cru vira slug da pasta)', async () => {
    // Regressão: o notifier faz fs.watch em data/<slug>/; nome cru gerava ENOENT.
    await mod.setAlert('Acme Corp', true);
    const state = await mod.readTriage();
    expect(state.alertar['acme-corp']).toBe(true);
    expect(state.alertar['Acme Corp']).toBeUndefined();
    await mod.setAlert('Acme Corp', false); // desliga pela mesma chave crua
    expect((await mod.readTriage()).alertar['acme-corp']).toBeUndefined();
  });

  it('setTypos: default off, liga, desliga, normaliza chave', async () => {
    // default ausente = OFF
    expect((await mod.readTriage()).typos['grupo-novo']).toBeUndefined();
    // liga
    await mod.setTypos('grupo-novo', true);
    expect((await mod.readTriage()).typos['grupo-novo']).toBe(true);
    // chave crua (nome com espaço/maiúscula) normaliza pro mesmo slug
    await mod.setTypos('Acme Corp', true);
    expect((await mod.readTriage()).typos['acme-corp']).toBe(true);
    // desliga remove a chave
    await mod.setTypos('grupo-novo', false);
    expect((await mod.readTriage()).typos['grupo-novo']).toBeUndefined();
  });

  it('readTriage normaliza typos corrompido (descarta não-true)', async () => {
    await mod.setTypos('ok2', true);
    // injeta lixo direto no arquivo
    const raw = JSON.parse(await readFile(TRIAGE(), 'utf8'));
    raw.typos.lixo = 'sim';
    raw.typos.falso = false;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(TRIAGE(), JSON.stringify(raw), 'utf8');
    const state = await mod.readTriage();
    expect(state.typos.ok2).toBe(true);
    expect(state.typos.lixo).toBeUndefined();
    expect(state.typos.falso).toBeUndefined();
  });

  it('não afeta outros campos da triagem', async () => {
    await mod.setNote('grupo-x', 'cliente VIP');
    await mod.setAlert('grupo-x', true);
    const state = await mod.readTriage();
    expect(state.alertar['grupo-x']).toBe(true);
    expect(state.notes['grupo-x']).toBe('cliente VIP');
  });

  it('readTriage normaliza alertar corrompido (descarta não-boolean)', async () => {
    await mod.setAlert('ok', true);
    // injeta lixo direto no arquivo
    const raw = JSON.parse(await readFile(TRIAGE(), 'utf8'));
    raw.alertar.lixo = 'sim';
    raw.alertar.numero = 1;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(TRIAGE(), JSON.stringify(raw), 'utf8');
    const state = await mod.readTriage();
    expect(state.alertar.ok).toBe(true);
    expect(state.alertar.lixo).toBeUndefined();
    expect(state.alertar.numero).toBeUndefined();
  });
});

describe('setAgente / setExecutor', () => {
  it('default ausente: agente e executor vazios', async () => {
    const t = await mod.readTriage();
    expect(t.agente).toEqual({});
    expect(t.executor).toEqual({});
  });

  it('issue e pr persistem; off remove a chave', async () => {
    await mod.setAgente('grupo-x', 'issue');
    expect((await mod.readTriage()).agente).toEqual({ 'grupo-x': 'issue' });
    await mod.setAgente('grupo-x', 'pr');
    expect((await mod.readTriage()).agente).toEqual({ 'grupo-x': 'pr' });
    await mod.setAgente('grupo-x', 'off');
    expect((await mod.readTriage()).agente).toEqual({});
  });

  it('executor copilot persiste; claude (default) remove a chave', async () => {
    await mod.setExecutor('grupo-x', 'copilot');
    expect((await mod.readTriage()).executor).toEqual({ 'grupo-x': 'copilot' });
    await mod.setExecutor('grupo-x', 'claude');
    expect((await mod.readTriage()).executor).toEqual({});
  });

  it('valor desconhecido gravado à mão é ignorado na leitura', async () => {
    const raw = JSON.parse(await readFile(TRIAGE(), 'utf8')) as Record<string, unknown>;
    raw.agente = { 'grupo-y': 'banana' };
    raw.executor = { 'grupo-y': 'gemini' };
    await writeFile(TRIAGE(), JSON.stringify(raw));
    const t = await mod.readTriage();
    expect(t.agente).toEqual({});
    expect(t.executor).toEqual({});
  });
});

describe('setLatenciaMaxima', () => {
  it('grava segundos inteiros; null ou 0 remove; leitura ignora lixo', async () => {
    await mod.setLatenciaMaxima('dm-9', 900.4);
    expect((await mod.readTriage()).latenciaMaxima).toEqual({ 'dm-9': 900 });
    await mod.setLatenciaMaxima('dm-9', null);
    expect((await mod.readTriage()).latenciaMaxima['dm-9']).toBeUndefined();
    await writeFile(TRIAGE(), JSON.stringify({ latenciaMaxima: { a: -1, b: 'x', c: 30 } }));
    expect((await mod.readTriage()).latenciaMaxima).toEqual({ c: 30 });
  });
});

describe('setSinalIgnorado', () => {
  it('grava timestamp ISO ao ignorar e remove a chave ao desfazer', async () => {
    await mod.setSinalIgnorado('acme|espera', true);
    const t1 = await mod.readTriage();
    expect(typeof t1.sinaisIgnorados['acme|espera']).toBe('string');
    await mod.setSinalIgnorado('acme|espera', false);
    const t2 = await mod.readTriage();
    expect(t2.sinaisIgnorados['acme|espera']).toBeUndefined();
  });
});
