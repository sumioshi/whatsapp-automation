import { NextResponse } from "next/server";
import { type EntradaFeature, listarFeatures, registrarFeature } from "@/lib/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  return NextResponse.json(
    await listarFeatures({ slug: u.searchParams.get("slug") ?? undefined, desde: u.searchParams.get("desde") ?? undefined }),
  );
}

export async function POST(req: Request) {
  let corpo: EntradaFeature;
  try {
    corpo = (await req.json()) as EntradaFeature;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  try {
    return NextResponse.json(await registrarFeature(corpo));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "entrega inválida" }, { status: 400 });
  }
}
