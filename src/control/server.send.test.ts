import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { WhatsAppGateway } from '../core/ports.js';
import type { Passo } from '../humano/plano.js';
import { startControlServer } from './server.js';

const JID = '5511999999999@s.whatsapp.net';
const servers: import('node:http').Server[] = [];

/** Gateway falso: a "entrega" só termina quando o sinal aborta (ou em 3 s). */
function gatewayFalso() {
  const estado = { abortado: false, chamadas: 0 };
  const gw = {
    async entregarHumano(_jid: string, _plano: Passo[], signal?: AbortSignal) {
      estado.chamadas += 1;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 3000);
        signal?.addEventListener(
          'abort',
          () => {
            estado.abortado = true;
            clearTimeout(t);
            resolve();
          },
          { once: true },
        );
      });
      return { enviados: 0, total: 1, cancelado: estado.abortado };
    },
    async sendText() {},
  } as unknown as WhatsAppGateway;
  return { gw, estado };
}

async function subir(gw: WhatsAppGateway): Promise<string> {
  const server = startControlServer(gw, 0, []);
  servers.push(server);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const espera = async (cond: () => boolean, ms = 2000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

afterEach(async () => {
  for (const s of servers.splice(0)) await new Promise<void>((r) => s.close(() => r()));
});

describe('control /send — cancelamento', () => {
  it('cliente que desconecta no meio aborta a entrega no gateway', async () => {
    const { gw, estado } = gatewayFalso();
    const base = await subir(gw);
    const ac = new AbortController();
    const req = fetch(`${base}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jid: JID, text: 'oi', humano: true, umBalao: true }),
      signal: ac.signal,
    }).catch(() => null);
    await espera(() => estado.chamadas === 1);
    ac.abort();
    await req;
    await espera(() => estado.abortado);
    expect(estado.abortado).toBe(true);
  });

  it('POST /cancelar-envio aborta a entrega daquele jid e o /send responde cancelado', async () => {
    const { gw, estado } = gatewayFalso();
    const base = await subir(gw);
    const envio = fetch(`${base}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jid: JID, text: 'oi', humano: true, umBalao: true }),
    });
    await espera(() => estado.chamadas === 1);
    const cancel = await fetch(`${base}/cancelar-envio`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jid: JID }),
    });
    expect(await cancel.json()).toEqual({ ok: true, cancelado: true });
    const r = (await (await envio).json()) as Record<string, unknown>;
    expect(r).toMatchObject({ ok: true, cancelado: true, enviados: 0, baloes: 1 });
  });

  it('POST /cancelar-envio sem entrega em andamento responde cancelado:false', async () => {
    const { gw } = gatewayFalso();
    const base = await subir(gw);
    const res = await fetch(`${base}/cancelar-envio`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jid: JID }),
    });
    expect(await res.json()).toEqual({ ok: true, cancelado: false });
  });
});

describe('control /send — balões explícitos', () => {
  it('baloes no corpo viram os balões do plano (um por item)', async () => {
    const planos: string[][] = [];
    const gw = {
      async entregarHumano(_jid: string, plano: Passo[]) {
        const textos = plano.flatMap((p) => (p.tipo === 'enviar' ? [p.texto] : []));
        planos.push(textos);
        return { enviados: textos.length, total: textos.length, cancelado: false };
      },
    } as unknown as WhatsAppGateway;
    const base = await subir(gw);
    const res = await fetch(`${base}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jid: JID, humano: true, baloes: ['um', 'dois', 'três'] }),
    });
    expect(await res.json()).toMatchObject({ ok: true, baloes: 3, enviados: 3 });
    expect(planos[0]).toEqual(['um', 'dois', 'três']);
  });
});
