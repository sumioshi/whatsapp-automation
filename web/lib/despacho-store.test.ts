import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let tmp: string;
let mod: typeof import('./despacho-store');

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-despacho-'));
  await mkdir(join(tmp, 'data'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  mod = await import('./despacho-store');
});
afterAll(async () => rm(tmp, { recursive: true, force: true }));

const agora = new Date('2026-09-04T09:10:12.000Z');

describe('passadaValida / validarItem', () => {
  it('aceita YYYY-MM-DDTHHmm e recusa o resto', () => {
    expect(mod.passadaValida('2026-09-04T0610')).toBe(true);
    expect(mod.passadaValida('2026-09-04T06:10')).toBe(false);
    expect(mod.passadaValida('../x')).toBe(false);
  });
  it('exige slug, cliente, tipo e titulo; normaliza opcionais', () => {
    const item = mod.validarItem({ slug: 'g', cliente: 'G', tipo: 'pergunta', titulo: 'T', texto: 'oi' });
    expect(item).toEqual({ slug: 'g', cliente: 'G', tipo: 'pergunta', titulo: 'T', url: null, texto: 'oi', issue: null, acao: 'enviar', label: null });
    expect(() => mod.validarItem({ slug: 'g', cliente: 'G', tipo: 'x', titulo: 'T' })).toThrow(/tipo/);
    expect(() => mod.validarItem({ slug: 'g', cliente: 'G', tipo: 'issue' })).toThrow(/titulo/);
  });
  it('acao default: pergunta → enviar, issue/bug → label, info → nenhuma', () => {
    expect(mod.validarItem({ slug: 'g', cliente: 'G', tipo: 'issue', titulo: 'T' }).acao).toBe('label');
    expect(mod.validarItem({ slug: 'g', cliente: 'G', tipo: 'bug', titulo: 'T' }).acao).toBe('label');
    expect(mod.validarItem({ slug: 'g', cliente: 'G', tipo: 'info', titulo: 'T' }).acao).toBe('nenhuma');
  });
});

describe('gravarDespacho / listarDespachos', () => {
  it('grava com numeração global crescente e ids por passada', async () => {
    const a = await mod.gravarDespacho('2026-09-04T0610', [
      { slug: 'g', cliente: 'G', tipo: 'issue', titulo: 'A', url: 'https://github.com/o/r/issues/1', issue: { repo: 'o/r', numero: 1 } },
      { slug: 'g', cliente: 'G', tipo: 'pergunta', titulo: 'B', texto: 'vc quer X?' },
    ], agora);
    expect(a.itens.map((i) => i.n)).toEqual([1, 2]);
    expect(a.itens[0]?.id).toBe('2026-09-04T0610-1');
    expect(a.enviadoEm).toBeNull();
    expect(a.itens[1]?.acao).toBe('enviar');

    const b = await mod.gravarDespacho('2026-09-04T1300', [
      { slug: 'h', cliente: 'H', tipo: 'info', titulo: 'C' },
    ], agora);
    expect(b.itens[0]?.n).toBe(3);

    const lista = await mod.listarDespachos();
    expect(lista.map((d) => d.passada)).toEqual(['2026-09-04T0610', '2026-09-04T1300']);
    const emDisco = JSON.parse(await readFile(join(tmp, 'data', 'despacho', '2026-09-04T0610.json'), 'utf8'));
    expect(emDisco.itens[0].executadoEm).toBeNull();
  });
  it('recusa passada inválida', async () => {
    await expect(mod.gravarDespacho('x', [], agora)).rejects.toThrow(/passada/);
  });
});

// ── idempotência: re-POST da mesma passada não pode resetar progresso ──────
// O workflow do GitHub pode re-rodar (retry, painel reiniciado no meio) e
// mandar a mesma passada de novo. Sobrescrever o arquivo resetaria enviadoEm
// e todo executadoEm já marcado — reabrindo pro operador itens que ele já
// decidiu, e podendo reenviar uma pergunta pro cliente pela segunda vez.
describe('gravarDespacho é idempotente por passada', () => {
  it('segunda gravação com itens diferentes não sobrescreve o arquivo existente', async () => {
    const passada = '2026-09-04T0700';
    const arquivo = join(tmp, 'data', 'despacho', `${passada}.json`);

    const primeira = await mod.gravarDespacho(passada, [
      { slug: 'g', cliente: 'G', tipo: 'issue', titulo: 'Original' },
    ], agora);
    expect(primeira.jaExistia).toBeFalsy();
    const nOriginal = primeira.itens[0]?.n;

    // Simula progresso do operador: marca o item como executado e o envio como feito.
    const emDisco = JSON.parse(await readFile(arquivo, 'utf8'));
    emDisco.enviadoEm = '2026-09-04T09:15:00.000Z';
    emDisco.itens[0].executadoEm = '2026-09-04T09:20:00.000Z';
    emDisco.itens[0].resultado = 'ok';
    await writeFile(arquivo, JSON.stringify(emDisco));

    const segunda = await mod.gravarDespacho(passada, [
      { slug: 'h', cliente: 'H', tipo: 'bug', titulo: 'Diferente' },
    ], agora);

    expect(segunda.jaExistia).toBe(true);
    expect(segunda.itens.map((i) => i.n)).toEqual([nOriginal]);
    expect(segunda.itens[0]?.titulo).toBe('Original');
    expect(segunda.enviadoEm).toBe('2026-09-04T09:15:00.000Z');
    expect(segunda.itens[0]?.executadoEm).toBe('2026-09-04T09:20:00.000Z');

    const emDiscoDepois = JSON.parse(await readFile(arquivo, 'utf8'));
    expect(emDiscoDepois).toEqual(emDisco);
  });
});
