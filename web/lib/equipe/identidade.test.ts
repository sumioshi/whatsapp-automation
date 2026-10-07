import { describe, expect, it } from 'vitest';
import { cacheComChave } from './identidade';

function relogio(inicio = 0) {
  let t = inicio;
  return { agora: () => t, andar: (ms: number) => { t += ms; } };
}

function montar(chaves: Array<string | null>) {
  const r = relogio();
  let chave: string | null = chaves[0] ?? null;
  let leituras = 0;
  const get = cacheComChave({
    chave: async () => chave,
    ler: async () => ++leituras,
    ttlMs: 15_000,
    agora: r.agora,
  });
  return { get, r, trocar: (c: string | null) => { chave = c; }, leituras: () => leituras };
}

describe('cacheComChave', () => {
  it('mesma chave dentro do TTL: uma leitura só', async () => {
    const m = montar(['1:10']);
    expect(await m.get()).toBe(1);
    m.r.andar(14_000);
    expect(await m.get()).toBe(1);
    expect(m.leituras()).toBe(1);
  });
  it('chave mudou (mtime/tamanho): relê na hora', async () => {
    const m = montar(['1:10']);
    await m.get();
    m.trocar('2:10');
    expect(await m.get()).toBe(2);
  });
  it('TTL é teto: mesma chave relê depois de 15 s', async () => {
    const m = montar(['1:10']);
    await m.get();
    m.r.andar(15_000);
    expect(await m.get()).toBe(2);
  });
  it('arquivo ausente também é chave (não relê a cada chamada)', async () => {
    const m = montar([null]);
    await m.get();
    await m.get();
    expect(m.leituras()).toBe(1);
    m.trocar('1:10');
    expect(await m.get()).toBe(2);
  });
  it('chamadas simultâneas dividem a mesma leitura', async () => {
    const m = montar(['1:10']);
    expect(await Promise.all([m.get(), m.get(), m.get()])).toEqual([1, 1, 1]);
    expect(m.leituras()).toBe(1);
  });
  it('duas chamadas simultâneas com cache frio fazem uma leitura só', async () => {
    let leituras = 0;
    let chaves = 0;
    const get = cacheComChave({
      chave: async () => {
        chaves++;
        await new Promise((r) => setTimeout(r, 5));
        return 'k';
      },
      ler: async () => {
        await new Promise((r) => setTimeout(r, 5));
        return ++leituras;
      },
      ttlMs: 15_000,
      agora: () => 0,
    });
    const [a, b] = await Promise.all([get(), get()]);
    expect([a, b, leituras, chaves]).toEqual([1, 1, 1, 1]);
  });
  it('leitura que falhou não fica no cache', async () => {
    let n = 0;
    const get = cacheComChave({
      chave: async () => 'k',
      ler: async () => {
        n++;
        if (n === 1) throw new Error('falhou');
        return n;
      },
      ttlMs: 15_000,
      agora: () => 0,
    });
    await expect(get()).rejects.toThrow('falhou');
    expect(await get()).toBe(2);
  });
});
