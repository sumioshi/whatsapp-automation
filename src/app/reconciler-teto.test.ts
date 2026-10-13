import { describe, expect, it } from 'vitest';
import { comTeto } from './reconciler.js';

describe('comTeto', () => {
  it('devolve o valor quando a promessa resolve antes do teto', async () => {
    await expect(comTeto(Promise.resolve(7), 1_000, 'x')).resolves.toBe(7);
  });

  it('rejeita quando a promessa nunca resolve', async () => {
    const nunca = new Promise<number>(() => {});
    await expect(comTeto(nunca, 20, 'avatarUrl')).rejects.toThrow('avatarUrl: sem resposta em 20 ms');
  });

  it('repassa a rejeição original', async () => {
    await expect(comTeto(Promise.reject(new Error('caiu')), 1_000, 'x')).rejects.toThrow('caiu');
  });
});
