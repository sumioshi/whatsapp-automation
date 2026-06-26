import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { DATA_DIR } from '@/lib/paths';

export const runtime = 'nodejs';

/** Lista os .jsonl de cada grupo pro sync do Mac puxar e mergear. */
export async function GET() {
  const files: { path: string; size: number; mtime: number }[] = [];
  let groups: string[] = [];
  try {
    const entries = await readdir(DATA_DIR, { withFileTypes: true });
    groups = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return NextResponse.json({ files });
  }
  for (const g of groups) {
    let inner: string[] = [];
    try {
      inner = await readdir(join(DATA_DIR, g));
    } catch {
      continue;
    }
    for (const f of inner) {
      // .jsonl de verdade; ignora dotfiles e o lixo AppleDouble "._*.jsonl".
      if (!f.endsWith('.jsonl') || f.startsWith('.')) continue;
      const s = await stat(join(DATA_DIR, g, f));
      files.push({ path: `${g}/${f}`, size: s.size, mtime: s.mtimeMs });
    }
  }
  return NextResponse.json({ files });
}
