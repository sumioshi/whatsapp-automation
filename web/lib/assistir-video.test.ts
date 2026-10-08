import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assistirVideo,
  ehYoutube,
  erroOpenRouter,
  lerResposta,
  modeloDoVideo,
  montarPedido,
  montarPrompt,
} from './assistir-video';

describe('ehYoutube', () => {
  it('reconhece watch, shorts, youtu.be e live', () => {
    expect(ehYoutube('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toBe(true);
    expect(ehYoutube('https://youtube.com/shorts/abc123')).toBe(true);
    expect(ehYoutube('https://youtu.be/jNQXAC9IVRw?t=3')).toBe(true);
    expect(ehYoutube('https://m.youtube.com/live/xyz')).toBe(true);
  });
  it('não confunde Instagram, TikTok nem texto qualquer', () => {
    expect(ehYoutube('https://www.instagram.com/reel/C1abc/')).toBe(false);
    expect(ehYoutube('https://www.tiktok.com/@x/video/1')).toBe(false);
    expect(ehYoutube('youtube.com')).toBe(false);
    expect(ehYoutube('')).toBe(false);
  });
});

describe('modeloDoVideo', () => {
  it('usa o padrão e põe o prefixo google/ quando falta', () => {
    expect(modeloDoVideo()).toBe('google/gemini-3.8-flash');
    expect(modeloDoVideo('gemini-3.7-flash')).toBe('google/gemini-3.7-flash');
    expect(modeloDoVideo('google/gemini-3.6-flash')).toBe('google/gemini-3.6-flash');
  });
});

describe('montarPrompt e montarPedido', () => {
  it('sem pergunta, pede um resumo completo; sempre pede tempos e separação visto/ouvido', () => {
    const p = montarPrompt();
    expect(p).toMatch(/português/i);
    expect(p).toMatch(/MM:SS/);
    expect(montarPrompt('o cliente mostrou qual erro?')).toMatch(/^o cliente mostrou qual erro\?/);
  });
  it('monta o pedido com o texto e o vídeo', () => {
    const pedido = montarPedido('https://youtu.be/x', 'o que aparece?', 'google/gemini-3.8-flash');
    expect(pedido.model).toBe('google/gemini-3.8-flash');
    const conteudo = pedido.messages[0].content;
    expect(conteudo[0]).toMatchObject({ type: 'text' });
    expect(conteudo[1]).toEqual({ type: 'video_url', video_url: { url: 'https://youtu.be/x' } });
  });
});

describe('lerResposta', () => {
  it('extrai texto, tokens e custo', () => {
    const r = lerResposta({ choices: [{ message: { content: '  00:01 ele fala oi  ' } }], usage: { total_tokens: 900, cost: 0.003 } });
    expect(r).toEqual({ texto: '00:01 ele fala oi', tokens: 900, custoUsd: 0.003 });
  });
  it('recusa resposta sem texto', () => {
    expect(() => lerResposta({ choices: [{ message: { content: '' } }] })).toThrow(/sem texto/);
    expect(() => lerResposta({})).toThrow(/sem texto/);
  });
});

describe('erroOpenRouter', () => {
  it('traduz falta de saldo, chave inválida, limite e falha do serviço', () => {
    expect(erroOpenRouter(402, 'Insufficient credits')).toMatch(/saldo/i);
    expect(erroOpenRouter(401, 'No auth')).toMatch(/OPENROUTER_API_KEY/);
    expect(erroOpenRouter(429, 'rate')).toMatch(/limite/i);
    expect(erroOpenRouter(503, 'overloaded')).toMatch(/tente de novo/i);
    expect(erroOpenRouter(400, 'video too long')).toMatch(/video too long/);
  });
});

describe('assistirVideo', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'assistir-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const respostaOk = (texto = 'ok') =>
    new Response(JSON.stringify({ choices: [{ message: { content: texto } }], usage: { total_tokens: 10, cost: 0.001 } }), {
      status: 200,
    });

  it('link do YouTube vai direto, sem baixar', async () => {
    const fetchFn = vi.fn().mockResolvedValue(respostaOk('00:01 elefantes'));
    const baixar = vi.fn();
    const r = await assistirVideo({ url: 'https://youtu.be/jNQXAC9IVRw', chave: 'k', fetchFn, baixar });
    expect(baixar).not.toHaveBeenCalled();
    const corpo = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(corpo.messages[0].content[1].video_url.url).toBe('https://youtu.be/jNQXAC9IVRw');
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe('Bearer k');
    expect(r).toMatchObject({ texto: '00:01 elefantes', fonte: 'youtube', modelo: 'google/gemini-3.8-flash' });
  });

  it('arquivo vai em base64 no corpo', async () => {
    const arquivo = join(dir, 'v.mp4');
    await writeFile(arquivo, Buffer.from('VIDEO'));
    const fetchFn = vi.fn().mockResolvedValue(respostaOk());
    const r = await assistirVideo({ arquivo, chave: 'k', fetchFn, medirDuracao: async () => 12 });
    const url = JSON.parse(fetchFn.mock.calls[0][1].body).messages[0].content[1].video_url.url;
    expect(url).toBe(`data:video/mp4;base64,${Buffer.from('VIDEO').toString('base64')}`);
    expect(r.fonte).toBe('arquivo');
  });

  it('link que não é YouTube é baixado antes', async () => {
    const baixado = join(dir, 'reel.mp4');
    await writeFile(baixado, Buffer.from('REEL'));
    const fetchFn = vi.fn().mockResolvedValue(respostaOk());
    const baixar = vi.fn().mockResolvedValue(baixado);
    const r = await assistirVideo({
      url: 'https://www.instagram.com/reel/C1abc/',
      chave: 'k',
      fetchFn,
      baixar,
      medirDuracao: async () => 30,
    });
    expect(baixar).toHaveBeenCalledWith('https://www.instagram.com/reel/C1abc/', expect.any(String));
    expect(r.fonte).toBe('link');
  });

  it('recusa vídeo acima da duração máxima, sem chamar a API', async () => {
    const arquivo = join(dir, 'longo.mp4');
    await writeFile(arquivo, Buffer.from('X'));
    const fetchFn = vi.fn();
    await expect(
      assistirVideo({ arquivo, chave: 'k', fetchFn, medirDuracao: async () => 3600, duracaoMaxS: 1200 }),
    ).rejects.toThrow(/60 min.*20 min/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sem chave, falha com instrução clara', async () => {
    await expect(assistirVideo({ url: 'https://youtu.be/x', chave: '' })).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it('erro HTTP vira mensagem traduzida', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{"error":{"message":"Insufficient credits"}}', { status: 402 }));
    await expect(assistirVideo({ url: 'https://youtu.be/x', chave: 'k', fetchFn })).rejects.toThrow(/saldo/i);
  });

  it('exige url ou arquivo', async () => {
    await expect(assistirVideo({ chave: 'k' })).rejects.toThrow(/url ou arquivo/);
  });
});
