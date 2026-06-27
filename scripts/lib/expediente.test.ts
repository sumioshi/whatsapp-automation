import { describe, expect, it } from 'vitest';
import { estadoExpediente, recadoPara, type ExpedienteConfig } from './expediente';

const base: ExpedienteConfig = {
  ativo: true,
  timezone: 'America/Sao_Paulo',
  dias: {
    seg: ['09:00', '18:00'],
    ter: ['09:00', '18:00'],
    qua: ['09:00', '18:00'],
    qui: ['09:00', '18:00'],
    sex: ['09:00', '18:00'],
  },
  recado_dentro: 'Disponível',
  recado_fora: 'Fora do expediente',
};

// Helper: cria um Date a partir de um horário em São Paulo (UTC-3, sem horário de verão hoje).
// 2026-06-26 é uma sexta-feira.
function spt(iso: string): Date {
  // iso no formato 'YYYY-MM-DDTHH:MM' interpretado como horário de Brasília (UTC-3)
  return new Date(`${iso}:00-03:00`);
}

describe('estadoExpediente', () => {
  it('dentro: sexta 10:00 em dia útil com faixa 09-18', () => {
    expect(estadoExpediente(spt('2026-06-26T10:00'), base)).toBe('dentro');
  });

  it('fora: sexta 08:59 antes de abrir', () => {
    expect(estadoExpediente(spt('2026-06-26T08:59'), base)).toBe('fora');
  });

  it('fora: sexta 18:00 no fechamento (faixa é [abre, fecha))', () => {
    expect(estadoExpediente(spt('2026-06-26T18:00'), base)).toBe('fora');
  });

  it('dentro: sexta 17:59 ainda dentro', () => {
    expect(estadoExpediente(spt('2026-06-26T17:59'), base)).toBe('dentro');
  });

  it('fora: sábado o dia todo (dia ausente na config)', () => {
    // 2026-06-27 é sábado
    expect(estadoExpediente(spt('2026-06-27T12:00'), base)).toBe('fora');
  });

  it('respeita o timezone do config: o mesmo instante UTC muda de estado conforme a TZ', () => {
    // 2026-06-26T11:30Z = 08:30 em São Paulo (fora) mas 11:30 em Lisboa (dentro, se TZ fosse Europe/Lisbon)
    const instante = new Date('2026-06-26T11:30:00Z');
    expect(estadoExpediente(instante, base)).toBe('fora'); // 08:30 BRT
    expect(estadoExpediente(instante, { ...base, timezone: 'Europe/Lisbon' })).toBe('dentro'); // 12:30 WEST
  });

  it('faixa vazia [] no dia = fora o dia todo', () => {
    const cfg: ExpedienteConfig = { ...base, dias: { ...base.dias, sex: undefined } };
    expect(estadoExpediente(spt('2026-06-26T10:00'), cfg)).toBe('fora');
  });
});

describe('recadoPara', () => {
  it('dentro → recado_dentro', () => {
    expect(recadoPara('dentro', base)).toBe('Disponível');
  });
  it('fora → recado_fora', () => {
    expect(recadoPara('fora', base)).toBe('Fora do expediente');
  });
});
