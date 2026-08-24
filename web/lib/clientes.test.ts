import { describe, expect, it } from 'vitest';
import { ordenarCards, primeiraLinha, tipoDoSlug } from './clientes';

function card(over: Partial<Parameters<typeof ordenarCards>[0][number]> = {}) {
  return {
    slug: 'x',
    aguardando: false,
    waitingMs: 0,
    ultimaTimestamp: null as string | null,
    silenciado: false,
    ...over,
  };
}

describe('ordenarCards', () => {
  it('aguardando vem antes de em dia, mais antigo primeiro', () => {
    const cards = [
      card({ slug: 'em-dia', ultimaTimestamp: '2026-08-24T12:00:00Z' }),
      card({ slug: 'espera-curta', aguardando: true, waitingMs: 1000 }),
      card({ slug: 'espera-longa', aguardando: true, waitingMs: 999_999 }),
    ];
    expect(ordenarCards(cards).map((c) => c.slug)).toEqual([
      'espera-longa',
      'espera-curta',
      'em-dia',
    ]);
  });

  it('em dia ordena por atividade mais recente', () => {
    const cards = [
      card({ slug: 'antigo', ultimaTimestamp: '2026-08-20T10:00:00Z' }),
      card({ slug: 'recente', ultimaTimestamp: '2026-08-24T10:00:00Z' }),
      card({ slug: 'sem-msg', ultimaTimestamp: null }),
    ];
    expect(ordenarCards(cards).map((c) => c.slug)).toEqual(['recente', 'antigo', 'sem-msg']);
  });

  it('silenciados vão pro fim, mesmo aguardando', () => {
    const cards = [
      card({ slug: 'mudo-esperando', aguardando: true, waitingMs: 999_999, silenciado: true }),
      card({ slug: 'em-dia', ultimaTimestamp: '2026-08-24T12:00:00Z' }),
    ];
    expect(ordenarCards(cards).map((c) => c.slug)).toEqual(['em-dia', 'mudo-esperando']);
  });
});

describe('primeiraLinha', () => {
  it('devolve a primeira linha não vazia, aparada', () => {
    expect(primeiraLinha('\n  aguardando aprovação do cliente\nsegunda linha')).toBe(
      'aguardando aprovação do cliente',
    );
  });

  it('trunca linha longa com reticências', () => {
    const longa = 'a'.repeat(100);
    const out = primeiraLinha(longa);
    expect(out?.length).toBe(80);
    expect(out?.endsWith('…')).toBe(true);
  });

  it('nota vazia ou só espaço vira null', () => {
    expect(primeiraLinha('   \n  ')).toBeNull();
    expect(primeiraLinha(undefined)).toBeNull();
  });
});

describe('tipoDoSlug', () => {
  it('slug dm-* é dm, resto é grupo', () => {
    expect(tipoDoSlug('dm-5511999998888')).toBe('dm');
    expect(tipoDoSlug('acme-x-projeto-185')).toBe('grupo');
  });
});
