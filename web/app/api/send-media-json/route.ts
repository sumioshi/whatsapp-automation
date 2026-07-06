import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";
import { resolveOutboundMedia } from "@/lib/outbound-media";

export const runtime = "nodejs";

interface Body {
  jid?: string;
  kind?: string;
  path?: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
  dataBase64?: string;
}

export async function POST(req: Request) {
  const { jid, kind, path, caption, fileName, mimetype, dataBase64 } = (await req.json()) as Body;
  if (!jid || !kind) {
    return NextResponse.json({ error: "jid e kind são obrigatórios" }, { status: 400 });
  }

  // `dataBase64` = arquivo novo do operador (bytes no corpo); `path` = mediaPath já
  // residente no DATA_DIR do container (reenvio de mídia sincronizada da nuvem).
  let abs: string;
  let tmp: string | null = null;
  try {
    ({ abs, tmp } = await resolveOutboundMedia({ path, dataBase64 }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "mídia inválida" }, { status: 400 });
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
  } finally {
    if (tmp) await unlink(tmp).catch(() => {});
  }
}
