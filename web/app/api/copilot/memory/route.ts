import { NextResponse } from "next/server";
import { readGroupMemory as readMemory, writeGroupMemory as writeMemory } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }
  return NextResponse.json({ content: await readMemory(slug) });
}

interface MemoryPost {
  slug?: string;
  content?: string;
}

export async function POST(req: Request) {
  let body: MemoryPost;
  try {
    body = (await req.json()) as MemoryPost;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { slug, content } = body;
  if (typeof slug !== "string" || !slug) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content deve ser string" }, { status: 400 });
  }

  await writeMemory(slug, content);
  return NextResponse.json({ ok: true });
}

// O CopilotPanel salva a memória com PUT (escrita idempotente). Mesmo handler do POST.
export const PUT = POST;
