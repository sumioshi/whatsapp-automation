/**
 * Assistir vídeo com o Gemini pela OpenRouter: imagem e áudio juntos, numa chamada,
 * com resposta em texto e tempos. Link do YouTube vai direto; o resto (anexo do
 * WhatsApp, Instagram, TikTok) vai em base64 no corpo, comprimido se precisar.
 * Sem import com alias: este módulo é usado pelo MCP, que roda sob tsx.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';

const pexec = promisify(execFile);

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MODELO_PADRAO = 'gemini-3.8-flash';
/** Corpo da requisição precisa caber; acima disso o vídeo é comprimido. */
export const LIMITE_BYTES = 18_000_000;
/** Vídeo mais longo que isso é recusado antes de gastar crédito. */
export const DURACAO_MAX_S = 20 * 60;

const YOUTUBE = /^https?:\/\/(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?\S*\bv=|shorts\/|live\/)|youtu\.be\/)\S+$/i;

export function ehYoutube(url: string): boolean {
  return YOUTUBE.test(url ?? '');
}

export function modeloDoVideo(modelo?: string): string {
  const m = (modelo || process.env.WAC_VIDEO_MODEL || MODELO_PADRAO).trim();
  return m.includes('/') ? m : `google/${m}`;
}

const PERGUNTA_PADRAO =
  'Descreva este vídeo em português: o que aparece (telas, textos, cliques, erros) e o que é falado, em ordem.';
const SUFIXO =
  '\n\nResponda em português. Cite um tempo MM:SS em cada afirmação sobre um momento específico. ' +
  'Separe o que é visto do que é ouvido quando fizer diferença. Se o vídeo não mostrar ou não disser ' +
  'algo necessário pra responder, diga isso em vez de supor.';

export function montarPrompt(pergunta?: string): string {
  return (pergunta?.trim() || PERGUNTA_PADRAO) + SUFIXO;
}

export function montarPedido(videoUrl: string, pergunta: string | undefined, modelo: string) {
  return {
    model: modelo,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: montarPrompt(pergunta) },
          { type: 'video_url', video_url: { url: videoUrl } },
        ],
      },
    ],
  };
}

export function lerResposta(json: unknown): { texto: string; tokens: number | null; custoUsd: number | null } {
  const d = json as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { total_tokens?: number; cost?: number };
  };
  const texto = (d?.choices?.[0]?.message?.content ?? '').trim();
  if (!texto) throw new Error('o Gemini respondeu sem texto');
  return {
    texto,
    tokens: typeof d.usage?.total_tokens === 'number' ? d.usage.total_tokens : null,
    custoUsd: typeof d.usage?.cost === 'number' ? d.usage.cost : null,
  };
}

export function erroOpenRouter(status: number, corpo: string): string {
  let detalhe = corpo;
  try {
    detalhe = (JSON.parse(corpo) as { error?: { message?: string } }).error?.message ?? corpo;
  } catch {
    // corpo não é JSON: usa como veio
  }
  detalhe = detalhe.slice(0, 300);
  if (status === 402) return `sem saldo na OpenRouter (HTTP 402): coloque crédito em openrouter.ai/settings/credits. ${detalhe}`;
  if (status === 401 || status === 403) return `OPENROUTER_API_KEY recusada (HTTP ${status}): confira a chave. ${detalhe}`;
  if (status === 429) return `limite de uso da OpenRouter (HTTP 429): espere um pouco. ${detalhe}`;
  if (status >= 500) return `OpenRouter ou Gemini instável (HTTP ${status}): tente de novo em instantes. ${detalhe}`;
  return `OpenRouter recusou o vídeo (HTTP ${status}): ${detalhe}`;
}

async function duracaoPorFfprobe(arquivo: string): Promise<number | null> {
  try {
    const { stdout } = await pexec('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', arquivo,
    ]);
    const s = Number.parseFloat(stdout.trim());
    return Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}

async function baixarComYtDlp(url: string, dir: string): Promise<string> {
  try {
    await pexec('yt-dlp', ['-q', '--no-playlist', '-f', 'best[height<=720]/best', '-o', join(dir, 'video.%(ext)s'), url], {
      timeout: 300_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/ENOENT/.test(msg)) throw new Error('yt-dlp não está instalado nesta máquina (brew install yt-dlp)');
    throw new Error(`não consegui baixar o vídeo do link (pode exigir login, como no Instagram): ${msg.slice(0, 300)}`);
  }
  const arq = (await readdir(dir)).find((f) => f.startsWith('video.'));
  if (!arq) throw new Error('o download do link não gerou arquivo');
  return join(dir, arq);
}

/** Reduz o vídeo até caber no corpo: 360p e, se ainda passar, 240p a 10 fps. */
async function comprimirSePreciso(arquivo: string, dir: string, limite: number): Promise<string> {
  if ((await stat(arquivo)).size <= limite) return arquivo;
  for (const [i, vf] of ['scale=-2:360', 'scale=-2:240,fps=10'].entries()) {
    const saida = join(dir, `menor_${i}.mp4`);
    await pexec('ffmpeg', [
      '-v', 'error', '-y', '-i', arquivo, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32',
      '-c:a', 'aac', '-b:a', '48k', '-ac', '1', saida,
    ]);
    if ((await stat(saida)).size <= limite) return saida;
  }
  throw new Error(`o vídeo continua acima de ${Math.round(limite / 1e6)} MB mesmo comprimido`);
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/mov', '.webm': 'video/webm', '.mpeg': 'video/mpeg', '.mpg': 'video/mpeg',
};

export interface AssistirOpcoes {
  url?: string;
  arquivo?: string;
  pergunta?: string;
  modelo?: string;
  chave?: string;
  duracaoMaxS?: number;
  limiteBytes?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  baixar?: (url: string, dir: string) => Promise<string>;
  medirDuracao?: (arquivo: string) => Promise<number | null>;
}

export interface AssistirResultado {
  texto: string;
  modelo: string;
  fonte: 'youtube' | 'link' | 'arquivo';
  tokens: number | null;
  custoUsd: number | null;
}

export async function assistirVideo(o: AssistirOpcoes): Promise<AssistirResultado> {
  const chave = (o.chave ?? process.env.OPENROUTER_API_KEY ?? '').trim();
  if (!chave) throw new Error('OPENROUTER_API_KEY ausente: adicione no arquivo de variáveis da raiz do repositório');
  if (!o.url && !o.arquivo) throw new Error('informe url ou arquivo do vídeo');
  const modelo = modeloDoVideo(o.modelo);
  const fetchFn = o.fetchFn ?? fetch;
  const medir = o.medirDuracao ?? duracaoPorFfprobe;
  const maxS = o.duracaoMaxS ?? DURACAO_MAX_S;

  let videoUrl: string;
  let fonte: AssistirResultado['fonte'];
  let dir: string | null = null;
  try {
    if (o.url && ehYoutube(o.url)) {
      videoUrl = o.url;
      fonte = 'youtube';
    } else {
      dir = await mkdtemp(join(tmpdir(), 'wac-assistir-'));
      let arquivo = o.arquivo;
      fonte = 'arquivo';
      if (!arquivo && o.url) {
        arquivo = await (o.baixar ?? baixarComYtDlp)(o.url, dir);
        fonte = 'link';
      }
      const caminho = arquivo as string;
      const dur = await medir(caminho);
      if (dur != null && dur > maxS) {
        throw new Error(
          `vídeo de ${Math.round(dur / 60)} min passa do teto de ${Math.round(maxS / 60)} min; peça um trecho ou use ver_video/transcrever`,
        );
      }
      const pronto = await comprimirSePreciso(caminho, dir, o.limiteBytes ?? LIMITE_BYTES);
      const mime = MIME[extname(pronto).toLowerCase()] ?? 'video/mp4';
      videoUrl = `data:${mime};base64,${(await readFile(pronto)).toString('base64')}`;
    }

    const res = await fetchFn(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', 'X-Title': 'whatsapp-collector assistir_video' },
      body: JSON.stringify(montarPedido(videoUrl, o.pergunta, modelo)),
      signal: AbortSignal.timeout(o.timeoutMs ?? 300_000),
    });
    const corpo = await res.text();
    if (!res.ok) throw new Error(erroOpenRouter(res.status, corpo));
    const r = lerResposta(JSON.parse(corpo));
    return { ...r, modelo, fonte };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}
