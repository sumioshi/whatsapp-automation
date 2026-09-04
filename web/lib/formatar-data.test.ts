import { describe, expect, it } from 'vitest';
import { dataCurta, dataLonga, instanteCurto, instanteLongo } from './formatar-data';

// O processo de teste roda em UTC (vitest fixa TZ), mas o navegador do operador
// está em America/Sao_Paulo. Data pura não pode depender disso: os casos abaixo
// pegam justamente as viradas em que converter por `Date` mudaria o dia.
describe('data pura (YYYY-MM-DD) não desloca por fuso', () => {
  it('formata por fatia de string, sem Date', () => {
    expect(dataCurta('2026-12-31')).toBe('31/12');
    expect(dataCurta('2026-01-01')).toBe('01/01');
    expect(dataLonga('2026-12-31')).toBe('31/12/2026');
  });
  it('vazio, nulo e lixo viram travessão', () => {
    expect(dataCurta(null)).toBe('—');
    expect(dataCurta('')).toBe('—');
    expect(dataCurta('ontem')).toBe('—');
    expect(dataLonga(undefined)).toBe('—');
  });
});

describe('instante ISO em Brasília', () => {
  it('aplica o offset -3h na virada do dia', () => {
    // 04/09 01:30 UTC ainda é 03/09 22:30 em Brasília.
    expect(instanteCurto('2026-09-04T01:30:00.000Z')).toBe('03/09');
    // A vírgula entre data e hora é do formato pt-BR do Intl (era o que o
    // toLocaleString já produzia); o que importa aqui é o dia não escorregar.
    expect(instanteLongo('2026-09-04T01:30:00.000Z')).toBe('03/09/2026, 22:30');
  });
  it('nulo vira travessão; ISO inválido volta cru no formato longo', () => {
    expect(instanteCurto(null)).toBe('—');
    expect(instanteCurto('nada')).toBe('—');
    expect(instanteLongo('nada')).toBe('nada');
  });
});
