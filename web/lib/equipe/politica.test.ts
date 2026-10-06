import { describe, expect, it } from 'vitest';
import { areaDoAtendente, decidir } from './politica';

const dono = { papel: 'dono' as const, login: 'operador' };
const ana = { papel: 'atendente' as const, login: 'ana' };

describe('areaDoAtendente', () => {
  it('casa só a área e as rotas dela', () => {
    for (const p of ['/atendimento', '/atendimento/', '/atendimento/g/grupo-a', '/api/atendimento/enviar', '/api/logout']) {
      expect(areaDoAtendente(p)).toBe(true);
    }
    for (const p of ['/atendimentox', '/api/atendimentos', '/api/atendimento', '/config', '/', '/api/send', '/g/grupo-a', '/atendimento/../config']) {
      expect(areaDoAtendente(p)).toBe(false);
    }
  });
});

describe('decidir', () => {
  it('sem identidade: página vai pro login, API leva 401', () => {
    expect(decidir(null, '/clientes', true)).toEqual({ tipo: 'login' });
    expect(decidir(null, '/api/messages', false)).toEqual({ tipo: 'negar', status: 401 });
  });
  it('dono passa em tudo', () => {
    expect(decidir(dono, '/config', true)).toEqual({ tipo: 'seguir' });
    expect(decidir(dono, '/api/atendimento/chats', false)).toEqual({ tipo: 'seguir' });
  });
  it('atendente: área passa; resto é redirecionado (página) ou 403 (API)', () => {
    expect(decidir(ana, '/atendimento/g/grupo-a', true)).toEqual({ tipo: 'seguir' });
    expect(decidir(ana, '/api/atendimento/mensagens', false)).toEqual({ tipo: 'seguir' });
    expect(decidir(ana, '/config', true)).toEqual({ tipo: 'redirecionar', para: '/atendimento' });
    expect(decidir(ana, '/', true)).toEqual({ tipo: 'redirecionar', para: '/atendimento' });
    expect(decidir(ana, '/api/media/grupo-a/audio/x.ogg', false)).toEqual({ tipo: 'negar', status: 403 });
    expect(decidir(ana, '/api/send', false)).toEqual({ tipo: 'negar', status: 403 });
  });
});
