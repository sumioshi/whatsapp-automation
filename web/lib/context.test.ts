import { describe, expect, it } from 'vitest';
import { horaBRT } from './context';

describe('horaBRT', () => {
  it('converte UTC para Brasília (-3h) — msg da noite vira a hora certa', () => {
    // 01:11 UTC = 22:11 do dia anterior em BRT (o caso real que confundiu).
    expect(horaBRT('2026-06-26T01:11:00.000Z')).toBe('25/06, 22:11');
    expect(horaBRT('2026-06-26T00:25:00.000Z')).toBe('25/06, 21:25');
  });

  it('mesma data quando não cruza meia-noite', () => {
    expect(horaBRT('2026-06-26T16:19:38.000Z')).toBe('26/06, 13:19');
  });

  it('data inválida cai pro valor cru', () => {
    expect(horaBRT('não-é-data')).toBe('não-é-data');
  });
});
