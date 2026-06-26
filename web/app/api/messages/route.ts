import { NextResponse } from "next/server";
import { readGroupMessages } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE = /^[A-Za-z0-9._-]+$/;

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug || !SAFE.test(slug)) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }
  return NextResponse.json(await readGroupMessages(slug));
}
