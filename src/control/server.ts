import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, sep } from 'node:path';
import type { OutboundMedia } from '../core/message.js';
import type { WhatsAppGateway } from '../core/ports.js';
import { logger } from '../logger.js';

/** True se `path` (resolvido) está dentro de algum diretório permitido. */
function isWithin(path: string, allowedDirs: string[]): boolean {
  const abs = resolve(path);
  return allowedDirs.some((dir) => abs === dir || abs.startsWith(dir + sep));
}

interface SendBody {
  jid?: string;
  text?: string;
  mentions?: string[];
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

    if (req.method === 'POST' && req.url === '/send') {
      readJson(req)
        .then(async (parsed) => {
          const { jid, text, mentions } = (parsed ?? {}) as SendBody;
          if (!jid || !text) {
            json(400, { error: 'jid e text são obrigatórios' });
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

    json(404, { error: 'rota não encontrada' });
  });

  server.listen(port, '127.0.0.1', () => {
    logger.info({ port }, '🎛️  API de controle (envio) ouvindo em 127.0.0.1.');
  });
}
