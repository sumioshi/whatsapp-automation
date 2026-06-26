import type { Readable } from 'node:stream';
import type { WAMessage, WASocket } from 'baileys';
import { downloadMediaMessage } from 'baileys';
import type { MediaDescriptor, MediaKind } from '../core/message.js';
import { baileysLogger } from '../logger.js';

const DEFAULT_EXT: Record<MediaKind, string> = {
  audio: 'ogg',
  video: 'mp4',
  image: 'jpg',
  document: 'bin',
  sticker: 'webp',
  gif: 'mp4',
};

function extFromMime(kind: MediaKind, mimetype: string | null | undefined): string {
  // Áudio do WhatsApp (PTT e arquivos) é sempre ogg/opus.
  if (kind === 'audio') return 'ogg';
  if (!mimetype) return DEFAULT_EXT[kind];
  const sub = mimetype.split(';')[0]?.split('/')[1]?.toLowerCase();
  if (!sub) return DEFAULT_EXT[kind];
  const normalized = sub.replace('jpeg', 'jpg').replace('quicktime', 'mov');
  return normalized.length >= 2 && normalized.length <= 5 ? normalized : DEFAULT_EXT[kind];
}

function extFromFileName(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const match = fileName.match(/\.([A-Za-z0-9]{1,8})$/);
  return match?.[1] ? match[1].toLowerCase() : null;
}

/** Resolve a melhor extensão para a mídia (documento usa o nome original). */
export function resolveExtension(
  kind: MediaKind,
  mimetype: string | null | undefined,
  fileName: string | null | undefined,
): string {
  if (kind === 'document') {
    return extFromFileName(fileName) ?? extFromMime(kind, mimetype);
  }
  return extFromMime(kind, mimetype);
}

/**
 * Monta o descritor de mídia com o closure de download ligado ao socket.
 * Toda dependência do Baileys para baixar fica encapsulada aqui.
 */
export function buildMediaDescriptor(
  kind: MediaKind,
  mimetype: string | null | undefined,
  fileName: string | null | undefined,
  wa: WAMessage,
  sock: WASocket,
): MediaDescriptor {
  return {
    kind,
    mimetype: mimetype ?? null,
    fileExtension: resolveExtension(kind, mimetype, fileName),
    download: (): Promise<Readable> =>
      downloadMediaMessage(
        wa,
        'stream',
        {},
        { logger: baileysLogger, reuploadRequest: sock.updateMediaMessage },
      ),
  };
}
