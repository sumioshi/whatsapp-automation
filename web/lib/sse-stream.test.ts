import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseFiltro } from './sse-filtro';
import { abrirStreamEventos, type StreamHandle, type StreamOpts } from './sse-stream';

let dir: string;
const handles: StreamHandle[] = [];

const linha = (o: object) => `${JSON.stringify(o)}\n`;
const evento = (over: object) => ({
  id: 'X',
  fromMe: false,
  sender: '5511999999999@s.whatsapp.net',
  senderName: 'Carlos',
  type: 'text',
  text: 'oi',
  ...over,
});

function abrir(over: Partial<StreamOpts> = {}) {
  const frames: string[] = [];
  const h = abrirStreamEventos(
    {
      dataDir: dir,
      slugs: ['a'],
      cursor: new Map(),
      filtro: parseFiltro(new URLSearchParams()),
      papelDe: () => 'client',
      pollMs: 30,
      heartbeatMs: 60_000,
      ...over,
    },
    (f) => frames.push(f),
  );
  handles.push(h);
  return { frames, h };
}

const dados = (frames: string[]) =>
  frames
    .filter((f) => f.startsWith('id:'))
    .map((f) => {
      const [idLine, dataLine] = f.split('\n');
      return {
        id: (idLine ?? '').slice(4),
        data: JSON.parse((dataLine ?? '').slice(6)) as Record<string, unknown>,
      };
    });

async function espera(cond: () => boolean, ms = 2000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout esperando evento');
    await new Promise((r) => setTimeout(r, 10));
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sse-stream-'));
  await mkdir(join(dir, 'a'));
  await mkdir(join(dir, 'b'));
  await writeFile(join(dir, 'a', 'messages.jsonl'), linha(evento({ id: 'antiga' })));
  await writeFile(join(dir, 'b', 'messages.jsonl'), '');
});

afterEach(async () => {
  for (const h of handles.splice(0)) h.close();
  await rm(dir, { recursive: true, force: true });
});

describe('abrirStreamEventos', () => {
  it('sem cursor começa do fim: só o que chega depois, com slug injetado e id = cursor', async () => {
    const { frames, h } = abrir();
    await h.drainAll();
    await appendFile(join(dir, 'a', 'messages.jsonl'), linha(evento({ id: 'nova' })));
    await espera(() => dados(frames).length === 1);
    const [e] = dados(frames);
    expect(e?.data.id).toBe('nova');
    expect(e?.data.slug).toBe('a');
    expect(e?.id).toMatch(/^a=\d+$/);
  });

  it('com cursor retoma do buraco (replay só do que faltou)', async () => {
    const primeira = Buffer.byteLength(linha(evento({ id: 'antiga' })));
    await appendFile(join(dir, 'a', 'messages.jsonl'), linha(evento({ id: 'perdida' })));
    const { frames, h } = abrir({ cursor: new Map([['a', primeira]]) });
    await h.drainAll();
    expect(dados(frames).map((e) => e.data.id)).toEqual(['perdida']);
  });

  it('cursor além do arquivo (rewrite) começa do fim sem replay', async () => {
    const { frames, h } = abrir({ cursor: new Map([['a', 999_999]]) });
    await h.drainAll();
    expect(dados(frames)).toEqual([]);
  });

  it('replay limitado às últimas N linhas avisa quantas ignorou', async () => {
    for (let i = 0; i < 5; i++) {
      await appendFile(join(dir, 'a', 'messages.jsonl'), linha(evento({ id: `m${i}` })));
    }
    const { frames, h } = abrir({ cursor: new Map([['a', 0]]), maxReplay: 2 });
    await h.drainAll();
    expect(dados(frames).map((e) => e.data.id)).toEqual(['m3', 'm4']);
    expect(frames.some((f) => f.startsWith(': replay truncado slug=a ignoradas=4'))).toBe(true);
  });

  it('várias conversas numa conexão; o id carrega o offset de cada uma', async () => {
    const { frames, h } = abrir({ slugs: ['a', 'b'] });
    await h.drainAll();
    await appendFile(join(dir, 'b', 'messages.jsonl'), linha(evento({ id: 'de-b' })));
    await espera(() => dados(frames).length === 1);
    expect(dados(frames)[0]?.data.slug).toBe('b');
    expect(dados(frames)[0]?.id).toMatch(/^a=\d+;b=\d+$/);
  });

  it('filtro ocultar=coletor segura o eco do próprio envio e deixa a resposta manual', async () => {
    const { frames, h } = abrir({ filtro: parseFiltro(new URLSearchParams('ocultar=coletor')) });
    await h.drainAll();
    await appendFile(
      join(dir, 'a', 'messages.jsonl'),
      linha(evento({ id: 'mcp', fromMe: true, origem: 'coletor' })) +
        linha(evento({ id: 'manual', fromMe: true, origem: 'celular' })),
    );
    await espera(() => dados(frames).length === 1);
    expect(dados(frames)[0]?.data.id).toBe('manual');
  });

  it('linha que não é JSON é descartada sem derrubar o stream', async () => {
    const { frames, h } = abrir();
    await h.drainAll();
    await appendFile(join(dir, 'a', 'messages.jsonl'), `lixo\n${linha(evento({ id: 'ok' }))}`);
    await espera(() => dados(frames).length === 1);
    expect(dados(frames)[0]?.data.id).toBe('ok');
  });

  it('avisa a conexão e manda ping no heartbeat', async () => {
    const { frames, h } = abrir({ heartbeatMs: 20 });
    await h.drainAll();
    expect(frames[0]).toBe(': conectado slugs=a\n\n');
    await espera(() => frames.includes(': ping\n\n'));
  });
});
