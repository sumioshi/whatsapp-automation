import { describe, expect, it } from 'vitest';
import {
  type Agenda,
  ErroAgenda,
  type Evento,
  agendaDoGoogle,
  comFuso,
  corpoDaEdicao,
  corpoDoGoogle,
  entradaDeJson,
  eventoDoGoogle,
  instanteDe,
  isoBrt,
  somarDias,
  validarEntrada,
} from './evento';

const principal: Agenda = { id: 'eu@exemplo.com', nome: 'Eu', cor: '#4285f4', principal: true, gravavel: true };
const feriados: Agenda = {
  id: 'pt.brazilian#holiday@group.v.calendar.google.com',
  nome: 'Feriados',
  cor: '#0b8043',
  principal: false,
  gravavel: false,
};

describe('datas', () => {
  it('sem fuso vale Brasília', () => expect(comFuso('2026-10-08T14:00')).toBe('2026-10-08T14:00:00-03:00'));
  it('com fuso fica como veio', () => expect(comFuso('2026-10-08T17:00:00Z')).toBe('2026-10-08T17:00:00Z'));
  it('texto solto é entrada inválida', () => expect(() => comFuso('amanhã 14h')).toThrow(ErroAgenda));
  it('isoBrt', () => expect(isoBrt(Date.parse('2026-10-08T17:00:00Z'))).toBe('2026-10-08T14:00:00-03:00'));
  it('somarDias vira o mês', () => expect(somarDias('2026-10-31', 1)).toBe('2026-11-01'));
  it('instanteDe de dia inteiro é meia-noite de Brasília', () =>
    expect(instanteDe('2026-10-08')).toBe(Date.parse('2026-10-08T03:00:00Z')));
});

describe('agendaDoGoogle', () => {
  it('writer grava, reader não; apelido ganha do nome', () => {
    expect(
      agendaDoGoogle({ id: 'a', summary: 'A', summaryOverride: 'Apelido', accessRole: 'writer', backgroundColor: '#123456' }),
    ).toEqual({ id: 'a', nome: 'Apelido', cor: '#123456', principal: false, gravavel: true });
    expect(agendaDoGoogle({ id: 'b', accessRole: 'reader' }).gravavel).toBe(false);
  });
});

describe('eventoDoGoogle', () => {
  it('evento com hora, Meet e convidados (sem a própria conta)', () => {
    const ev = eventoDoGoogle(
      {
        id: 'e1',
        summary: 'Call',
        start: { dateTime: '2026-10-08T14:00:00-03:00' },
        end: { dateTime: '2026-10-08T15:00:00-03:00' },
        hangoutLink: 'https://meet.google.com/abc',
        attendees: [{ email: 'eu@exemplo.com', self: true }, { email: 'cliente@exemplo.com' }],
        htmlLink: 'https://calendar.google.com/x',
      },
      principal,
    );
    expect(ev).toEqual({
      id: 'e1',
      agenda: principal.id,
      titulo: 'Call',
      inicio: '2026-10-08T14:00:00-03:00',
      fim: '2026-10-08T15:00:00-03:00',
      diaInteiro: false,
      convidados: ['cliente@exemplo.com'],
      meet: 'https://meet.google.com/abc',
      recorrente: false,
      editavel: true,
      cor: '#4285f4',
      link: 'https://calendar.google.com/x',
    });
  });
  it('dia inteiro, sem título, recorrente, agenda só leitura', () => {
    const ev = eventoDoGoogle(
      { id: 'e2', start: { date: '2026-10-12' }, end: { date: '2026-10-13' }, recurringEventId: 'r' },
      feriados,
    )!;
    expect([ev.diaInteiro, ev.titulo, ev.recorrente, ev.editavel, ev.inicio, ev.fim]).toEqual([
      true,
      '(sem título)',
      true,
      false,
      '2026-10-12',
      '2026-10-13',
    ]);
  });
  it('cancelado some', () => expect(eventoDoGoogle({ id: 'e3', status: 'cancelled' }, principal)).toBeNull());
});

describe('validarEntrada', () => {
  it('sem fim dura 30 min', () => {
    const v = validarEntrada({ titulo: ' Call ', inicio: '2026-10-08T14:00' });
    expect([v.titulo, v.inicio, v.fim, v.diaInteiro]).toEqual([
      'Call',
      '2026-10-08T14:00:00-03:00',
      '2026-10-08T14:30:00-03:00',
      false,
    ]);
  });
  it('duracaoMin atravessa a meia-noite', () =>
    expect(validarEntrada({ titulo: 'x', inicio: '2026-10-08T23:30', duracaoMin: 60 }).fim).toBe(
      '2026-10-09T00:30:00-03:00',
    ));
  it('dia inteiro sem fim = um dia', () => {
    const v = validarEntrada({ titulo: 'x', inicio: '2026-10-08', diaInteiro: true });
    expect([v.inicio, v.fim]).toEqual(['2026-10-08', '2026-10-09']);
  });
  it('recusa fim antes do início, título vazio, data impossível e e-mail ruim', () => {
    expect(() => validarEntrada({ titulo: 'x', inicio: '2026-10-08T14:00', fim: '2026-10-08T13:00' })).toThrow(
      'fim precisa ser depois do início',
    );
    expect(() => validarEntrada({ titulo: '  ', inicio: '2026-10-08T14:00' })).toThrow('título obrigatório');
    expect(() => validarEntrada({ titulo: 'x', inicio: '2026-02-30', diaInteiro: true })).toThrow(ErroAgenda);
    expect(() => validarEntrada({ titulo: 'x', inicio: '2026-10-08T14:00', convidados: ['não é email'] })).toThrow(
      'e-mail de convidado inválido',
    );
  });
  it('convidados normalizados e sem repetição', () =>
    expect(
      validarEntrada({ titulo: 'x', inicio: '2026-10-08T14:00', convidados: ['A@Ex.com', 'a@ex.com '] }).convidados,
    ).toEqual(['a@ex.com']));
});

describe('corpoDoGoogle', () => {
  it('com hora leva timeZone; Meet pede conferência; sem convidado não manda attendees', () => {
    expect(corpoDoGoogle(validarEntrada({ titulo: 'Call', inicio: '2026-10-08T14:00', meet: true }), 'req-1')).toEqual({
      summary: 'Call',
      start: { dateTime: '2026-10-08T14:00:00-03:00', timeZone: 'America/Sao_Paulo' },
      end: { dateTime: '2026-10-08T14:30:00-03:00', timeZone: 'America/Sao_Paulo' },
      conferenceData: { createRequest: { requestId: 'req-1', conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    });
  });
  it('dia inteiro usa date', () =>
    expect(corpoDoGoogle(validarEntrada({ titulo: 'x', inicio: '2026-10-08', diaInteiro: true }), 'r').start).toEqual({
      date: '2026-10-08',
    }));
});

describe('corpoDaEdicao', () => {
  const atual: Evento = {
    id: 'e1',
    agenda: principal.id,
    titulo: 'Call',
    inicio: '2026-10-08T14:00:00-03:00',
    fim: '2026-10-08T15:30:00-03:00',
    diaInteiro: false,
    local: 'Sala',
    convidados: ['c@ex.com'],
    recorrente: false,
    editavel: true,
    cor: '#4285f4',
  };
  it('mudar só o início mantém a duração', () => {
    const { corpo } = corpoDaEdicao(atual, { inicio: '2026-10-09T10:00' }, 'r');
    expect([corpo.start, corpo.end]).toEqual([
      { dateTime: '2026-10-09T10:00:00-03:00', timeZone: 'America/Sao_Paulo' },
      { dateTime: '2026-10-09T11:30:00-03:00', timeZone: 'America/Sao_Paulo' },
    ]);
  });
  it('não mexe em convidados se não vierem, mas avisa quem já está convidado', () => {
    const r = corpoDaEdicao(atual, { titulo: 'Call nova' }, 'r');
    expect(r.corpo).not.toHaveProperty('attendees');
    expect(r.avisar).toBe(true);
    expect(r.corpo.summary).toBe('Call nova');
  });
  it('local vazio limpa o campo no Google', () => expect(corpoDaEdicao(atual, { local: '' }, 'r').corpo.location).toBe(''));
  it('virar dia inteiro exige o início novo', () =>
    expect(() => corpoDaEdicao(atual, { diaInteiro: true }, 'r')).toThrow('mande o início'));
  it('dia inteiro de 2 dias movido mantém 2 dias e não avisa ninguém', () => {
    const ad: Evento = { ...atual, diaInteiro: true, inicio: '2026-10-08', fim: '2026-10-10', convidados: [] };
    const r = corpoDaEdicao(ad, { inicio: '2026-10-20' }, 'r');
    expect([r.corpo.start, r.corpo.end, r.avisar]).toEqual([{ date: '2026-10-20' }, { date: '2026-10-22' }, false]);
  });
});

describe('entradaDeJson', () => {
  it('pega só campos conhecidos com tipo certo', () =>
    expect(entradaDeJson({ titulo: 'x', inicio: '2026-10-08T14:00', id: 'ignorado', meet: true })).toEqual({
      titulo: 'x',
      inicio: '2026-10-08T14:00',
      meet: true,
    }));
  it('tipo errado é entrada inválida', () => {
    expect(() => entradaDeJson({ titulo: 1 })).toThrow('titulo precisa ser texto');
    expect(() => entradaDeJson({ convidados: 'a@b.com' })).toThrow('convidados');
    expect(() => entradaDeJson(null)).toThrow(ErroAgenda);
  });
});
