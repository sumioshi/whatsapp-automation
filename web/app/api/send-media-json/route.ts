import { unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";
import { resolveOutboundMedia } from "@/lib/outbound-media";

export const runtime = "nodejs";

function str(v: FormDataEntryValue | null): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";

  let jid: string | undefined;
  let kind: string | undefined;
  let caption: string | undefined;
  let fileName: string | undefined;
  let mimetype: string | undefined;
  let input: { path?: string; bytes?: Uint8Array };

  if (ct.includes("multipart/form-data")) {
    // Arquivo novo do operador: bytes crus no multipart (sem base64/JSON gigante).
    const form = await req.formData();
    jid = str(form.get("jid"));
    kind = str(form.get("kind"));
    caption = str(form.get("caption"));
    fileName = str(form.get("fileName"));
    mimetype = str(form.get("mimetype"));
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "arquivo (file) ausente no multipart" }, { status: 400 });
    }
    input = { bytes: new Uint8Array(await file.arrayBuffer()) };
  } else {
    // Reenvio de mídia já residente no DATA_DIR do container: só o mediaPath.
    const body = (await req.json()) as {
      jid?: string; kind?: string; path?: string;
      caption?: string; fileName?: string; mimetype?: string;
    };
    jid = body.jid;
    kind = body.kind;
    caption = body.caption;
    fileName = body.fileName;
    mimetype = body.mimetype;
    input = { path: body.path };
  }

  if (!jid || !kind) {
    return NextResponse.json({ error: "jid e kind são obrigatórios" }, { status: 400 });
  }

  let abs: string;
  let tmp: string | null = null;
  try {
    ({ abs, tmp } = await resolveOutboundMedia(input));
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
