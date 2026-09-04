import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { renderTemplate } from './montar-prompt.mjs';

describe('renderTemplate', () => {
  it('substitui todas as chaves, inclusive repetidas', () => {
    expect(renderTemplate('a {{x}} b {{x}} {{y}}', { x: '1', y: '2' })).toBe('a 1 b 1 2');
  });
  it('lança se ficar chave sem valor', () => {
    expect(() => renderTemplate('{{slug}} {{sem}}', { slug: 'g' })).toThrow(/sem/);
  });
  it('o template real renderiza com um item da fila', async () => {
    const tpl = await readFile(new URL('../../.github/agente/triagem.prompt.md', import.meta.url), 'utf8');
    const out = renderTemplate(tpl, {
      slug: 'grupo-x', cliente: 'Cliente X', github: 'org/repo', brainDir: '-Users-x-p',
      agente: 'issue', executor: 'claude', novas: '3',
      desde: '2026-09-04T00:00:00.000Z', ate: '2026-09-04T08:00:00.000Z', passada: '2026-09-04T0610',
    });
    expect(out).toContain('grupo-x');
    expect(out).toContain('org/repo');
    expect(out).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
  });
});
