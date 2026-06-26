import { access, readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { transcriptPathFor } from '@/lib/data';
import { transcribe } from '@/lib/transcribe';

export const runtime = 'nodejs';
export const maxDuration = 300; // transcrições longas têm folga

interface Body {
  slug?: string;
  mediaPath?: string;
}

const SAFE = /^[A-Za-z0-9._/-]+$/;

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { slug, mediaPath } = body;
  if (!slug || !mediaPath || !SAFE.test(slug) || !SAFE.test(mediaPath)) {
    return NextResponse.json({ error: 'slug/mediaPath ausente ou inválido' }, { status: 400 });
  }

  // Dedup: se já transcrito, devolve sem gastar processamento.
  try {
    const existing = transcriptPathFor(slug, mediaPath);
    await access(existing);
    const text = (await readFile(existing, 'utf8')).trim();
    return NextResponse.json({ text, cached: true });
  } catch {
    // ainda não existe — segue para transcrever
  }

  try {
    const text = await transcribe(slug, mediaPath);
    return NextResponse.json({ text, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erro desconhecido';
    return NextResponse.json({ error: `Falha na transcrição: ${message}` }, { status: 500 });
  }
}
