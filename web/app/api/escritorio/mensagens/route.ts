import { NextResponse } from 'next/server';
import { cloudEnabled, cloudJson } from '@/lib/cloud';
import { type MessageView, readGroupMessages } from '@/lib/data';
import { ensureRootCloudEnv } from '@/lib/escritorio-estado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAFE = /^[A-Za-z0-9._-]+$/;

async function fetchSlugMessages(slug: string, limit: number): Promise<MessageView[]> {
  if (cloudEnabled()) {
    try {
      const data = await cloudJson<MessageView[] | { messages?: MessageView[] }>(
        `/api/messages?slug=${encodeURIComponent(slug)}&limit=${limit}`,
      );
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.messages)) return data.messages;
    } catch {
      // fallback para mensagens locais
    }
  }
  return readGroupMessages(slug, { limit });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawSlug = url.searchParams.get('slug') ?? '';
  const slugs = rawSlug
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (slugs.length === 0 || slugs.some((s) => !SAFE.test(s))) {
    return NextResponse.json({ error: 'slug inválido' }, { status: 400 });
  }

  const rawLimit = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

  ensureRootCloudEnv();

  if (slugs.length === 1) {
    const messages = await fetchSlugMessages(slugs[0], limit);
    return NextResponse.json({ messages });
  }

  // Quando há múltiplos slugs irmãos (ex.: DM telefone + DM LID da mesma pessoa), unifica em ordem cronológica
  const listas = await Promise.all(slugs.map((s) => fetchSlugMessages(s, limit)));
  const seen = new Set<string>();
  const merged: MessageView[] = [];
  for (const lista of listas) {
    for (const m of lista) {
      if (!m?.id || seen.has(m.id)) continue;
      seen.add(m.id);
      merged.push(m);
    }
  }
  merged.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
  return NextResponse.json({ messages: merged.slice(-limit) });
}
