import { describe, expect, it } from 'vitest';
import { type FilaEntrada, JANELA_INICIAL_MS, selecionarFila } from './agente-fila';

const agora = Date.parse('2026-09-04T09:00:00.000Z');
const iso = (msAntes: number) => new Date(agora - msAntes).toISOString();
const H = 3_600_000;

function entrada(over: Partial<FilaEntrada>): FilaEntrada {
  return {
    slug: 'g', cliente: 'G', github: 'o/r', brainDir: '-x', agente: 'issue', executor: 'claude',
    seen: null, mensagens: [], ...over,
  };
}

describe('selecionarFila', () => {
  it('ignora agente off e link sem github', () => {
    const e = [
      entrada({ slug: 'a', agente: 'off', mensagens: [{ timestamp: iso(H), fromMe: false }] }),
      entrada({ slug: 'b', github: undefined, mensagens: [{ timestamp: iso(H), fromMe: false }] }),
    ];
    expect(selecionarFila(e, agora)).toEqual([]);
  });

  it('conta só mensagens de terceiros depois do checkpoint e devolve desde/ate', () => {
    const seen = iso(5 * H);
    const e = [entrada({
      seen,
      mensagens: [
        { timestamp: iso(6 * H), fromMe: false }, // antes do checkpoint
        { timestamp: iso(4 * H), fromMe: true },  // minha
        { timestamp: iso(3 * H), fromMe: false },
        { timestamp: iso(1 * H), fromMe: false },
      ],
    })];
    const [item] = selecionarFila(e, agora);
    expect(item).toMatchObject({ slug: 'g', novas: 2, desde: seen, ate: iso(1 * H), github: 'o/r', brainDir: '-x' });
  });

  it('sem checkpoint usa a janela inicial de 24h', () => {
    const e = [entrada({ mensagens: [
      { timestamp: iso(30 * H), fromMe: false },
      { timestamp: iso(2 * H), fromMe: false },
    ] })];
    const [item] = selecionarFila(e, agora);
    expect(item?.novas).toBe(1);
    expect(item?.desde).toBe(new Date(agora - JANELA_INICIAL_MS).toISOString());
  });

  it('sem novidade não entra; ordena por novas desc e respeita o teto', () => {
    const e = [
      entrada({ slug: 'zero', seen: iso(H), mensagens: [{ timestamp: iso(2 * H), fromMe: false }] }),
      entrada({ slug: 'um', mensagens: [{ timestamp: iso(H), fromMe: false }] }),
      entrada({ slug: 'dois', mensagens: [{ timestamp: iso(H), fromMe: false }, { timestamp: iso(H / 2), fromMe: false }] }),
    ];
    expect(selecionarFila(e, agora).map((i) => i.slug)).toEqual(['dois', 'um']);
    expect(selecionarFila(e, agora, 1).map((i) => i.slug)).toEqual(['dois']);
  });

  it('brainDir ausente vira string vazia (o workflow trata como sem memória)', () => {
    const [item] = selecionarFila([entrada({ brainDir: undefined, mensagens: [{ timestamp: iso(H), fromMe: false }] })], agora);
    expect(item?.brainDir).toBe('');
  });
});
