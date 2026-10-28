import { NextResponse } from 'next/server';
import { cloudEnabled, cloudJson } from '@/lib/cloud';
import { readGroupMessages } from '@/lib/data';
import { ensureRootCloudEnv } from '@/lib/escritorio-estado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAFE = /^[A-Za-z0-9._-]+$/;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  if (!slug || !SAFE.test(slug)) {
    return NextResponse.json({ error: 'slug inválido' }, { status: 400 });
  }
  const rawLimit = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

  ensureRootCloudEnv();

  if (cloudEnabled()) {
    try {
      const data = await cloudJson<unknown>(
        `/api/messages?slug=${encodeURIComponent(slug)}&limit=${limit}`,
      );
      return NextResponse.json(data);
    } catch {
      // fallback para mensagens locais
    }
  }

  return NextResponse.json(await readGroupMessages(slug, { limit }));
}
