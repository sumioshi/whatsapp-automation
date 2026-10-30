import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { writeJsonAtomic } from '@/lib/json-store';
import { safeDataPath } from '@/lib/paths';

export const runtime = 'nodejs';

const LAYOUT_FILE = () => safeDataPath('.escritorio-layout.json');
const SEATS_FILE = () => safeDataPath('.escritorio-assentos.json');
const DEFAULT_LAYOUT_FILE = () =>
  resolve(/* turbopackIgnore: true */ process.cwd(), 'public', 'assets', 'default-layout.json');

async function readSavedOrDefaultLayout(): Promise<unknown> {
  try {
    const raw = await readFile(LAYOUT_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    // Se o layout salvo for antigo (menos de 50 colunas ou versão < 4), migra para a arquitetura multi-salas V4 estilo AIOffice
    if (parsed && typeof parsed === 'object' && parsed.cols >= 50 && (parsed.version ?? 1) >= 4) {
      return parsed;
    }
  } catch {
    // fallback abaixo
  }
  const fallback = await readFile(DEFAULT_LAYOUT_FILE(), 'utf8');
  return JSON.parse(fallback);
}

async function readSavedSeats(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(SEATS_FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const [layout, seats] = await Promise.all([readSavedOrDefaultLayout(), readSavedSeats()]);
    return NextResponse.json({ layout, seats });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Falha ao carregar layout do escritorio' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      layout?: unknown;
      seats?: Record<string, unknown>;
      reset?: boolean;
    };

    if (body.reset) {
      try {
        await unlink(LAYOUT_FILE());
      } catch {
        // ja estava limpo
      }
      const layout = await readSavedOrDefaultLayout();
      return NextResponse.json({ ok: true, layout });
    }

    if (body.layout && typeof body.layout === 'object') {
      await writeJsonAtomic(LAYOUT_FILE(), body.layout);
    }

    if (body.seats && typeof body.seats === 'object') {
      await writeJsonAtomic(SEATS_FILE(), body.seats);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Falha ao salvar layout do escritorio' },
      { status: 400 },
    );
  }
}
