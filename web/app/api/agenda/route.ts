import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { writeJsonAtomic } from "@/lib/json-store";
import { DATA_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIG = () => join(DATA_DIR, "agenda.config.json");

/** Config do embed da agenda (e-mail/ID do Google Calendar fica no volume, não no repo). */
export async function GET() {
  try {
    const cfg = JSON.parse(await readFile(CONFIG(), "utf8")) as { calendario?: string };
    return NextResponse.json({ calendario: cfg.calendario ?? null });
  } catch {
    return NextResponse.json({ calendario: null });
  }
}

export async function POST(req: Request) {
  let body: { calendario?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  // ID de agenda: e-mail ou id do Google (letras, dígitos e . _ % + - @).
  if (body.calendario !== null && !/^[\w.%+-]+@[\w.-]+$/.test(body.calendario ?? "")) {
    return NextResponse.json({ error: "calendário inválido (use o e-mail da agenda)" }, { status: 400 });
  }
  await writeJsonAtomic(CONFIG(), { calendario: body.calendario });
  return NextResponse.json({ calendario: body.calendario });
}
