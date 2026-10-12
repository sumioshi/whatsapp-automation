import { describe, expect, it } from 'vitest';
import {
  type FiltrosClientes,
  type LinhaCliente,
  atividadeDiaria,
  ehTrabalho,
  filtrarLinhas,
  formatarReais,
  ordenarLinhas,
  rotuloDoContrato,
  rotuloUltimaMsg,
  totaisDaTabela,
} from './clientes-tabela';
import type { Contrato } from './contratos';

// 12/10/2026 15:00 em Brasília.
const AGORA = Date.parse('2026-10-12T18:00:00Z');

const SEM: Contrato = { estado: 'sem', inicio: null, fim: null, valorMensal: null, nota: '' };
const contrato = (p: Partial<Contrato>): Contrato => ({ ...SEM, ...p });

function linha(over: Partial<LinhaCliente> = {}): LinhaCliente {
  return {
    slug: 'x',
    nome: 'X',
    tipo: 'grupo',
    etiquetas: [],
    aguardando: false,
    waitingMs: 0,
    silenciado: false,
    ultimaTimestamp: null,
    msgs30d: 0,
    limite: null,
    entregas30d: 0,
    entregasTotal: 0,
    contrato: SEM,
    ...over,
  };
}

describe('atividadeDiaria', () => {
  it('conta por dia de Brasília, do mais antigo para hoje', () => {
    const dias = atividadeDiaria(
      [
        { timestamp: '2026-10-12T13:00:00Z' }, // hoje 10:00
        { timestamp: '2026-10-12T17:59:00Z' }, // hoje 14:59
        { timestamp: '2026-10-12T02:59:00Z' }, // 11/10 23:59 em Brasília
        { timestamp: '2026-09-13T12:00:00Z' }, // 29 dias atrás
      ],
      AGORA,
    );
    expect(dias).toHaveLength(30);
    expect(dias[29]).toBe(2);
    expect(dias[28]).toBe(1);
    expect(dias[0]).toBe(1);
    expect(dias.reduce((a, b) => a + b, 0)).toBe(4);
  });

  it('ignora o que é mais velho que a janela, futuro ou inválido', () => {
    const dias = atividadeDiaria(
      [
        { timestamp: '2026-09-12T12:00:00Z' }, // 30 dias atrás: fora
        { timestamp: '2026-10-12T19:00:00Z' }, // depois de agora
        { timestamp: 'lixo' },
      ],
      AGORA,
    );
    expect(dias.every((n) => n === 0)).toBe(true);
  });

  it('aceita outro tamanho de janela', () => {
    expect(atividadeDiaria([{ timestamp: '2026-10-12T13:00:00Z' }], AGORA, 7)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });
});

describe('rotuloUltimaMsg', () => {
  it('hoje mostra a hora de Brasília', () => {
    expect(rotuloUltimaMsg('2026-10-12T13:05:00Z', AGORA)).toBe('10:05');
  });
  it('ontem, dia da semana até 6 dias, depois dia e mês', () => {
    expect(rotuloUltimaMsg('2026-10-11T23:00:00Z', AGORA)).toBe('ontem'); // 11/10 20:00
    expect(rotuloUltimaMsg('2026-10-12T02:00:00Z', AGORA)).toBe('ontem'); // 11/10 23:00 em Brasília
    expect(rotuloUltimaMsg('2026-10-08T15:00:00Z', AGORA)).toBe('qui');
    expect(rotuloUltimaMsg('2026-10-06T15:00:00Z', AGORA)).toBe('ter');
    expect(rotuloUltimaMsg('2026-10-05T15:00:00Z', AGORA)).toBe('5 out');
    expect(rotuloUltimaMsg('2026-09-29T15:00:00Z', AGORA)).toBe('29 set');
  });
  it('outro ano leva o ano', () => {
    expect(rotuloUltimaMsg('2025-08-12T15:00:00Z', AGORA)).toBe('12 ago 2025');
  });
  it('sem data ou inválida vira travessão; relógio adiantado conta como hoje', () => {
    expect(rotuloUltimaMsg(null, AGORA)).toBe('—');
    expect(rotuloUltimaMsg('lixo', AGORA)).toBe('—');
    expect(rotuloUltimaMsg('2026-10-12T18:30:00Z', AGORA)).toBe('15:30');
  });
});

describe('rotuloDoContrato', () => {
  it('ativo sem fim próximo', () => {
    expect(rotuloDoContrato(contrato({ estado: 'ativo' }), AGORA)).toEqual({ tom: 'ok', texto: 'Ativo' });
    expect(rotuloDoContrato(contrato({ estado: 'ativo', fim: '2026-12-31' }), AGORA)).toEqual({ tom: 'ok', texto: 'Ativo' });
  });
  it('ativo que vence em até 30 dias pede renovação', () => {
    expect(rotuloDoContrato(contrato({ estado: 'ativo', fim: '2026-11-04' }), AGORA)).toEqual({
      tom: 'warn',
      texto: 'Renova em 23 dias',
    });
    expect(rotuloDoContrato(contrato({ estado: 'ativo', fim: '2026-10-13' }), AGORA).texto).toBe('Renova amanhã');
    expect(rotuloDoContrato(contrato({ estado: 'ativo', fim: '2026-10-12' }), AGORA).texto).toBe('Renova hoje');
    expect(rotuloDoContrato(contrato({ estado: 'ativo', fim: '2026-11-11' }), AGORA).texto).toBe('Renova em 30 dias');
    expect(rotuloDoContrato(contrato({ estado: 'ativo', fim: '2026-11-12' }), AGORA).texto).toBe('Ativo');
  });
  it('ativo com fim que já passou está vencido', () => {
    expect(rotuloDoContrato(contrato({ estado: 'ativo', fim: '2026-09-30' }), AGORA)).toEqual({
      tom: 'danger',
      texto: 'Venceu em 30/09',
    });
  });
  it('pausado, encerrado e sem contrato', () => {
    expect(rotuloDoContrato(contrato({ estado: 'pausado' }), AGORA)).toEqual({ tom: 'neutro', texto: 'Pausado' });
    expect(rotuloDoContrato(contrato({ estado: 'encerrado' }), AGORA)).toEqual({ tom: 'neutro', texto: 'Encerrado' });
    expect(rotuloDoContrato(SEM, AGORA)).toEqual({ tom: 'mudo', texto: 'Sem contrato' });
  });
});

describe('formatarReais', () => {
  it('milhar com ponto e centavos só quando há', () => {
    expect(formatarReais(1800)).toBe('R$ 1.800');
    expect(formatarReais(900)).toBe('R$ 900');
    expect(formatarReais(1800.5)).toBe('R$ 1.800,50');
    expect(formatarReais(0)).toBe('R$ 0');
  });
  it('sem valor vira null', () => {
    expect(formatarReais(null)).toBeNull();
    expect(formatarReais(Number.NaN)).toBeNull();
  });
});

describe('ehTrabalho', () => {
  it('grupo é trabalho, menos o marcado só como pessoal', () => {
    expect(ehTrabalho(linha({ tipo: 'grupo' }))).toBe(true);
    expect(ehTrabalho(linha({ tipo: 'grupo', etiquetas: ['Pessoal'] }))).toBe(false);
    expect(ehTrabalho(linha({ tipo: 'grupo', etiquetas: ['Pessoal', 'Acme'] }))).toBe(true);
  });
  it('conversa direta só com etiqueta de empresa, contrato ou entrega', () => {
    expect(ehTrabalho(linha({ tipo: 'dm' }))).toBe(false);
    expect(ehTrabalho(linha({ tipo: 'dm', etiquetas: ['Pessoal'] }))).toBe(false);
    expect(ehTrabalho(linha({ tipo: 'dm', etiquetas: ['Acme'] }))).toBe(true);
    expect(ehTrabalho(linha({ tipo: 'dm', contrato: contrato({ estado: 'ativo' }) }))).toBe(true);
    expect(ehTrabalho(linha({ tipo: 'dm', contrato: contrato({ estado: 'encerrado' }) }))).toBe(true);
    expect(ehTrabalho(linha({ tipo: 'dm', entregasTotal: 1 }))).toBe(true);
  });
  it('contrato vale mais que a etiqueta pessoal', () => {
    expect(ehTrabalho(linha({ tipo: 'dm', etiquetas: ['Pessoal'], contrato: contrato({ estado: 'ativo' }) }))).toBe(true);
  });
});

describe('filtrarLinhas', () => {
  const linhas = [
    linha({ slug: 'g1', nome: 'Clínica Ébano', tipo: 'grupo', etiquetas: ['Bug'], aguardando: true, contrato: contrato({ estado: 'ativo' }) }),
    linha({ slug: 'g2', nome: 'Norte Logística', tipo: 'grupo', contrato: contrato({ estado: 'pausado' }) }),
    linha({ slug: 'dm-1', nome: 'Lia', tipo: 'dm', etiquetas: ['Lead'] }),
    linha({ slug: 'dm-2', nome: 'Mãe', tipo: 'dm', etiquetas: ['Pessoal'] }),
    linha({ slug: 'g3', nome: 'Alfa', tipo: 'grupo', contrato: contrato({ estado: 'ativo', fim: '2026-10-20' }) }),
  ];
  const base: FiltrosClientes = { contexto: 'trabalho', busca: '', esperando: false, tipo: null, etiqueta: null, contrato: null };
  const slugs = (f: Partial<FiltrosClientes>) => filtrarLinhas(linhas, { ...base, ...f }, AGORA).map((l) => l.slug);

  it('contexto de trabalho tira o pessoal; tudo mostra todos', () => {
    expect(slugs({})).toEqual(['g1', 'g2', 'dm-1', 'g3']);
    expect(slugs({ contexto: 'tudo' })).toEqual(['g1', 'g2', 'dm-1', 'dm-2', 'g3']);
  });
  it('busca sem acento e sem caixa', () => {
    expect(slugs({ busca: 'clinica' })).toEqual(['g1']);
    expect(slugs({ busca: '  LOGÍS ' })).toEqual(['g2']);
  });
  it('esperando, tipo e etiqueta', () => {
    expect(slugs({ esperando: true })).toEqual(['g1']);
    expect(slugs({ tipo: 'dm' })).toEqual(['dm-1']);
    expect(slugs({ etiqueta: 'Lead' })).toEqual(['dm-1']);
  });
  it('contrato por estado e quem renova em 30 dias', () => {
    expect(slugs({ contrato: 'ativo' })).toEqual(['g1', 'g3']);
    expect(slugs({ contrato: 'pausado' })).toEqual(['g2']);
    expect(slugs({ contrato: 'sem' })).toEqual(['dm-1']);
    expect(slugs({ contrato: 'renova' })).toEqual(['g3']);
  });
});

describe('ordenarLinhas', () => {
  const linhas = [
    linha({ slug: 'a', nome: 'Beta', msgs30d: 40, limite: 100, entregas30d: 1, ultimaTimestamp: '2026-10-10T10:00:00Z' }),
    linha({ slug: 'b', nome: 'alfa', msgs30d: 90, limite: 60, entregas30d: 3, ultimaTimestamp: '2026-10-12T10:00:00Z' }),
    linha({ slug: 'c', nome: 'Ômega', msgs30d: 300, limite: null, entregas30d: 0, ultimaTimestamp: null }),
    linha({ slug: 'd', nome: 'Delta', msgs30d: 10, limite: 10, entregas30d: 2, ultimaTimestamp: '2026-10-11T10:00:00Z' }),
  ];
  const ordem = (chave: Parameters<typeof ordenarLinhas>[1]['chave'], desc = true) =>
    ordenarLinhas(linhas, { chave, desc }).map((l) => l.slug);

  it('espera mantém a ordem que veio do servidor', () => {
    expect(ordem('espera')).toEqual(['a', 'b', 'c', 'd']);
  });
  it('uso do contrato pela fração do limite, sem limite por último', () => {
    expect(ordem('uso')).toEqual(['b', 'd', 'a', 'c']);
    expect(ordem('uso', false)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('atividade, entregas e última mensagem', () => {
    expect(ordem('atividade')).toEqual(['c', 'b', 'a', 'd']);
    expect(ordem('entregas')).toEqual(['b', 'd', 'a', 'c']);
    expect(ordem('ultima')).toEqual(['b', 'd', 'a', 'c']);
    expect(ordem('ultima', false)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('nome em ordem alfabética do português', () => {
    expect(ordem('nome', false)).toEqual(['b', 'a', 'd', 'c']);
  });
  it('valor do contrato, sem valor por último', () => {
    const comValor = [
      linha({ slug: 'x', contrato: contrato({ estado: 'ativo', valorMensal: 900 }) }),
      linha({ slug: 'y' }),
      linha({ slug: 'z', contrato: contrato({ estado: 'ativo', valorMensal: 1800 }) }),
    ];
    expect(ordenarLinhas(comValor, { chave: 'contrato', desc: true }).map((l) => l.slug)).toEqual(['z', 'x', 'y']);
    expect(ordenarLinhas(comValor, { chave: 'contrato', desc: false }).map((l) => l.slug)).toEqual(['x', 'z', 'y']);
  });
});

describe('totaisDaTabela', () => {
  it('soma o valor dos contratos valendo, conta quem passou do limite, entregas e quem espera', () => {
    const t = totaisDaTabela(
      [
        linha({ contrato: contrato({ estado: 'ativo', valorMensal: 1800 }), msgs30d: 412, limite: 300, entregas30d: 3, aguardando: true }),
        linha({ contrato: contrato({ estado: 'ativo', valorMensal: 1200, fim: '2026-09-01' }), msgs30d: 10, limite: 100 }),
        linha({ contrato: contrato({ estado: 'pausado', valorMensal: 700 }), entregas30d: 1 }),
        linha({ contrato: contrato({ estado: 'ativo', valorMensal: 600 }), msgs30d: 50, limite: 50, aguardando: true, silenciado: true }),
        linha({ msgs30d: 999, limite: null }),
      ],
      AGORA,
    );
    expect(t).toEqual({ clientes: 5, somaMensal: 2400, acima: 1, entregas30d: 4, esperando: 1 });
  });
});

// ── data pura curta, para a renovação ────────────────────────────────────────
import { diaEMes } from './clientes-tabela';

describe('diaEMes', () => {
  it('dia e mês; o ano só quando não é o atual', () => {
    expect(diaEMes('2026-10-30', AGORA)).toBe('30 out');
    expect(diaEMes('2027-01-02', AGORA)).toBe('2 jan 2027');
  });
  it('vazio ou inválido vira travessão', () => {
    expect(diaEMes(null, AGORA)).toBe('—');
    expect(diaEMes('31/12/2026', AGORA)).toBe('—');
  });
});
