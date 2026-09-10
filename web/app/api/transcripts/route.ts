import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { NextResponse } from 'next/server';
import { transcriptPathFor } from '@/lib/data';

export const runtime = 'nodejs';

/**
 * POST /api/transcripts {slug, mediaPath, text} — grava o sidecar de transcrição
 * feito em OUTRA máquina (o MCP em modo remoto transcreve no Mac com MLX). Sem
 * isso a nuvem seguiria listando a mídia como pendente e `ler_mensagens` sem a
 * transcrição. Idempotente: sobrescreve.
 */
const SAFE = /^[A-Za-z0-9._/-]+$/;
const MAX_TEXT = 200_000;

export async function POST(req: Request) {
  let body: { slug?: string; mediaPath?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const { slug, mediaPath, text } = body;
  if (!slug || !mediaPath || !SAFE.test(slug) || !SAFE.test(mediaPath)) {
    return NextResponse.json({ error: 'slug/mediaPath ausente ou inválido' }, { status: 400 });
  }
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) {
    return NextResponse.json({ error: 'text ausente, vazio ou grande demais' }, { status: 400 });
  }
  try {
    const sidecar = transcriptPathFor(slug, mediaPath);
    await mkdir(dirname(sidecar), { recursive: true });
    await writeFile(sidecar, `${text.trim()}\n`, 'utf8');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'falha ao gravar' }, { status: 500 });
  }
}
