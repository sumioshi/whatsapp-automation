import { NextResponse } from "next/server";
import { listClaudeProjects } from "@/lib/memory";
import { readTriage, setMemorySources } from "@/lib/triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug obrigatório" }, { status: 400 });
  }

  const [available, triage] = await Promise.all([listClaudeProjects(), readTriage()]);
  const selected = triage.memorySources[slug] ?? [];

  return NextResponse.json({ available, selected });
}

interface MemorySourcesPost {
  slug?: string;
  dirs?: unknown;
}

export async function POST(req: Request) {
  let body: MemorySourcesPost;
  try {
    body = (await req.json()) as MemorySourcesPost;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { slug, dirs } = body;
  if (typeof slug !== "string" || !slug) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }
  if (!Array.isArray(dirs) || !dirs.every((d) => typeof d === "string")) {
    return NextResponse.json({ error: "dirs deve ser array de strings" }, { status: 400 });
  }

  await setMemorySources(slug, dirs as string[]);
  return NextResponse.json({ ok: true });
}
