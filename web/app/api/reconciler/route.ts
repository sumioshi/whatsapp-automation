import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { writeJsonAtomic } from "@/lib/json-store";
import { CONTROL_URL, DATA_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS = () => join(DATA_DIR, ".reconciler-status.json");
const CONFIG = () => join(DATA_DIR, "reconciler.config.json");

/** Status + config da sincronização automática (lido pelo /config e /clientes). */
export async function GET() {
  let status: unknown = null;
  let intervaloMin = 15;
  try {
    status = JSON.parse(await readFile(STATUS(), "utf8"));
  } catch {
    /* coletor ainda não rodou um ciclo */
  }
  try {
    const cfg = JSON.parse(await readFile(CONFIG(), "utf8")) as { intervaloMin?: number };
    if (typeof cfg.intervaloMin === "number") intervaloMin = cfg.intervaloMin;
  } catch {
    /* sem config → default */
  }
  return NextResponse.json({ status, intervaloMin });
}

export async function POST(req: Request) {
  let body: { intervaloMin?: number; acao?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  // "Sincronizar agora" — repassa pro control server do coletor.
  if (body.acao === "agora") {
    try {
      const res = await fetch(`${CONTROL_URL}/reconcile`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return NextResponse.json(data, { status: res.status });
    } catch {
      return NextResponse.json({ error: "coletor fora do ar" }, { status: 502 });
    }
  }

  if (typeof body.intervaloMin === "number" && body.intervaloMin >= 1) {
    await writeJsonAtomic(CONFIG(), { intervaloMin: Math.round(body.intervaloMin) });
    return NextResponse.json({ ok: true, intervaloMin: Math.round(body.intervaloMin) });
  }

  return NextResponse.json({ error: "ação inválida" }, { status: 400 });
}
