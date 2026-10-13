import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PERFIL_DEFAULT } from './baloes';
import {
  calcularPerfil,
  elegivelParaPerfil,
  lerHistorico,
  loadPerfilEnvio,
  type MsgHistorico,
  ultimaDoCliente,
} from './perfil';

const t0 = Date.parse('2026-03-01T12:00:00Z');
const iso = (s: number) => new Date(t0 + s * 1000).toISOString();
const minha = (s: number, text: string, origem?: string): MsgHistorico => ({
  fromMe: true,
  type: 'text',
  text,
  timestamp: iso(s),
  ...(origem ? { origem } : {}),
});
const dele = (s: number, text = 'oi'): MsgHistorico => ({
  fromMe: false,
  type: 'text',
  text,
  timestamp: iso(s),
  sender: '5511000000001@s.whatsapp.net',
});

/** Conversa sintética: cliente pergunta, operador responde 40 s depois em 2 balões de 30 chars com 10 s entre eles. */
function conversa(n: number): MsgHistorico[] {
  const out: MsgHistorico[] = [];
  for (let i = 0; i < n; i++) {
    const base = i * 600;
    out.push(dele(base, 'pergunta do cliente aqui'));
    out.push(minha(base + 40, 'a'.repeat(30)));
    out.push(minha(base + 50, 'b'.repeat(30)));
  }
  return out;
}

describe('elegivelParaPerfil', () => {
  it('fromMe texto: origem celular/web sim; coletor/ia_meta não; sem origem só antes da automação', () => {
    expect(elegivelParaPerfil(minha(0, 'x', 'celular'))).toBe(true);
    expect(elegivelParaPerfil(minha(0, 'x', 'web'))).toBe(true);
    expect(elegivelParaPerfil(minha(0, 'x', 'coletor'))).toBe(false);
    expect(elegivelParaPerfil(minha(0, 'x'))).toBe(true);
    expect(elegivelParaPerfil({ ...minha(0, 'x'), timestamp: '2026-08-01T00:00:00Z' })).toBe(false);
    expect(elegivelParaPerfil(dele(0))).toBe(false);
    expect(elegivelParaPerfil({ ...minha(0, 'x'), type: 'image' })).toBe(false);
  });
});

describe('calcularPerfil', () => {
  it('menos de 30 msgs elegíveis → null', () => {
    expect(calcularPerfil(conversa(10))).toBeNull();
  });

  it('mede chars/s, pausa entre balões e latências medianas', () => {
    const p = calcularPerfil(conversa(30))!;
    expect(p.tamanhoMedioBalao).toBe(40);
    expect(p.charsPorSegundo).toBeCloseTo(3.0, 1);
    expect(p.pausaEntreBaloes_s).toBe(10);
    expect(p.latenciaMediana_s).toBe(40);
    expect(p.latenciaClienteMediana_s).toBe(550);
  });

  it('chars/s fica no clamp [1,8; 5,5] e ignora pares com gap > 90 s', () => {
    const msgs: MsgHistorico[] = [];
    for (let i = 0; i < 40; i++) {
      msgs.push(minha(i * 200, 'x'.repeat(100)));
      msgs.push(minha(i * 200 + 2, 'y'.repeat(100)));
      msgs.push(minha(i * 200 + 150, 'z'.repeat(5)));
    }
    expect(calcularPerfil(msgs)!.charsPorSegundo).toBe(5.5);
  });

  it('sem pares suficientes (< 5) as medidas ficam null', () => {
    const msgs = Array.from({ length: 30 }, (_, i) =>
      minha(i * 1000, `mensagem isolada numero ${i}`),
    );
    const p = calcularPerfil(msgs)!;
    expect(p.charsPorSegundo).toBeNull();
    expect(p.pausaEntreBaloes_s).toBeNull();
    expect(p.latenciaMediana_s).toBeNull();
  });
});

describe('ultimaDoCliente', () => {
  it('última msg não-fromMe fora da equipe, com chars e id', () => {
    const msgs = [
      dele(0, 'primeira'),
      minha(10, 'resp'),
      { ...dele(20, 'da equipe'), sender: '5511000000009@s.whatsapp.net', id: 'e' },
      { ...dele(30, 'ultima do cliente'), id: 'c' },
    ];
    const u = ultimaDoCliente(msgs, new Set(['5511000000009']));
    expect(u).toEqual({ ts: t0 + 30_000, chars: 17, id: 'c' });
    expect(ultimaDoCliente([minha(0, 'x')])).toBeNull();
  });
});

describe('loadPerfilEnvio — cache', () => {
  let dataDir: string;
  const slug = 'chat-novo';
  const cachePath = () => join(dataDir, slug, '.perfil-envio.json');
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'wac-humano-perfil-'));
    await mkdir(join(dataDir, slug), { recursive: true });
  });
  afterEach(async () => rm(dataDir, { recursive: true, force: true }));

  it('chat pequeno: PERFIL_DEFAULT e sem cache', async () => {
    await writeFile(
      join(dataDir, slug, 'messages.jsonl'),
      conversa(5)
        .map((m) => JSON.stringify(m))
        .join('\n'),
    );
    expect(await loadPerfilEnvio(slug, dataDir)).toEqual(PERFIL_DEFAULT);
    await expect(access(cachePath())).rejects.toThrow();
  });

  it('chat grande: calcula, grava cache v2; cache v1 (sem versao) é ignorado', async () => {
    await writeFile(
      join(dataDir, slug, 'messages.jsonl'),
      conversa(30)
        .map((m) => JSON.stringify(m))
        .join('\n'),
    );
    await writeFile(
      cachePath(),
      JSON.stringify({
        calculadoEm: Date.now(),
        perfil: { tamanhoMedioBalao: 999, baloesPorRajada: 2, fracaoRespostaCurta: 0 },
      }),
    );
    const p = await loadPerfilEnvio(slug, dataDir);
    expect(p.tamanhoMedioBalao).toBe(40);
    expect(p.charsPorSegundo).toBeCloseTo(3.0, 1);
    const cache = JSON.parse(await readFile(cachePath(), 'utf8')) as { versao?: number };
    expect(cache.versao).toBe(2);
  });

  it('lerHistorico devolve [] sem arquivo e pula linhas quebradas', async () => {
    expect(await lerHistorico(dataDir, 'nao-existe')).toEqual([]);
    await writeFile(
      join(dataDir, slug, 'messages.jsonl'),
      `${JSON.stringify(dele(0))}\n{quebrada\n`,
    );
    expect(await lerHistorico(dataDir, slug)).toHaveLength(1);
  });

  it('lerHistorico: recebida em DM com sender vazio é do outro lado da conversa', async () => {
    const dm = '5511000000009@s.whatsapp.net';
    await writeFile(
      join(dataDir, slug, 'messages.jsonl'),
      `${JSON.stringify({ ...dele(0), sender: '', groupJid: dm })}\n`,
    );
    const msgs = await lerHistorico(dataDir, slug);
    expect(msgs[0]?.sender).toBe(dm);
    expect(ultimaDoCliente(msgs, new Set(['5511000000009']))).toBeNull();
  });
});
