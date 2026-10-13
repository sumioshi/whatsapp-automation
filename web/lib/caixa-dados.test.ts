import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// O registro de entregas e o despacho moram em DATA_DIR (resolvido no import de ./paths).
let tmp: string;
let mod: typeof import('./caixa-dados');

const evento = (slug: string, ts: string, estado = 'entregando') =>
  `${JSON.stringify({ ts, ticket: `t-${slug}-${ts}`, slug, estado, motivo: null, enviados: 0, total: 2, iniciadoEm: ts })}\n`;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'wa-caixa-'));
  await mkdir(join(tmp, 'data', 'despacho'), { recursive: true });
  process.env.WAC_DATA_DIR = join(tmp, 'data');
  // Porta sem ninguém: a fila de envio "fora do ar" não pode quebrar a Caixa.
  process.env.WAC_CONTROL_PORT = '9';
  mod = await import('./caixa-dados');
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('eventosDaConversa', () => {
  it('sem registro, nada', async () => {
    expect(await mod.eventosDaConversa('g')).toEqual([]);
  });

  it('só os eventos da conversa, a partir do instante pedido, e acompanha o registro crescer', async () => {
    const arq = join(tmp, 'data', '.entregas.jsonl');
    await writeFile(arq, evento('g', '2026-10-07T10:00:00Z') + evento('outra', '2026-10-07T10:01:00Z') + '{linha cortada');
    expect((await mod.eventosDaConversa('g')).map((e) => e.ts)).toEqual(['2026-10-07T10:00:00Z']);
    await appendFile(arq, `\n${evento('g', '2026-10-07T12:00:00Z', 'entregue')}`);
    const depois = await mod.eventosDaConversa('g', '2026-10-07T11:00:00Z');
    expect(depois).toEqual([
      {
        ts: '2026-10-07T12:00:00Z',
        ticket: 't-g-2026-10-07T12:00:00Z',
        slug: 'g',
        estado: 'entregue',
        motivo: null,
        enviados: 0,
        total: 2,
        iniciadoEm: '2026-10-07T12:00:00Z',
      },
    ]);
  });
});

describe('iaDaCaixa', () => {
  it('coletor fora do ar dá fila vazia; pergunta da triagem sem decisão espera o OK', async () => {
    await writeFile(
      join(tmp, 'data', 'despacho', '2026-10-07T0610.json'),
      JSON.stringify({
        passada: '2026-10-07T0610',
        criadoEm: '2026-10-07T09:10:00.000Z',
        enviadoEm: '2026-10-07T09:11:00.000Z',
        itens: [
          { n: 3, id: 'a', slug: 'g', cliente: 'G', tipo: 'pergunta', titulo: 'Prazo', url: null, texto: 'Fecha sexta?', issue: null, acao: 'enviar', label: null, executadoEm: null, resultado: null },
          { n: 4, id: 'b', slug: 'h', cliente: 'H', tipo: 'pergunta', titulo: 'x', url: null, texto: 'y', issue: null, acao: 'enviar', label: null, executadoEm: '2026-10-07T10:00:00Z', resultado: 'ok' },
          { n: 5, id: 'c', slug: 'i', cliente: 'I', tipo: 'issue', titulo: 'Bug', url: null, texto: null, issue: null, acao: 'label', label: 'claude', executadoEm: null, resultado: null },
        ],
      }),
    );
    expect(await mod.iaDaCaixa()).toEqual({
      entregas: [],
      aguardandoOk: [{ slug: 'g', n: 3, texto: 'Fecha sexta?', desde: '2026-10-07T09:10:00.000Z' }],
    });
  });
});
