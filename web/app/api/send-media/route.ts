import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { credenciaisDoDono, metaDoPainel, SESSION_COOKIE } from "@/lib/equipe/autenticar";
import { chaveDeSessao } from "@/lib/equipe/sessao";
import { mimeDoNome, nomeSeguro } from "@/lib/nome-arquivo";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

const KINDS = new Set(["image", "document", "audio", "video"]);
/** Mesmo teto da área de atendimento (o proxy aceita corpo até 70 MB). */
const TETO_BYTES = 64 * 1024 * 1024;

/**
 * Recebe um arquivo (multipart) do painel, grava num temp e manda pro coletor
 * via /send-media (que envia pelo WhatsApp). O coletor re-salva a própria mídia
 * em data/<grupo>/, então o temp é apagado depois do envio, deu certo ou não.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "esperado multipart/form-data" }, { status: 400 });
  }

  const jid = form.get("jid");
  const kind = form.get("kind");
  const caption = form.get("caption");
  const file = form.get("file");

  if (typeof jid !== "string" || !jid) {
    return NextResponse.json({ error: "jid é obrigatório" }, { status: 400 });
  }
  if (typeof kind !== "string" || !KINDS.has(kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "arquivo ausente" }, { status: 400 });
  }
  if (file.size > TETO_BYTES) {
    return NextResponse.json({ error: "arquivo maior que 64 MB" }, { status: 413 });
  }
  // Envio do dono pelo painel (cookie, sem Basic) sai carimbado, como no /api/send.
  const meta = metaDoPainel(
    (await cookies()).get(SESSION_COOKIE)?.value,
    req.headers.get("authorization"),
    credenciaisDoDono(),
    chaveDeSessao(),
  );

  const dir = join(tmpdir(), "wa-outbox");
  await mkdir(dir, { recursive: true });
  const fileName = nomeSeguro(file.name, `arquivo-${randomUUID()}`);
  const abs = join(dir, randomUUID());
  await writeFile(abs, Buffer.from(await file.arrayBuffer()));

  try {
    const res = await fetch(`${CONTROL_URL}/send-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jid,
        kind,
        path: abs,
        caption: typeof caption === "string" && caption.trim() ? caption.trim() : undefined,
        fileName: kind === "document" ? fileName : undefined,
        mimetype: file.type || mimeDoNome(fileName),
        ...(meta ?? {}),
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json(
        { error: data.error ?? "falha no envio" },
        { status: res.status || 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Coletor offline — inicie o coletor para enviar." },
      { status: 502 },
    );
  } finally {
    await unlink(abs).catch(() => {});
  }
}
