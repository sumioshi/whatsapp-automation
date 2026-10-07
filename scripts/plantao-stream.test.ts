import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(__dirname, 'plantao-stream.sh');

type Pedido = { url: string; lastEventId: string | undefined };
type Responder = (req: IncomingMessage, res: ServerResponse, n: number) => void;

let server: Server;
let porta: number;
let stateDir: string;
let pedidos: Pedido[];
let responder: Responder;
const procs: ChildProcess[] = [];

function frame(id: string, obj: object): string {
  return `id: ${id}\ndata: ${JSON.stringify(obj)}\n\n`;
}

function rodar(args: string[]) {
  const p = spawn('sh', [SCRIPT, ...args], {
    env: {
      PATH: process.env.PATH ?? '',
      WAC_CLOUD_URL: `http://127.0.0.1:${porta}`,
      WAC_CLOUD_USER: 'u',
      WAC_CLOUD_PASS: 'p',
      PLANTAO_STATE_DIR: stateDir,
      PLANTAO_RETRY_S: '0',
    },
    detached: true,
  });
  procs.push(p);
  const out: string[] = [];
  const err: string[] = [];
  let resto = '';
  p.stdout.on('data', (b: Buffer) => {
    resto += b.toString();
    const partes = resto.split('\n');
    resto = partes.pop() ?? '';
    out.push(...partes);
  });
  p.stderr.on('data', (b: Buffer) => err.push(b.toString()));
  const saida = new Promise<number | null>((res) => p.on('exit', (code) => res(code)));
  return { p, out, err, saida };
}

async function espera(cond: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 25));
  }
}

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), 'plantao-'));
  pedidos = [];
  server = createServer((req, res) => {
    pedidos.push({ url: req.url ?? '', lastEventId: req.headers['last-event-id'] as string | undefined });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    responder(req, res, pedidos.length);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  porta = (server.address() as { port: number }).port;
});

afterEach(async () => {
  for (const p of procs.splice(0)) {
    try {
      process.kill(-(p.pid as number), 'SIGKILL');
    } catch {
      /* já morreu */
    }
  }
  await new Promise<void>((r) => server.close(() => r()));
  await rm(stateDir, { recursive: true, force: true });
});

describe('plantao-stream.sh', { timeout: 15_000 }, () => {
  it('imprime cliente e resposta manual, cala o eco do coletor, nomeia a IA da Meta', async () => {
    responder = (_req, res) => {
      res.write(frame('a=10', { slug: 'a', fromMe: false, senderName: 'Carlos', text: 'oi' }));
      res.write(frame('a=20', { slug: 'a', fromMe: true, origem: 'coletor', text: 'eco do mcp' }));
      res.write(frame('a=30', { slug: 'a', fromMe: true, origem: 'celular', text: 'respondi do celular' }));
      res.write(frame('a=35', { slug: 'a', fromMe: true, origem: 'coletor', ator: 'painel', usuario: 'ana', text: 'respondi pelo painel' }));
      res.write(frame('a=40', { slug: 'a', fromMe: true, origem: 'ia_meta', text: 'auto' }));
      res.write(frame('a=50', { slug: 'a', fromMe: true, text: 'coletor antigo sem origem' }));
      res.write(frame('a=60', { slug: 'a', fromMe: false, senderName: 'Carlos', type: 'image', text: '' }));
    };
    const { out } = rodar(['a']);
    await espera(() => out.length >= 5);
    expect(out).toEqual([
      'Carlos: oi',
      'Você (celular): respondi do celular',
      'Painel (ana): respondi pelo painel',
      'IA da Meta (sua conta): auto',
      'Carlos: [image]',
    ]);
    expect(pedidos[0]?.url).toBe('/api/events?slug=a&ocultar=coletor');
  });

  it('event: entrega — interrompida acorda com motivo e contagem; entregue fica em silêncio', async () => {
    responder = (_req, res) => {
      res.write(
        `event: entrega\ndata: ${JSON.stringify({ slug: 'a', ticket: 'x', estado: 'entregue', enviados: 2, total: 2 })}\n\n`,
      );
      res.write(
        `event: entrega\ndata: ${JSON.stringify({ slug: 'a', ticket: 'y', estado: 'interrompido', motivo: 'mensagem_nova', enviados: 1, total: 3 })}\n\n`,
      );
      res.write(frame('a=10', { slug: 'a', fromMe: false, senderName: 'Carlos', text: 'depois' }));
    };
    const { out } = rodar(['a']);
    await espera(() => out.length >= 2);
    expect(out).toEqual([
      'Entrega interrompida (mensagem nova, 1/3 saiu) — releia o chat e responda de novo',
      'Carlos: depois',
    ]);
  });

  it('reconecta mandando o último id em Last-Event-ID', async () => {
    responder = (_req, res, n) => {
      if (n === 1) {
        res.write(frame('a=77', { slug: 'a', fromMe: false, senderName: 'X', text: '1' }));
        setTimeout(() => res.end(), 50);
      }
    };
    rodar(['a']);
    await espera(() => pedidos.length >= 2);
    expect(pedidos[0]?.lastEventId).toBeUndefined();
    expect(pedidos[1]?.lastEventId).toBe('a=77');
  });

  it('várias conversas: uma conexão, prefixo [slug] na linha', async () => {
    responder = (_req, res) => {
      res.write(frame('a=1;b=2', { slug: 'b', fromMe: false, senderName: 'Ana', text: 'oi' }));
    };
    const { out } = rodar(['a', 'b']);
    await espera(() => out.length >= 1);
    expect(out[0]).toBe('[b] Ana: oi');
    expect(pedidos[0]?.url).toBe('/api/events?slug=a,b&ocultar=coletor');
  });

  it('--alertar pede as conversas com alerta ligado', async () => {
    responder = () => {
      /* mantém aberta */
    };
    rodar(['--alertar']);
    await espera(() => pedidos.length >= 1);
    expect(pedidos[0]?.url).toBe('/api/events?alertar=1&ocultar=coletor');
  });

  it('segunda instância do mesmo conjunto sai com código 3', async () => {
    responder = () => {
      /* mantém aberta */
    };
    rodar(['a']);
    await espera(() => pedidos.length >= 1);
    const segunda = rodar(['a']);
    expect(await segunda.saida).toBe(3);
    expect(segunda.err.join('')).toContain('já ativo');
  });
});

describe('plantao-stream.sh — outro coletor (PLANTAO_CLOUD)', () => {
  it('PLANTAO_CLOUD=pessoal usa o trio WAC_PESSOAL_* e o lock ganha o prefixo do coletor', async () => {
    responder = (_req, res) => {
      res.write(frame('a=1', { slug: 'a', fromMe: false, senderName: 'Ana', text: 'oi' }));
    };
    const p = spawn('sh', [SCRIPT, 'a'], {
      env: {
        PATH: process.env.PATH ?? '',
        // trio principal aponta pro nada: se o script usar ele, o teste falha
        WAC_CLOUD_URL: 'http://127.0.0.1:9',
        WAC_CLOUD_USER: 'x',
        WAC_CLOUD_PASS: 'x',
        WAC_PESSOAL_URL: `http://127.0.0.1:${porta}`,
        WAC_PESSOAL_USER: 'u',
        WAC_PESSOAL_PASS: 'p',
        PLANTAO_CLOUD: 'pessoal',
        PLANTAO_STATE_DIR: stateDir,
        PLANTAO_RETRY_S: '0',
      },
      detached: true,
    });
    procs.push(p);
    const out: string[] = [];
    p.stdout.on('data', (b: Buffer) => out.push(...b.toString().split('\n').filter(Boolean)));
    await espera(() => out.length >= 1);
    expect(out[0]).toBe('Ana: oi');
    expect(pedidos[0]?.url).toBe('/api/events?slug=a&ocultar=coletor');
    const { readdir } = await import('node:fs/promises');
    expect((await readdir(stateDir)).some((f) => f.startsWith('plantao-pessoal-'))).toBe(true);
  });
});
