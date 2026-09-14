import { describe, expect, it } from 'vitest';
import {
  adiar,
  aoReiniciar,
  CONFIG_FILA,
  cancelar,
  clienteDigitando,
  clienteParou,
  enfileirar,
  interromper,
  marcarEntregando,
  marcarEntregue,
  marcarFalha,
  novoEstado,
  novoTicket,
  podar,
  proximo,
  proximoDisparo,
  proximosParaLer,
  registrarMensagemNova,
  terminal,
  ticketVivo,
} from './fila-core';

const JID_A = '5511000000001@s.whatsapp.net';
const JID_B = '5511000000002@s.whatsapp.net';
const T0 = 1_700_000_000_000;

function ticket(jid: string, over: Partial<Parameters<typeof novoTicket>[0]> = {}) {
  return novoTicket({
    id: `t-${jid}-${over.criadoEm ?? T0}`,
    jid,
    slug: 'chat',
    baloes: ['oi'],
    origem: 'mcp',
    opts: { typos: false, umBalao: false, urgencia: 'normal' },
    criadoEm: T0,
    entregarEm: T0 + 30_000,
    lerEm: T0 + 10_000,
    regime: 'ativa',
    ...over,
  });
}

describe('fila-core — enfileirar e substituir', () => {
  it('um ticket por chat: o novo cancela o anterior com motivo substituido', () => {
    const e = novoEstado();
    const a = ticket(JID_A);
    enfileirar(e, a, T0);
    const r = enfileirar(e, ticket(JID_A, { id: 'novo' }), T0 + 1000);
    expect(r.substituiu).toBe(a.id);
    expect(a.estado).toBe('cancelado');
    expect(a.motivo).toBe('substituido');
    expect(ticketVivo(e, JID_A)?.id).toBe('novo');
  });

  it('chats diferentes convivem', () => {
    const e = novoEstado();
    enfileirar(e, ticket(JID_A), T0);
    const r = enfileirar(e, ticket(JID_B), T0);
    expect(r.substituiu).toBeUndefined();
    expect(e.tickets.filter((t) => t.estado === 'agendado')).toHaveLength(2);
  });
});

describe('fila-core — próximo a executar', () => {
  it('só dispara quando entregarEm chegou e o cliente está quieto', () => {
    const e = novoEstado();
    const t = ticket(JID_A);
    enfileirar(e, t, T0);
    expect(proximo(e, T0 + 29_000)).toBeNull();
    expect(proximo(e, T0 + 30_000)?.id).toBe(t.id);
    clienteDigitando(e, JID_A, T0 + 30_000);
    expect(proximo(e, T0 + 31_000)).toBeNull();
    expect(proximo(e, T0 + 30_000 + CONFIG_FILA.digitandoPasso_ms + 1)?.id).toBe(t.id);
  });

  it('cliente que digita sem parar segura no máximo o teto (60 s)', () => {
    const e = novoEstado();
    const t = ticket(JID_A);
    enfileirar(e, t, T0);
    for (let ms = 0; ms <= CONFIG_FILA.tetoEsperaDigitando_ms + 10_000; ms += 3000) {
      clienteDigitando(e, JID_A, T0 + 30_000 + ms);
    }
    expect(proximo(e, T0 + 30_000 + CONFIG_FILA.tetoEsperaDigitando_ms + 12_000)?.id).toBe(t.id);
  });

  it('clienteParou libera na hora', () => {
    const e = novoEstado();
    enfileirar(e, ticket(JID_A), T0);
    clienteDigitando(e, JID_A, T0 + 30_000);
    clienteParou(e, JID_A);
    expect(proximo(e, T0 + 30_000)).not.toBeNull();
  });

  it('cap global de 2 entregas simultâneas e 15 s entre inícios em chats diferentes', () => {
    const e = novoEstado();
    const a = ticket(JID_A);
    const b = ticket(JID_B);
    const c = ticket('5511000000003@s.whatsapp.net');
    enfileirar(e, a, T0);
    enfileirar(e, b, T0);
    enfileirar(e, c, T0);
    const t = T0 + 30_000;
    expect(proximo(e, t)?.id).toBe(a.id);
    marcarEntregando(e, a.id, t);
    expect(proximo(e, t + 1000)).toBeNull();
    expect(proximo(e, t + CONFIG_FILA.intervaloEntreChats_ms)?.id).toBe(b.id);
    marcarEntregando(e, b.id, t + CONFIG_FILA.intervaloEntreChats_ms);
    expect(proximo(e, t + 2 * CONFIG_FILA.intervaloEntreChats_ms)).toBeNull();
    marcarEntregue(e, a.id, 1, t + 40_000);
    expect(proximo(e, t + 2 * CONFIG_FILA.intervaloEntreChats_ms)?.id).toBe(c.id);
  });

  it('ordena pelo entregarEm mais antigo', () => {
    const e = novoEstado();
    const tarde = ticket(JID_A, { entregarEm: T0 + 60_000 });
    const cedo = ticket(JID_B, { entregarEm: T0 + 20_000 });
    enfileirar(e, tarde, T0);
    enfileirar(e, cedo, T0);
    expect(proximo(e, T0 + 60_000)?.id).toBe(cedo.id);
  });
});

describe('fila-core — visto', () => {
  it('proximosParaLer devolve agendados com lerEm vencido e ainda não lidos', () => {
    const e = novoEstado();
    const t = ticket(JID_A);
    enfileirar(e, t, T0);
    expect(proximosParaLer(e, T0 + 9_000)).toEqual([]);
    expect(proximosParaLer(e, T0 + 10_000).map((x) => x.id)).toEqual([t.id]);
    t.lido = true;
    expect(proximosParaLer(e, T0 + 10_000)).toEqual([]);
  });
});

describe('fila-core — mensagem nova e interrupções', () => {
  it('mensagem nova em agendado adia 20–45 s e conta', () => {
    const e = novoEstado();
    const t = ticket(JID_A);
    enfileirar(e, t, T0);
    const r = registrarMensagemNova(e, JID_A, T0 + 29_000, () => 0.5);
    expect(r?.id).toBe(t.id);
    expect(t.mensagensNovas).toBe(1);
    expect(t.entregarEm).toBe(T0 + 29_000 + 32_500);
    expect(t.estado).toBe('agendado');
  });

  it('mensagem nova em entregando interrompe com motivo mensagem_nova', () => {
    const e = novoEstado();
    const t = ticket(JID_A);
    enfileirar(e, t, T0);
    marcarEntregando(e, t.id, T0 + 30_000);
    registrarMensagemNova(e, JID_A, T0 + 31_000, () => 0);
    expect(t.estado).toBe('interrompido');
    expect(t.motivo).toBe('mensagem_nova');
  });

  it('interromper por jid ou por id; cancelar marca operador', () => {
    const e = novoEstado();
    const t = ticket(JID_A);
    enfileirar(e, t, T0);
    expect(interromper(e, { jid: JID_A }, 'operador_respondeu', T0 + 1)?.id).toBe(t.id);
    expect(t.estado).toBe('interrompido');
    const u = ticket(JID_B);
    enfileirar(e, u, T0);
    expect(cancelar(e, { ticket: u.id }, T0 + 1)?.motivo).toBe('operador');
    expect(cancelar(e, { ticket: u.id }, T0 + 2)).toBeNull();
  });

  it('adiar nunca antecipa e puxa lerEm junto', () => {
    const e = novoEstado();
    const t = ticket(JID_A, { entregarEm: T0 + 30_000, lerEm: T0 + 40_000 });
    enfileirar(e, t, T0);
    adiar(e, JID_A, T0 + 10_000);
    expect(t.entregarEm).toBe(T0 + 30_000);
    adiar(e, JID_A, T0 + 50_000);
    expect(t.entregarEm).toBe(T0 + 50_000);
    expect(t.lerEm).toBeLessThanOrEqual(t.entregarEm);
  });
});

describe('fila-core — falha, reinício, poda', () => {
  it('falha reagenda +60 s até 3 tentativas, depois interrompido(falha)', () => {
    const e = novoEstado();
    const t = ticket(JID_A);
    enfileirar(e, t, T0);
    marcarEntregando(e, t.id, T0);
    marcarFalha(e, t.id, 0, T0 + 1);
    expect(t.estado).toBe('agendado');
    expect(t.entregarEm).toBe(T0 + 1 + CONFIG_FILA.retryFalha_ms);
    marcarEntregando(e, t.id, T0);
    marcarFalha(e, t.id, 0, T0);
    marcarEntregando(e, t.id, T0);
    marcarFalha(e, t.id, 1, T0);
    expect(t.estado).toBe('interrompido');
    expect(t.motivo).toBe('falha');
    expect(t.enviados).toBe(1);
  });

  it('aoReiniciar: entregando → interrompido(reinicio); agendado vencido → +5 s', () => {
    const e = novoEstado();
    const a = ticket(JID_A);
    const b = ticket(JID_B, { entregarEm: T0 - 1000, lerEm: T0 - 2000 });
    enfileirar(e, a, T0);
    enfileirar(e, b, T0);
    marcarEntregando(e, a.id, T0);
    aoReiniciar(e, T0 + 100);
    expect(a.estado).toBe('interrompido');
    expect(a.motivo).toBe('reinicio');
    expect(b.entregarEm).toBe(T0 + 100 + CONFIG_FILA.retomadaAposReinicio_ms);
    expect(b.lerEm).toBe(b.entregarEm);
  });

  it('proximoDisparo é o menor entre lerEm (não lido) e entregarEm dos agendados', () => {
    const e = novoEstado();
    expect(proximoDisparo(e)).toBeNull();
    const t = ticket(JID_A, { lerEm: T0 + 7000, entregarEm: T0 + 30_000 });
    enfileirar(e, t, T0);
    expect(proximoDisparo(e)).toBe(T0 + 7000);
    t.lido = true;
    expect(proximoDisparo(e)).toBe(T0 + 30_000);
  });

  it('podar remove terminais com mais de 24 h e mantém no máximo 200', () => {
    const e = novoEstado();
    for (let i = 0; i < 250; i++) {
      const t = ticket(`${i}@s.whatsapp.net`, { id: `t${i}` });
      enfileirar(e, t, T0);
      marcarEntregando(e, t.id, T0);
      marcarEntregue(e, t.id, 1, T0);
    }
    podar(e, T0 + 1000);
    expect(e.tickets.length).toBeLessThanOrEqual(200);
    podar(e, T0 + 25 * 3600_000);
    expect(e.tickets).toEqual([]);
    expect(terminal(ticket(JID_A))).toBe(false);
  });
});
