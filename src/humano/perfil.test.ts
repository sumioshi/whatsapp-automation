import { describe, expect, it } from 'vitest';
import { calcularPerfil } from './perfil';

describe('calcularPerfil', () => {
  it('menos de 30 msgs → null (chamador usa default)', () => {
    expect(calcularPerfil(Array.from({ length: 29 }, () => 'oi'))).toBeNull();
  });

  it('calcula tamanho médio e fração de resposta curta do histórico real', () => {
    const curtas = Array.from({ length: 20 }, () => 'blz');
    const longas = Array.from({ length: 20 }, () => 'a'.repeat(150));
    const p = calcularPerfil([...curtas, ...longas]);
    expect(p).not.toBeNull();
    expect(p!.tamanhoMedioBalao).toBeGreaterThan(60);
    expect(p!.fracaoRespostaCurta).toBeCloseTo(0.5, 1);
  });
});
