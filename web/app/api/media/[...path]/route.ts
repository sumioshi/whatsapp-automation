import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { safeDataPath } from '@/lib/paths';

export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, string> = {
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
};

function contentType(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function toWeb(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;

  let absPath: string;
  try {
    absPath = safeDataPath(...path);
  } catch {
    return new Response('Caminho inválido', { status: 400 });
  }

  let size: number;
  try {
    const info = await stat(absPath);
    if (!info.isFile()) return new Response('Não encontrado', { status: 404 });
    size = info.size;
  } catch {
    return new Response('Não encontrado', { status: 404 });
  }

  const type = contentType(absPath);
  const range = req.headers.get('range');

  // Range: necessário para o player buscar (seek) em áudio/vídeo.
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : size - 1;
    if (start >= size || end >= size || start > end) {
      return new Response('Range inválido', {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }
    return new Response(toWeb(createReadStream(absPath, { start, end })), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  return new Response(toWeb(createReadStream(absPath)), {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
