import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WhatsAppGateway } from '../core/ports.js';
import { FilaEnvio } from '../humano/fila.js';
import type { Passo } from '../humano/plano.js';
import { startControlServer } from './server.js';

const JID = '5511999999999@s.whatsapp.net';
const servers: import('node:http').Server[] = [];
const filas: FilaEnvio[] = [];
let dataDir: string;

function gatewayFalso(demoraMs = 0) {
  const estado = { abortado: false, chamadas: 0, textos: [] as string[] };
  const gw = {
    async entregarHumano(_jid: string, plano: Passo[], signal?: AbortSignal) {
      estado.chamadas += 1;
      const textos = plano.flatMap((p) => (p.tipo === 'enviar' ? [p.texto] : []));
      estado.textos = textos;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, demoraMs);
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
      return {
        enviados: estado.abortado ? 0 : textos.length,
        total: textos.length,
        cancelado: estado.abortado,
      };
    },
    async marcarLido() {},
    async sendPresence() {},
    async sendText() {},
  } as unknown as WhatsAppGateway;
  return { gw, estado };
}

async function subir(gw: WhatsAppGateway): Promise<string> {
  const fila = await FilaEnvio.carregar({ dataDir, gateway: gw, conectado: () => true });
  filas.push(fila);
  const server = startControlServer(gw, 0, [], undefined, undefined, fila);
  servers.push(server);
  await new Promise<void>((r) => server.once('listening', () => r()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

const post = (base: string, rota: string, body: unknown) =>
  fetch(`${base}${rota}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const espera = async (cond: () => boolean, ms = 12_000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'wac-control-'));
});
afterEach(async () => {
  for (const f of filas.splice(0)) await f.parar();
  for (const s of servers.splice(0)) await new Promise<void>((r) => s.close(() => r()));
  await rm(dataDir, { recursive: true, force: true });
});

describe('control /send humano — ticket', () => {
  it('responde 202 com ticket na hora e entrega depois (urgencia agora = 5 s)', async () => {
    const { gw, estado } = gatewayFalso();
    const base = await subir(gw);
    const res = await post(base, '/send', {
      jid: JID,
      humano: true,
      baloes: ['um', 'dois'],
      urgencia: 'agora',
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      ok: boolean;
      ticket: string;
      previsao_s: number;
      estado: string;
    };
    expect(body).toMatchObject({ ok: true, estado: 'agendado', previsao_s: 5 });
    expect((body as { duracao_s?: number }).duracao_s).toBeGreaterThan(0);
    expect(estado.chamadas).toBe(0);
    const st = await (await fetch(`${base}/entregas/${body.ticket}`)).json();
    expect(st).toMatchObject({
      ok: true,
      entrega: { ticket: body.ticket, estado: 'agendado', total: 2 },
    });
    await espera(() => estado.chamadas === 1);
    expect(estado.textos).toEqual(['um', 'dois']);
  });

  it('segundo envio pro mesmo chat substitui o primeiro', async () => {
    const { gw } = gatewayFalso();
    const base = await subir(gw);
    const a = (await (await post(base, '/send', { jid: JID, humano: true, text: 'a' })).json()) as {
      ticket: string;
    };
    const b = (await (await post(base, '/send', { jid: JID, humano: true, text: 'b' })).json()) as {
      substituiu?: string;
      substituiu_enviados?: number;
      substituiu_baloes_enviados?: string[];
    };
    expect(b.substituiu).toBe(a.ticket);
    expect(b.substituiu_enviados).toBe(0);
    expect(b.substituiu_baloes_enviados).toEqual([]);
    const lista = (await (await fetch(`${base}/entregas`)).json()) as { entregas: unknown[] };
    expect(lista.entregas).toHaveLength(1);
  });

  it('aguardar: true segura até entregar e responde no formato v1', async () => {
    const { gw } = gatewayFalso();
    const base = await subir(gw);
    const res = await post(base, '/send', {
      jid: JID,
      humano: true,
      baloes: ['x'],
      urgencia: 'agora',
      aguardar: true,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, baloes: 1, enviados: 1, cancelado: false });
  }, 15_000);

  it('aguardar + cliente desconecta cancela o ticket', async () => {
    const { gw } = gatewayFalso();
    const base = await subir(gw);
    const ac = new AbortController();
    const req = fetch(`${base}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jid: JID, humano: true, text: 'x', aguardar: true }),
      signal: ac.signal,
    }).catch(() => null);
    await new Promise((r) => setTimeout(r, 100));
    ac.abort();
    await req;
    await espera(() => filas[0]?.listar().length === 0);
    const st = (await (await fetch(`${base}/entregas?jid=${encodeURIComponent(JID)}`)).json()) as {
      entrega: { estado: string };
    };
    expect(st.entrega.estado).toBe('cancelado');
  });

  it('/cancelar-envio por jid ou por ticket; sem nada vivo → cancelado:false', async () => {
    const { gw, estado } = gatewayFalso(3000);
    const base = await subir(gw);
    const a = (await (
      await post(base, '/send', { jid: JID, humano: true, text: 'a', urgencia: 'agora' })
    ).json()) as {
      ticket: string;
    };
    expect(await (await post(base, '/cancelar-envio', { ticket: a.ticket })).json()).toMatchObject({
      ok: true,
      cancelado: true,
      ticket: a.ticket,
    });
    await post(base, '/send', { jid: JID, humano: true, text: 'b', urgencia: 'agora' });
    await espera(() => estado.chamadas === 1, 9000);
    expect(await (await post(base, '/cancelar-envio', { jid: JID })).json()).toMatchObject({
      ok: true,
      cancelado: true,
    });
    await espera(() => estado.abortado);
    expect(await (await post(base, '/cancelar-envio', { jid: JID })).json()).toEqual({
      ok: true,
      cancelado: false,
    });
  }, 20_000);

  it('sem fila configurada, humano responde 503; /send sem humano segue síncrono', async () => {
    const { gw } = gatewayFalso();
    const server = startControlServer(gw, 0, []);
    servers.push(server);
    await new Promise<void>((r) => server.once('listening', () => r()));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await post(base, '/send', { jid: JID, humano: true, text: 'x' })).status).toBe(503);
    expect((await post(base, '/send', { jid: JID, text: 'x' })).status).toBe(200);
  });
});
