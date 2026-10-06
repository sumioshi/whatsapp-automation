import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { readGroupRecords } from "@/lib/data";
import { atendenteDoPedido, exigirChat, respostaDeErro } from "@/lib/equipe/acesso";
import { destinoDoSlug } from "@/lib/equipe/destino";
import { motivoDeRecusa, recentesDaConta } from "@/lib/equipe/envio";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

const KINDS = new Set(["image", "document", "audio", "video"]);

export async function POST(req: Request) {
  let abs: string | null = null;
  try {
    const a = await atendenteDoPedido(req);
    const form = await req.formData();
    const slug = String(form.get("slug") ?? "");
    exigirChat(a, slug);
    const kind = String(form.get("kind") ?? "");
    const file = form.get("file");
    const caption = typeof form.get("caption") === "string" ? String(form.get("caption")).trim() : "";
    if (!KINDS.has(kind)) return NextResponse.json({ error: "kind inválido" }, { status: 400 });
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "arquivo ausente" }, { status: 400 });
    if (caption) {
      const recusa = motivoDeRecusa(caption, recentesDaConta(await readGroupRecords(slug), Date.now()));
      if (recusa) return NextResponse.json({ error: recusa }, { status: 422 });
    }
    const jid = await destinoDoSlug(slug);
    if (!jid) return NextResponse.json({ error: "não achei o destino deste chat" }, { status: 409 });
    const dir = join(tmpdir(), "wa-outbox");
    await mkdir(dir, { recursive: true });
    const fileName = file.name || `arquivo-${randomUUID()}`;
    abs = join(dir, `${randomUUID()}-${fileName}`);
    await writeFile(abs, Buffer.from(await file.arrayBuffer()));
    const res = await fetch(`${CONTROL_URL}/send-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jid, kind, path: abs,
        caption: caption || undefined,
        fileName: kind === "document" ? fileName : undefined,
        mimetype: file.type || undefined,
        ator: "painel", usuario: a.usuario.login,
      }),
    }).catch(() => null);
    if (!res) return NextResponse.json({ error: "WhatsApp fora do ar agora — tenta de novo em instantes." }, { status: 502 });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return NextResponse.json({ error: data.error ?? "falha no envio" }, { status: res.status || 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  } finally {
    if (abs) await unlink(abs).catch(() => {});
  }
}
