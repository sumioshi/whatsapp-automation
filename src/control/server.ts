import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { env } from '../config/env.js';
import type { OutboundMedia } from '../core/message.js';
import type { WhatsAppGateway } from '../core/ports.js';
import { quebrarEmBaloes } from '../humano/baloes.js';
import { foraDoExpediente } from '../humano/expediente.js';
import { loadPerfilEnvio } from '../humano/perfil.js';
import { planoDeEntrega } from '../humano/plano.js';
import { logger } from '../logger.js';
import { slugify } from '../storage/paths.js';
import { assertPublicHttpUrl } from './safe-url.js';

/** Teto de download do /send-media-url (16 MB) — evita estourar a RAM do container. */
const MAX_MEDIA_URL_BYTES = 16 * 1024 * 1024;

/** True se `path` (resolvido) está dentro de algum diretório permitido. */
function isWithin(path: string, allowedDirs: string[]): boolean {
  const abs = resolve(path);
  return allowedDirs.some((dir) => abs === dir || abs.startsWith(dir + sep));
}

interface SendBody {
  jid?: string;
  text?: string;
  mentions?: string[];
  humano?: boolean;
  slug?: string;
  typos?: boolean;
  umBalao?: boolean;
}

interface EditBody {
  jid?: string;
  msgId?: string;
  text?: string;
}

interface ReactBody {
  jid?: string;
  msgId?: string;
  participant?: string;
  fromMe?: boolean;
  emoji?: string;
}

interface SendMediaBody {
  jid?: string;
  kind?: string;
  path?: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
}

interface CheckNumberBody {
  number?: string;
}

interface ProfileNameBody {
  name?: string;
}
interface ProfileStatusBody {
  status?: string;
}
interface ProfilePictureBody {
  path?: string;
}

const MEDIA_KINDS = new Set(['image', 'document', 'audio', 'video', 'gif']);

/**
 * Valida o body de /send-media e monta a OutboundMedia.
 * Retorna `{ error }` com a mensagem do primeiro problema encontrado.
 */
function parseOutboundMedia(
  body: SendMediaBody,
  allowedDirs: string[],
): { media: OutboundMedia } | { error: string } {
  const { jid, kind, path, caption, fileName, mimetype } = body;
  if (!jid || !kind || !path) return { error: 'jid, kind e path são obrigatórios' };
  if (!MEDIA_KINDS.has(kind)) {
    return { error: 'kind deve ser image, document, audio, video ou gif' };
  }
  // Segurança: o path tem que estar dentro de um diretório permitido (DATA_DIR / tmp).
  // Sem isso, qualquer processo local que alcance :4310 exfiltraria arquivo arbitrário.
  if (!isWithin(path, allowedDirs)) return { error: 'path fora do diretório permitido' };
  if (!existsSync(path)) return { error: `arquivo não encontrado: ${path}` };
  switch (kind) {
    case 'image':
      return { media: { kind: 'image', path, caption } };
    case 'video':
      return { media: { kind: 'video', path, caption } };
    case 'gif':
      return { media: { kind: 'gif', path, caption } };
    case 'audio':
      return { media: { kind: 'audio', path } };
    case 'document':
      if (!fileName) return { error: 'fileName é obrigatório para document' };
      return { media: { kind: 'document', path, fileName, mimetype, caption } };
    default:
      return { error: 'kind inválido' };
  }
}

function readJson(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('payload muito grande'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

interface SendMediaUrlBody {
  jid?: string;
  url?: string;
  kind?: string;
  fileName?: string;
  caption?: string;
}

/** Uma mensagem já achatada para consumo externo (ex.: painel do Radar). */
interface ConversationMessage {
  fromMe: boolean;
  text: string;
  timestamp: number;
  author: string | null;
}

/**
 * Lê as últimas `limit` mensagens de uma conversa (grupo ou DM) direto do
 * messages.jsonl do slug. Conversa inexistente (ex.: lead que ainda não
 * respondeu) devolve lista vazia. Não aplica edições/deletes — é uma leitura
 * simples para exibição, não a fonte canônica do painel.
 */
export async function readRecentMessages(
  dataDir: string,
  slug: string,
  limit: number,
): Promise<ConversationMessage[]> {
  const file = join(dataDir, slug, 'messages.jsonl');
  if (!existsSync(file)) return [];
  const raw = await readFile(file, 'utf8');
  const lines = raw.split('\n').filter((line) => line.trim());
  const recent = lines.slice(-limit);
  const messages: ConversationMessage[] = [];
  for (const line of recent) {
    try {
      const record = JSON.parse(line) as {
        fromMe?: boolean;
        text?: string;
        timestamp?: string;
        senderName?: string;
      };
      messages.push({
        fromMe: record.fromMe === true,
        text: record.text ?? '',
        timestamp: record.timestamp ? Date.parse(record.timestamp) : 0,
        author: record.senderName ?? null,
      });
    } catch {
      // linha corrompida — ignora e segue.
    }
  }
  return messages;
}

/**
 * API de controle local (apenas 127.0.0.1) para o painel/MCP pedirem envios.
 * O coletor é o único processo com a conexão do WhatsApp, então ele envia.
 */
export function startControlServer(
  gateway: WhatsAppGateway,
  port: number,
  allowedDirs: string[],
): void {
  const allowed = allowedDirs.map((d) => resolve(d));
  const server = createServer((req, res) => {
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && req.url === '/health') {
      json(200, { ok: true });
      return;
    }

    if (req.method === 'POST' && req.url === '/check-number') {
      readJson(req)
        .then(async (parsed) => {
          const { number } = (parsed ?? {}) as CheckNumberBody;
          const digits = (number ?? '').replace(/\D/g, '');
          if (!digits) {
            json(400, { error: 'number é obrigatório (dígitos com DDI)' });
            return;
          }
          const result = await gateway.checkNumber(digits);
          logger.info({ exists: result.exists }, '🔎 Número verificado via API de controle.');
          json(200, result);
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    // Leitura da conversa (grupo ou DM). Slug de DM = dm-<handle-do-jid>.
    if (req.method === 'GET' && req.url?.startsWith('/messages/')) {
      const path = req.url.split('?')[0] ?? '';
      const rawSlug = path.slice('/messages/'.length);
      const slug = rawSlug ? decodeURIComponent(rawSlug) : '';
      if (!slug || slug.includes('/') || slug.includes('..')) {
        json(400, { error: 'slug inválido' });
        return;
      }
      readRecentMessages(env.DATA_DIR, slug, 30)
        .then((messages) => json(200, { messages }))
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    // Envia mídia a partir de uma URL pública (baixa pra tmp e envia). Evita
    // expor o filesystem como o /send-media cru (que aceita path local).
    if (req.method === 'POST' && req.url === '/send-media-url') {
      readJson(req)
        .then(async (parsed) => {
          const { jid, url, kind, fileName, caption } = (parsed ?? {}) as SendMediaUrlBody;
          if (!jid || !url || !kind) {
            json(400, { error: 'jid, url e kind são obrigatórios' });
            return;
          }
          if (kind !== 'image' && kind !== 'document') {
            json(400, { error: 'kind deve ser image ou document' });
            return;
          }
          let safeUrl: URL;
          try {
            safeUrl = await assertPublicHttpUrl(url);
          } catch (e) {
            json(400, { error: e instanceof Error ? e.message : 'url inválida' });
            return;
          }
          const download = await fetch(safeUrl);
          if (!download.ok) {
            json(502, { error: `download falhou: HTTP ${download.status}` });
            return;
          }
          const declared = Number(download.headers.get('content-length') ?? 0);
          if (declared > MAX_MEDIA_URL_BYTES) {
            json(413, { error: 'arquivo excede o limite de 16 MB' });
            return;
          }
          const buffer = Buffer.from(await download.arrayBuffer());
          if (buffer.length > MAX_MEDIA_URL_BYTES) {
            json(413, { error: 'arquivo excede o limite de 16 MB' });
            return;
          }
          const tmpPath = resolve(tmpdir(), `wac-${slugify(fileName ?? 'anexo')}-${randomUUID()}`);
          await writeFile(tmpPath, buffer);
          try {
            const media: OutboundMedia =
              kind === 'document'
                ? { kind: 'document', path: tmpPath, fileName: fileName ?? 'documento.pdf', caption }
                : { kind: 'image', path: tmpPath, caption };
            await gateway.sendMedia(jid, media);
            logger.info({ kind }, '📎🔗 Mídia (via URL) enviada via API de controle.');
            json(200, { ok: true });
          } finally {
            await unlink(tmpPath).catch(() => {});
          }
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/send') {
      readJson(req)
        .then(async (parsed) => {
          const { jid, text, mentions, humano, slug, typos, umBalao } = (parsed ?? {}) as SendBody;
          if (!jid || !text) {
            json(400, { error: 'jid e text são obrigatórios' });
            return;
          }
          if (humano) {
            const perfil = await loadPerfilEnvio(slug, env.DATA_DIR);
            // umBalao: entrega humanizada (visto/pausa/digitando) mas SEM fatiar o texto.
            const baloes = umBalao ? [text.trim()] : quebrarEmBaloes(text, perfil);
            const plano = planoDeEntrega(baloes, perfil, {
              typos: typos === true,
              foraDoExpediente: await foraDoExpediente(env.DATA_DIR),
            });
            const r = await gateway.entregarHumano(jid, plano);
            logger.info({ jid, baloes: r.total }, '📤🧍 Entrega humanizada concluída.');
            json(200, { ok: true, baloes: r.total });
            return;
          }
          await gateway.sendText(jid, text, Array.isArray(mentions) ? mentions : undefined);
          logger.info({ jid }, '📤 Mensagem enviada via API de controle.');
          json(200, { ok: true });
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/send-media') {
      readJson(req)
        .then(async (parsed) => {
          const result = parseOutboundMedia((parsed ?? {}) as SendMediaBody, allowed);
          if ('error' in result) {
            json(400, { error: result.error });
            return;
          }
          const { media } = result;
          await gateway.sendMedia((parsed as SendMediaBody).jid as string, media);
          logger.info({ kind: media.kind }, '📎 Mídia enviada via API de controle.');
          json(200, { ok: true });
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/react') {
      readJson(req)
        .then(async (parsed) => {
          const { jid, msgId, participant, fromMe, emoji } = (parsed ?? {}) as ReactBody;
          if (!jid || !msgId || typeof emoji !== 'string') {
            json(400, { error: 'jid, msgId e emoji são obrigatórios' });
            return;
          }
          await gateway.sendReaction(jid, { id: msgId, participant, fromMe }, emoji);
          logger.info({ jid, emoji }, '👍 Reação enviada via API de controle.');
          json(200, { ok: true });
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/edit') {
      readJson(req)
        .then(async (parsed) => {
          const { jid, msgId, text } = (parsed ?? {}) as EditBody;
          if (!jid || !msgId || !text?.trim()) {
            json(400, { error: 'jid, msgId e text são obrigatórios' });
            return;
          }
          await gateway.editText(jid, msgId, text.trim());
          logger.info({ jid, msgId }, '✏️  Mensagem editada via API de controle.');
          json(200, { ok: true });
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/profile/name') {
      readJson(req)
        .then(async (parsed) => {
          const { name } = (parsed ?? {}) as ProfileNameBody;
          if (!name || !name.trim()) {
            json(400, { error: 'name é obrigatório' });
            return;
          }
          await gateway.updateProfileName(name.trim());
          logger.info('👤 Nome do perfil atualizado via API de controle.');
          json(200, { ok: true });
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/profile/status') {
      readJson(req)
        .then(async (parsed) => {
          const { status } = (parsed ?? {}) as ProfileStatusBody;
          if (typeof status !== 'string' || !status.trim()) {
            json(400, { error: 'status é obrigatório' });
            return;
          }
          await gateway.updateProfileStatus(status.trim());
          logger.info('💬 Recado do perfil atualizado via API de controle.');
          json(200, { ok: true });
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/profile/picture') {
      readJson(req)
        .then(async (parsed) => {
          const { path } = (parsed ?? {}) as ProfilePictureBody;
          if (!path) {
            json(400, { error: 'path é obrigatório' });
            return;
          }
          if (!isWithin(path, allowed)) {
            json(400, { error: 'path fora do diretório permitido' });
            return;
          }
          if (!existsSync(path)) {
            json(400, { error: `arquivo não encontrado: ${path}` });
            return;
          }
          await gateway.updateProfilePicture(path);
          logger.info('🖼️  Foto do perfil atualizada via API de controle.');
          json(200, { ok: true });
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    json(404, { error: 'rota não encontrada' });
  });

  server.listen(port, '127.0.0.1', () => {
    logger.info({ port }, '🎛️  API de controle (envio) ouvindo em 127.0.0.1.');
  });
}
