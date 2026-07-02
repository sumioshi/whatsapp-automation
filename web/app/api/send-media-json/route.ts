import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { CONTROL_URL, safeDataPath } from "@/lib/paths";

export const runtime = "nodejs";

interface Body {
  jid?: string;
  kind?: string;
  path?: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
}

export async function POST(req: Request) {
  const { jid, kind, path, caption, fileName, mimetype } = (await req.json()) as Body;
  if (!jid || !kind || !path) {
    return NextResponse.json({ error: "jid, kind e path são obrigatórios" }, { status: 400 });
  }
  // path é mediaPath relativo dentro do DATA_DIR do container.
  const abs = path.startsWith("/") ? path : safeDataPath(path);
  if (!existsSync(abs)) {
    return NextResponse.json({ error: `arquivo não encontrado: ${path}` }, { status: 400 });
  }
  try {
    const res = await fetch(`${CONTROL_URL}/send-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid, kind, path: abs, caption, fileName, mimetype }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json({ error: data.error ?? "falha no envio" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
