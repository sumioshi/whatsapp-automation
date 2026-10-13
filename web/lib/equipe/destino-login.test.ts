import { describe, expect, it } from 'vitest';
import { caminhoInterno } from './destino-login';

describe('caminhoInterno', () => {
  it('mantém caminhos internos', () => {
    expect(caminhoInterno('/clientes?x=1')).toBe('/clientes?x=1');
    expect(caminhoInterno('/atendimento/g/a')).toBe('/atendimento/g/a');
  });
  it('cai em "/" quando o destino sairia da origem ou não é caminho', () => {
    for (const v of ['//evil.example', '/\\evil.example', '/\t/evil.example', 'https://evil.example', 42, null, undefined]) {
      expect(caminhoInterno(v)).toBe('/');
    }
  });
  it('não vira caminho de outro site numa segunda passada', () => {
    for (const v of ['/.//evil.example', '/..//evil.example', '/%2e//evil.example', '/./\\evil.example']) {
      const uma = caminhoInterno(v);
      expect(uma.startsWith('//') || uma.startsWith('/\\')).toBe(false);
      expect(caminhoInterno(uma)).toBe(uma);
    }
  });
});
