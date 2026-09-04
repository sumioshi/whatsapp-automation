import { describe, expect, it } from 'vitest';
import { issuesFechadas, montarEntregas } from './features-de-prs.mjs';

describe('issuesFechadas', () => {
  it('casa closes/fixes/resolves, sem repetir, ignorando caixa', () => {
    expect(issuesFechadas('Closes #12\n\nfixes #3 e Resolves: #12')).toEqual([12, 3]);
    expect(issuesFechadas('sem referência')).toEqual([]);
    expect(issuesFechadas(null)).toEqual([]);
  });
});

describe('montarEntregas', () => {
  const prs = [
    { title: 'Exportar PDF', html_url: 'https://github.com/o/r/pull/7', body: 'Closes #12', merged_at: '2026-09-03T10:00:00Z' },
    { title: 'Refactor interno', html_url: 'https://github.com/o/r/pull/8', body: 'sem issue', merged_at: '2026-09-03T11:00:00Z' },
    { title: 'Fix login', html_url: 'https://github.com/o/r/pull/9', body: 'Fixes #99', merged_at: '2026-09-03T12:00:00Z' },
  ];
  it('só PRs que fecham issue do conjunto whatsapp viram entrega', () => {
    const out = montarEntregas(prs, 'cliente-a', new Set([12]));
    expect(out).toEqual([
      { slug: 'cliente-a', nome: 'Exportar PDF', ref: 'https://github.com/o/r/pull/7', origem: 'pr', por: 'features.yml', em: '2026-09-03T10:00:00Z' },
    ]);
  });
});
