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
    expect(tipoDoSlug('acme-x-parceria')).toBe('grupo');
  });
});

// ── rotuloTempo: relativo quando urgente, data quando histórico ──────────────
import { rotuloTempo } from './clientes';

describe('rotuloTempo', () => {
  const agora = new Date('2026-08-24T15:00:00Z').getTime();

  it('até 7 dias → relativo', () => {
    expect(rotuloTempo('2026-08-24T12:00:00Z', agora)).toBe('há 3h');
    expect(rotuloTempo('2026-08-22T15:00:00Z', agora)).toBe('há 2 dias');
  });

  it('acima de 7 dias → data absoluta dd/mm/aa', () => {
    expect(rotuloTempo('2026-08-05T20:30:18Z', agora)).toBe('05/08/26');
    expect(rotuloTempo('2023-11-20T10:00:00Z', agora)).toBe('20/11/23');
  });

  it('null → null', () => {
    expect(rotuloTempo(null, agora)).toBeNull();
  });
});

// ── negocioDoChat: o que a tabela mostra além da conversa ────────────────────
import { negocioDoChat } from './clientes';

describe('negocioDoChat', () => {
  const agora = Date.parse('2026-10-12T18:00:00Z');
  const msgs = [
    { timestamp: '2026-10-12T13:00:00Z', fromMe: false },
    { timestamp: '2026-10-12T13:05:00Z', fromMe: true },
    { timestamp: '2026-10-10T13:00:00Z', fromMe: false },
    { timestamp: '2026-08-01T13:00:00Z', fromMe: false },
  ];
  const contratos = {
    acme: { estado: 'ativo' as const, inicio: '2026-01-01', fim: '2026-11-01', valorMensal: 1800, limiteMensagens: 1, nota: '' },
  };
  const features = [
    { id: '1', slug: 'acme', nome: 'Lembretes', ref: null, origem: 'mcp' as const, em: '2026-10-01T12:00:00Z', por: null },
    { id: '2', slug: 'acme', nome: 'Login', ref: null, origem: 'mcp' as const, em: '2026-06-01T12:00:00Z', por: null },
    { id: '3', slug: 'outro', nome: 'X', ref: null, origem: 'mcp' as const, em: '2026-10-02T12:00:00Z', por: null },
  ];
  const equipe = [
    { login: 'ana', nome: 'Ana', ativo: true, chats: ['acme', 'outro'] },
    { login: 'bia', nome: '', ativo: true, chats: ['acme'] },
    { login: 'caio', nome: 'Caio', ativo: false, chats: ['acme'] },
  ];

  it('junta atividade do cliente, contrato com limite, entregas e equipe', () => {
    const n = negocioDoChat({ slug: 'acme', nome: 'Acme', mensagens: msgs }, contratos, features, equipe, agora);
    // A atividade e o uso contam o que o cliente mandou, a mesma régua do limite.
    expect(n.atividade30d).toHaveLength(30);
    expect(n.atividade30d[29]).toBe(1);
    expect(n.atividade30d[27]).toBe(1);
    expect(n.msgsCliente30d).toBe(2);
    expect(n.limite).toBe(1);
    expect(n.contrato.estado).toBe('ativo');
    expect(n.entregas30d).toBe(1);
    expect(n.entregasTotal).toBe(2);
    expect(n.msgsPorEntrega).toBe(2);
    expect(n.valorPorEntrega).toBe(1800);
    expect(n.sinais).toEqual(['renovacao-30d', 'acima-do-contrato']);
    expect(n.equipe).toEqual(['Ana', 'bia']);
  });

  it('chat sem nada de negócio sai com o contrato padrão', () => {
    const n = negocioDoChat({ slug: 'solto', nome: 'Solto', mensagens: [] }, contratos, features, equipe, agora);
    expect(n.contrato.estado).toBe('sem');
    expect(n.limite).toBeNull();
    expect(n.msgsCliente30d).toBe(0);
    expect(n.entregas30d).toBe(0);
    expect(n.entregasTotal).toBe(0);
    expect(n.msgsPorEntrega).toBeNull();
    expect(n.valorPorEntrega).toBeNull();
    expect(n.sinais).toEqual([]);
    expect(n.equipe).toEqual([]);
  });
});
