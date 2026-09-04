import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let tmp: string;
let mod: typeof import('./contratos');
beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-contratos-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./contratos');
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

describe('validarPatch', () => {
  it('aceita campos válidos e normaliza', () => {
    expect(mod.validarPatch({ estado: 'ativo', inicio: '2026-01-10', fim: null, valorMensal: 2500, nota: ' x ' }))
      .toEqual({ estado: 'ativo', inicio: '2026-01-10', fim: null, valorMensal: 2500, nota: 'x' });
  });
  it('recusa estado desconhecido, data mal formada, valor negativo e fim antes do início', () => {
    expect(() => mod.validarPatch({ estado: 'vip' })).toThrow(/estado/);
    expect(() => mod.validarPatch({ fim: '10/01/2026' })).toThrow(/YYYY-MM-DD/);
    expect(() => mod.validarPatch({ valorMensal: -1 })).toThrow(/valorMensal/);
    expect(() => mod.validarPatch({ inicio: '2026-05-01', fim: '2026-04-01' })).toThrow(/fim/);
  });
});

describe('setContrato / readContratos', () => {
  it('default ausente é CONTRATO_PADRAO; patch mescla e persiste; chave normalizada', async () => {
    expect(await mod.readContratos()).toEqual({});
    const c = await mod.setContrato('Cliente A', { estado: 'ativo', valorMensal: 1000 });
    expect(c).toEqual({ ...mod.CONTRATO_PADRAO, estado: 'ativo', valorMensal: 1000 });
    const c2 = await mod.setContrato('cliente-a', { fim: '2026-12-31' });
    expect(c2.estado).toBe('ativo');
    expect((await mod.readContratos())['cliente-a']?.fim).toBe('2026-12-31');
  });
  it('fim antes do início considerando o que já está gravado é recusado', async () => {
    await mod.setContrato('cliente-b', { inicio: '2026-06-01' });
    await expect(mod.setContrato('cliente-b', { fim: '2026-05-01' })).rejects.toThrow(/fim/);
  });
  it('lixo no arquivo é ignorado', async () => {
    await writeFile(join(tmp, 'data', '.contratos.json'), JSON.stringify({ x: { estado: 'zzz' }, y: 'nao' }));
    expect(await mod.readContratos()).toEqual({});
  });
});
