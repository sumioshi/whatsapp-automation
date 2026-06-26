import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { NextResponse } from 'next/server';
import { safeDataPath } from '@/lib/paths';

export const runtime = 'nodejs';

// Serve o .jsonl gzipado no CORPO (sinalizado por x-wac-gzip, não Content-Encoding):
// o `tailscale serve` em userspace networking tem throughput baixo e trava com
// payloads >~1.5MB. JSON-lines comprime ~10x, mantendo o corpo bem pequeno. O
// cliente (scripts/sync-pull) faz o gunzip. Header próprio evita que o proxy mexa.
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.length || !path[path.length - 1].endsWith('.jsonl')) {
    return NextResponse.json({ error: 'só .jsonl' }, { status: 400 });
  }
  let abs: string;
  try {
    abs = safeDataPath(...path);
  } catch {
    return NextResponse.json({ error: 'path inválido' }, { status: 400 });
  }
  try {
    const gz = gzipSync(await readFile(abs));
    return new NextResponse(gz, {
      headers: { 'content-type': 'application/octet-stream', 'x-wac-gzip': '1' },
    });
  } catch {
    return NextResponse.json({ error: 'não encontrado' }, { status: 404 });
  }
}
