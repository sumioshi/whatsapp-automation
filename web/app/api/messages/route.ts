import { NextResponse } from "next/server";
import { readGroupMessages } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE = /^[A-Za-z0-9._-]+$/;
// Janela padrão do chat: o suficiente pra contexto sem serializar o histórico
// inteiro (grupo grande = dezenas de MB por request; o poll roda a cada 3s).
const DEFAULT_LIMIT = 150;
const MAX_LIMIT = 500;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug || !SAFE.test(slug)) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }
  const before = url.searchParams.get("before") ?? undefined;
  if (before && !/^[\w=+/-]{1,128}$/.test(before)) {
    return NextResponse.json({ error: "before inválido" }, { status: 400 });
  }
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(rawLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;
  return NextResponse.json(await readGroupMessages(slug, { limit, before }));
}
