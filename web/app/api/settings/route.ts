import { NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readSettings());
}

export async function POST(req: Request) {
  let body: { model?: string; language?: string };
  try {
    body = (await req.json()) as { model?: string; language?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const saved = await writeSettings({ model: body.model, language: body.language });
  return NextResponse.json(saved);
}
