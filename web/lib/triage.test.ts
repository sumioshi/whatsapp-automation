import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
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

  it('setAutonomo/isAutonomo: default confirmar, liga, desliga, normaliza chave', async () => {
    // default ausente = confirmar (false)
    expect(await mod.isAutonomo('grupo-novo')).toBe(false);
    // liga
    await mod.setAutonomo('grupo-novo', true);
    expect(await mod.isAutonomo('grupo-novo')).toBe(true);
    expect((await mod.readTriage()).autonomo['grupo-novo']).toBe(true);
    // chave crua (nome com emoji) normaliza pro mesmo slug
    await mod.setAutonomo('Acme Corp', true);
    expect(await mod.isAutonomo('acme-corp')).toBe(true);
    // desliga remove a chave
    await mod.setAutonomo('grupo-novo', false);
    expect(await mod.isAutonomo('grupo-novo')).toBe(false);
    expect((await mod.readTriage()).autonomo['grupo-novo']).toBeUndefined();
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
