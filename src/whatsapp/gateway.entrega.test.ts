import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Passo } from '../humano/plano.js';
import { BaileysGateway } from './gateway.js';

type SockFake = {
  user: { id: string };
  enviadas: string[];
  presencas: string[];
  sendMessage(
    jid: string,
    c: { text: string },
  ): Promise<{ key: { remoteJid: string; fromMe: true; id: string } }>;
  sendPresenceUpdate(p: string): Promise<void>;
  readMessages(): Promise<void>;
};

async function makeGateway() {
  const base = await mkdtemp(join(tmpdir(), 'wac-gw-entrega-'));
  await mkdir(join(base, 'auth'));
  await mkdir(join(base, 'data'));
  const gw = new BaileysGateway(join(base, 'auth'), join(base, 'data'));
  const sock: SockFake = {
    user: { id: '5511888888888:2@s.whatsapp.net' },
    enviadas: [],
    presencas: [],
    async sendMessage(jid, c) {
      this.enviadas.push(c.text);
      return {
        key: {
          remoteJid: jid,
          fromMe: true,
          id: `3EB0${String(this.enviadas.length).padStart(18, '0')}`,
        },
      };
    },
    async sendPresenceUpdate(p) {
      this.presencas.push(p);
    },
    async readMessages() {},
  };
  (gw as unknown as { sock: unknown }).sock = sock;
  return { gw, sock };
}

const JID = '5511999999999@s.whatsapp.net';
const plano: Passo[] = [
  { tipo: 'visto' },
  { tipo: 'pausa', ms: 150 },
  { tipo: 'digitando', ms: 150 },
  { tipo: 'enviar', texto: 'primeiro' },
  { tipo: 'pausa', ms: 300 },
  { tipo: 'enviar', texto: 'segundo' },
];

describe('entregarHumano — cancelamento', () => {
  it('sem abort toca a partitura inteira', async () => {
    const { gw, sock } = await makeGateway();
    const r = await gw.entregarHumano(JID, plano);
    expect(r).toEqual({ enviados: 2, total: 2, cancelado: false });
    expect(sock.enviadas).toEqual(['primeiro', 'segundo']);
  });

  it('abort antes do 1º balão: nada sai, presença volta pra paused', async () => {
    const { gw, sock } = await makeGateway();
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 50);
    const t0 = Date.now();
    const r = await gw.entregarHumano(JID, plano, ac.signal);
    expect(r).toEqual({ enviados: 0, total: 2, cancelado: true });
    expect(sock.enviadas).toEqual([]);
    expect(sock.presencas.at(-1)).toBe('paused');
    // não esperou o sleep inteiro: o dormir é abortável
    expect(Date.now() - t0).toBeLessThan(250);
  });

  it('abort entre balões: para no que já saiu', async () => {
    const { gw, sock } = await makeGateway();
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 400);
    const r = await gw.entregarHumano(JID, plano, ac.signal);
    expect(r).toEqual({ enviados: 1, total: 2, cancelado: true });
    expect(sock.enviadas).toEqual(['primeiro']);
  });

  it('sinal já abortado antes de começar: não manda nada', async () => {
    const { gw, sock } = await makeGateway();
    const r = await gw.entregarHumano(JID, plano, AbortSignal.abort());
    expect(r.cancelado).toBe(true);
    expect(sock.enviadas).toEqual([]);
  });
});
