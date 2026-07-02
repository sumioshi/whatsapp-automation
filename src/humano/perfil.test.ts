import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PERFIL_DEFAULT } from './baloes';
import { calcularPerfil, loadPerfilEnvio } from './perfil';

describe('calcularPerfil', () => {
  it('menos de 30 msgs → null (chamador usa default)', () => {
    expect(calcularPerfil(Array.from({ length: 29 }, () => 'oi'))).toBeNull();
  });

  it('calcula tamanho médio e fração de resposta curta do histórico real', () => {
    const curtas = Array.from({ length: 20 }, () => 'blz');
    const longas = Array.from({ length: 20 }, () => 'a'.repeat(150));
    const p = calcularPerfil([...curtas, ...longas]);
    expect(p).not.toBeNull();
    expect(p!.tamanhoMedioBalao).toBeGreaterThan(60);
    expect(p!.fracaoRespostaCurta).toBeCloseTo(0.5, 1);
  });
});

describe('loadPerfilEnvio — cache do default', () => {
  let dataDir: string;
  const slug = 'chat-novo';
  const cachePath = () => join(dataDir, slug, '.perfil-envio.json');

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'wac-humano-perfil-'));
    await mkdir(join(dataDir, slug), { recursive: true });
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('chat com < 30 msgs: devolve PERFIL_DEFAULT mas NÃO grava cache (senão prenderia o chat 24h no default)', async () => {
    const linhas = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({ fromMe: true, type: 'text', text: `msg ${i}` }),
    ).join('\n');
    await writeFile(join(dataDir, slug, 'messages.jsonl'), linhas, 'utf8');

    const perfil = await loadPerfilEnvio(slug, dataDir);
    expect(perfil).toEqual(PERFIL_DEFAULT);
    await expect(access(cachePath())).rejects.toThrow(); // cache não deve existir
  });

  it('chat com >= 30 msgs: calcula e GRAVA o cache normalmente', async () => {
    const linhas = Array.from({ length: 30 }, (_, i) =>
      JSON.stringify({ fromMe: true, type: 'text', text: `mensagem numero ${i} com tamanho razoavel` }),
    ).join('\n');
    await writeFile(join(dataDir, slug, 'messages.jsonl'), linhas, 'utf8');

    const perfil = await loadPerfilEnvio(slug, dataDir);
    expect(perfil).not.toEqual(PERFIL_DEFAULT);
    await expect(access(cachePath())).resolves.toBeUndefined(); // cache existe
  });
});
