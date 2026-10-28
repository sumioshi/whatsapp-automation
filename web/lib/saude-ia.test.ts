import { describe, expect, it } from 'vitest';
import { avisosDeSaude, FALHAS_PRA_AVISAR, registrar, type SaudeIa } from './saude-ia';

const t = (h: number) => `2026-10-28T${String(h).padStart(2, '0')}:00:00.000Z`;
const falhar = (estado: SaudeIa, n: number, erro: string): SaudeIa => {
  let e = estado;
  for (let i = 0; i < n; i++) e = registrar(e, 'postura', erro, t(12 + i));
  return e;
};

describe('saúde da IA', () => {
  it('chave recusada avisa já na primeira falha, com o início da sequência', () => {
    const avisos = avisosDeSaude(falhar({}, 1, 'OpenRouter HTTP 401: User not found'));
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('revisão de postura');
    expect(avisos[0]).toContain('1 falha desde 28/10, 09:00');
    expect(avisos[0]).toContain('401');
  });

  it('erro passageiro só avisa quando se repete', () => {
    const erro = 'postura não avaliada: The operation was aborted due to timeout';
    expect(avisosDeSaude(falhar({}, FALHAS_PRA_AVISAR - 1, erro))).toEqual([]);
    expect(avisosDeSaude(falhar({}, FALHAS_PRA_AVISAR, erro))[0]).toContain(`${FALHAS_PRA_AVISAR} falhas seguidas`);
  });

  it('um sucesso zera a sequência e some o aviso', () => {
    const quebrado = falhar({}, 5, 'OpenRouter HTTP 402: sem saldo');
    const voltou = registrar(quebrado, 'postura', null, t(20));
    expect(avisosDeSaude(voltou)).toEqual([]);
    expect(voltou.postura).toMatchObject({ falhasSeguidas: 0, desde: null, ultimoOk: t(20) });
  });

  it('cada serviço tem a própria sequência', () => {
    const e = registrar(falhar({}, 1, 'HTTP 401'), 'transcricao', null, t(13));
    expect(avisosDeSaude(e)).toHaveLength(1);
    expect(e.transcricao?.falhasSeguidas).toBe(0);
  });
});
