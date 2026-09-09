import { describe, expect, it } from 'vitest';
import {
  deveVerificarUpstream,
  formatarUpstream,
  novidadesUpstream,
  type UpstreamCommit,
} from './upstream-core.js';

const c = (sha: string, titulo: string, data = '2026-08-04'): UpstreamCommit => ({
  sha,
  data,
  titulo,
});

// GitHub devolve do mais novo pro mais velho.
const COMMITS = [
  c('0af2386', 'fix: advertise WIN_HYBRID'),
  c('74af8ee', 'example: fix logging'),
  c('7e7b075', 'chore(release): v7.0.0-rc14'),
];

describe('novidadesUpstream', () => {
  it('commits acima do último sha visto são novidade', () => {
    const n = novidadesUpstream(
      { commits: COMMITS, versaoNpm: '7.0.0-rc14' },
      { ultimoSha: '7e7b075', ultimaVersaoNpm: '7.0.0-rc14' },
      '7.0.0-rc14',
    );
    expect(n.commitsNovos.map((x) => x.sha)).toEqual(['0af2386', '74af8ee']);
    expect(n.versaoNova).toBeNull();
  });

  it('sem sha visto (primeira execução) nada é novidade — só marca o ponto de partida', () => {
    const n = novidadesUpstream(
      { commits: COMMITS, versaoNpm: '7.0.0-rc14' },
      { ultimoSha: null, ultimaVersaoNpm: null },
      '7.0.0-rc14',
    );
    expect(n.commitsNovos).toEqual([]);
    expect(n.versaoNova).toBeNull();
  });

  it('sha visto que sumiu da janela (force-push ou janela curta) conta tudo como novo', () => {
    const n = novidadesUpstream(
      { commits: COMMITS, versaoNpm: '7.0.0-rc14' },
      { ultimoSha: 'deadbeef', ultimaVersaoNpm: '7.0.0-rc14' },
      '7.0.0-rc14',
    );
    expect(n.commitsNovos).toHaveLength(3);
  });

  it('versão npm diferente da instalada e ainda não avisada vira versaoNova', () => {
    const n = novidadesUpstream(
      { commits: COMMITS, versaoNpm: '7.0.0-rc15' },
      { ultimoSha: '0af2386', ultimaVersaoNpm: '7.0.0-rc14' },
      '7.0.0-rc14',
    );
    expect(n.versaoNova).toBe('7.0.0-rc15');
  });

  it('versão npm já avisada não repete', () => {
    const n = novidadesUpstream(
      { commits: COMMITS, versaoNpm: '7.0.0-rc15' },
      { ultimoSha: '0af2386', ultimaVersaoNpm: '7.0.0-rc15' },
      '7.0.0-rc14',
    );
    expect(n.versaoNova).toBeNull();
  });

  it('versão npm igual à instalada nunca é novidade, mesmo sem histórico', () => {
    const n = novidadesUpstream(
      { commits: COMMITS, versaoNpm: '7.0.0-rc14' },
      { ultimoSha: '0af2386', ultimaVersaoNpm: null },
      '7.0.0-rc14',
    );
    expect(n.versaoNova).toBeNull();
  });
});

describe('formatarUpstream', () => {
  it('sem novidade devolve string vazia (nada a mandar)', () => {
    expect(formatarUpstream({ commitsNovos: [], versaoNova: null }, '7.0.0-rc14')).toBe('');
  });

  it('lista commits novos com sha curto, data e título', () => {
    const txt = formatarUpstream(
      { commitsNovos: COMMITS.slice(0, 2), versaoNova: null },
      '7.0.0-rc14',
    );
    expect(txt).toContain('*Baileys upstream*');
    expect(txt).toContain('2 commits novos na master');
    expect(txt).toContain('0af2386');
    expect(txt).toContain('fix: advertise WIN_HYBRID');
    expect(txt).toContain('2026-08-04');
  });

  it('versão nova vem com a instalada ao lado pra decidir o bump', () => {
    const txt = formatarUpstream({ commitsNovos: [], versaoNova: '7.0.0-rc15' }, '7.0.0-rc14');
    expect(txt).toContain('7.0.0-rc15');
    expect(txt).toContain('instalada 7.0.0-rc14');
  });

  it('acima de 10 commits resume o resto em "… e mais N"', () => {
    const muitos = Array.from({ length: 13 }, (_, i) => c(`sha${i}`, `commit ${i}`));
    const txt = formatarUpstream({ commitsNovos: muitos, versaoNova: null }, '7.0.0-rc14');
    expect(txt).toContain('… e mais 3');
    expect(txt).not.toContain('commit 12');
  });
});

describe('deveVerificarUpstream', () => {
  const H = 60 * 60_000;
  const AGORA = Date.parse('2026-09-09T12:00:00Z');

  it('nunca verificou → verifica', () => {
    expect(deveVerificarUpstream(null, AGORA, 24)).toBe(true);
  });

  it('dentro do intervalo → não verifica', () => {
    expect(deveVerificarUpstream(AGORA - 5 * H, AGORA, 24)).toBe(false);
  });

  it('intervalo vencido → verifica', () => {
    expect(deveVerificarUpstream(AGORA - 25 * H, AGORA, 24)).toBe(true);
  });
});
