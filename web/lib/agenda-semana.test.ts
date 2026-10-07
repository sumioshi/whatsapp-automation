import { describe, expect, it } from 'vitest';
import type { Evento } from './google/evento';
import {
  blocosDaSemana,
  corDoTexto,
  diaBrt,
  diasDaSemana,
  entradaDoRascunho,
  inicioDaSemana,
  janelaDaSemana,
  minutosBrt,
  rascunhoDoEvento,
  rascunhoNovo,
  resumoParaIa,
  rotuloBrt,
  rotuloDoDia,
} from './agenda-semana';

const base: Evento = {
  id: 'e',
  agenda: 'a',
  titulo: 'x',
  inicio: '',
  fim: '',
  diaInteiro: false,
  convidados: [],
  recorrente: false,
  editavel: true,
  cor: '#4285f4',
};
const ev = (p: Partial<Evento>): Evento => ({ ...base, ...p });
const semana = diasDaSemana('2026-10-05');

describe('datas em Brasília', () => {
  it('02:00 UTC ainda é o dia anterior', () => expect(diaBrt(Date.parse('2026-10-08T02:00:00Z'))).toBe('2026-10-07'));
  it('minutosBrt', () => expect(minutosBrt(Date.parse('2026-10-08T17:30:00Z'))).toBe(14 * 60 + 30));
  it('semana começa na segunda (domingo volta 6 dias)', () => {
    expect(inicioDaSemana('2026-10-11')).toBe('2026-10-05');
    expect(inicioDaSemana('2026-10-05')).toBe('2026-10-05');
  });
  it('dias e janela', () => {
    expect(semana).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(janelaDaSemana('2026-10-05')).toEqual({ de: '2026-10-05T00:00:00-03:00', ate: '2026-10-12T00:00:00-03:00' });
  });
  it('rótulo do dia', () => expect(rotuloDoDia('2026-10-07')).toBe('qua 07/10'));
});

describe('blocosDaSemana', () => {
  it('dois eventos sobrepostos dividem a coluna', () => {
    const { blocos } = blocosDaSemana(
      [
        ev({ id: '1', inicio: '2026-10-07T14:00:00-03:00', fim: '2026-10-07T15:00:00-03:00' }),
        ev({ id: '2', inicio: '2026-10-07T14:30:00-03:00', fim: '2026-10-07T16:00:00-03:00' }),
      ],
      semana,
    );
    expect(blocos.map((b) => [b.chave, b.coluna, b.colunas, b.topoMin])).toEqual([
      ['a|1', 0, 2, 840],
      ['a|2', 1, 2, 870],
    ]);
  });
  it('encostados sem sobrepor ocupam a largura toda', () => {
    const { blocos } = blocosDaSemana(
      [
        ev({ id: '1', inicio: '2026-10-07T09:00:00-03:00', fim: '2026-10-07T10:00:00-03:00' }),
        ev({ id: '2', inicio: '2026-10-07T10:00:00-03:00', fim: '2026-10-07T11:00:00-03:00' }),
      ],
      semana,
    );
    expect(blocos.map((b) => b.colunas)).toEqual([1, 1]);
  });
  it('evento que passa da meia-noite aparece nos dois dias', () => {
    const { blocos } = blocosDaSemana(
      [ev({ inicio: '2026-10-07T23:00:00-03:00', fim: '2026-10-08T01:00:00-03:00' })],
      semana,
    );
    expect(blocos.map((b) => [b.dia, b.topoMin, b.fimMin])).toEqual([
      ['2026-10-07', 1380, 1440],
      ['2026-10-08', 0, 60],
    ]);
  });
  it('dia inteiro usa fim exclusivo', () => {
    const { diaInteiro } = blocosDaSemana([ev({ diaInteiro: true, inicio: '2026-10-07', fim: '2026-10-09' })], semana);
    expect(Object.keys(diaInteiro)).toEqual(['2026-10-07', '2026-10-08']);
  });
  it('evento curto ganha altura mínima', () => {
    const { blocos } = blocosDaSemana(
      [ev({ inicio: '2026-10-07T09:00:00-03:00', fim: '2026-10-07T09:05:00-03:00' })],
      semana,
    );
    expect(blocos[0]!.fimMin - blocos[0]!.topoMin).toBe(20);
  });
});

describe('corDoTexto', () => {
  it('fundo claro pede texto escuro', () => {
    expect(corDoTexto('#9fe1e7')).toBe('#111827');
    expect(corDoTexto('#0b8043')).toBe('#ffffff');
    expect(corDoTexto('lixo')).toBe('#ffffff');
  });
});

describe('rascunho', () => {
  it('novo arredonda pra meia hora e dura 1 h', () => {
    const r = rascunhoNovo('2026-10-07', 14 * 60 + 47, 'a');
    expect([r.horaInicio, r.horaFim, r.agenda]).toEqual(['14:30', '15:30', 'a']);
  });
  it('novo às 23:30 termina 23:59 do mesmo dia', () => {
    const r = rascunhoNovo('2026-10-07', 23 * 60 + 30, 'a');
    expect([r.horaInicio, r.horaFim, r.diaFim]).toEqual(['23:30', '23:59', '2026-10-07']);
  });
  it('dia inteiro: tela mostra fim inclusivo, Google recebe exclusivo', () => {
    const r = rascunhoDoEvento(ev({ diaInteiro: true, inicio: '2026-10-07', fim: '2026-10-09' }));
    expect([r.dia, r.diaFim]).toEqual(['2026-10-07', '2026-10-08']);
    expect(entradaDoRascunho(r)).toMatchObject({ diaInteiro: true, inicio: '2026-10-07', fim: '2026-10-09' });
  });
  it('com hora vai e volta igual; convidados separados por vírgula', () => {
    const r = rascunhoDoEvento(
      ev({ inicio: '2026-10-07T14:00:00-03:00', fim: '2026-10-07T15:30:00-03:00', convidados: ['c@ex.com'] }),
    );
    expect(entradaDoRascunho({ ...r, convidados: 'c@ex.com, d@ex.com' })).toMatchObject({
      inicio: '2026-10-07T14:00:00-03:00',
      fim: '2026-10-07T15:30:00-03:00',
      convidados: ['c@ex.com', 'd@ex.com'],
      diaInteiro: false,
    });
  });
});

describe('rotuloBrt', () => {
  it('com hora', () =>
    expect(rotuloBrt(ev({ inicio: '2026-10-07T14:00:00-03:00', fim: '2026-10-07T15:00:00-03:00' }))).toBe(
      'qua 07/10 14:00–15:00',
    ));
  it('dia inteiro de um dia', () =>
    expect(rotuloBrt(ev({ diaInteiro: true, inicio: '2026-10-07', fim: '2026-10-08' }))).toBe('qua 07/10 (dia inteiro)'));
  it('dia inteiro de vários dias', () =>
    expect(rotuloBrt(ev({ diaInteiro: true, inicio: '2026-10-07', fim: '2026-10-09' }))).toBe(
      'qua 07/10 → qui 08/10 (dia inteiro)',
    ));
});

describe('resumoParaIa', () => {
  it('leva hora_brt, link e marca só leitura e quem organizou', () => {
    expect(
      resumoParaIa(
        ev({
          inicio: '2026-10-07T14:00:00-03:00',
          fim: '2026-10-07T15:00:00-03:00',
          link: 'https://calendar.google.com/e',
          editavel: false,
          organizador: 'cliente@exemplo.com',
        }),
        'Eu',
      ),
    ).toEqual({
      agenda: 'a',
      agenda_nome: 'Eu',
      id: 'e',
      titulo: 'x',
      hora_brt: 'qua 07/10 14:00–15:00',
      inicio: '2026-10-07T14:00:00-03:00',
      fim: '2026-10-07T15:00:00-03:00',
      link: 'https://calendar.google.com/e',
      somente_leitura: true,
      organizador: 'cliente@exemplo.com',
    });
  });
});
