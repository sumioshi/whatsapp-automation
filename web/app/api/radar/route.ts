import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { writeJsonAtomic } from "@/lib/json-store";
import { CONTROL_URL, DATA_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS = () => join(DATA_DIR, ".radar-status.json");
const CONFIG = () => join(DATA_DIR, "radar.config.json");

const DEFAULTS = {
  ativo: false,
  dataCorte: null as string | null,
  prazoMinimoMin: 120,
  intervaloMin: 15,
  digestCooldownMin: 120,
};

async function lerConfig() {
  try {
    return { ...DEFAULTS, ...(JSON.parse(await readFile(CONFIG(), "utf8")) as object) };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Status + config do radar de sem-resposta (fonte única de "pendência"). */
export async function GET() {
  let status: unknown = null;
  try {
    status = JSON.parse(await readFile(STATUS(), "utf8"));
  } catch {
    /* coletor ainda não rodou um tick */
  }
  return NextResponse.json({ status, config: await lerConfig() });
}

export async function POST(req: Request) {
  let body: {
    acao?: string;
    ativo?: boolean;
    dataCorte?: string | null;
    prazoMinimoMin?: number;
    intervaloMin?: number;
    digestCooldownMin?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  // "Varrer agora" — repassa pro control server do coletor.
  if (body.acao === "agora") {
    try {
      const res = await fetch(`${CONTROL_URL}/radar`, { method: "POST" });
      return NextResponse.json(await res.json(), { status: res.status });
    } catch {
      return NextResponse.json({ error: "coletor inacessível" }, { status: 502 });
    }
  }

  const atual = await lerConfig();
  const prox = { ...atual };
  if (typeof body.ativo === "boolean") prox.ativo = body.ativo;
  if (
    body.dataCorte === null ||
    (typeof body.dataCorte === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dataCorte))
  ) {
    prox.dataCorte = body.dataCorte;
  }
  for (const k of ["prazoMinimoMin", "intervaloMin", "digestCooldownMin"] as const) {
    const v = body[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 10080) prox[k] = Math.round(v);
  }
  await writeJsonAtomic(CONFIG(), prox);
  return NextResponse.json({ config: prox });
}
