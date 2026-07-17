import { describe, expect, it } from 'vitest';
import { rewriteMediaPrefix } from './migrar-slug';

describe('rewriteMediaPrefix', () => {
  it('troca o prefixo do mediaPath das linhas do slug duplicado', () => {
    const jsonl =
      JSON.stringify({ id: '1', mediaPath: 'grupo-novo/image/a.jpg' }) +
      '\n' +
      JSON.stringify({ id: '2', mediaPath: null }) +
      '\n' +
      JSON.stringify({ id: '3', text: 'sem mídia' }) +
      '\n';
    const out = rewriteMediaPrefix(jsonl, 'grupo-novo', 'grupo-canonico');
    const linhas = out.trim().split('\n').map((l) => JSON.parse(l));
    expect(linhas[0].mediaPath).toBe('grupo-canonico/image/a.jpg');
    expect(linhas[1].mediaPath).toBeNull();
    expect(linhas[2].text).toBe('sem mídia');
  });

  it('não toca em mediaPath de outro slug nem em linha inválida', () => {
    const jsonl = JSON.stringify({ id: '1', mediaPath: 'outro-grupo/image/a.jpg' }) + '\nlinha-invalida\n';
    const out = rewriteMediaPrefix(jsonl, 'grupo-novo', 'grupo-canonico');
    expect(out).toContain('outro-grupo/image/a.jpg');
    expect(out).toContain('linha-invalida');
  });
});
