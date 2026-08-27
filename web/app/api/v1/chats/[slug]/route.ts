import { NextResponse } from "next/server";
import {
  corpoJson,
  ErroApi,
  jidDoSlug,
  preflight,
  respostaOk,
  rota,
  slugValido,
} from "@/lib/api-v1";
import { countGroupMessages, listGroups } from "@/lib/data";
import {
  dsSetAutonomo,
  dsSetEtiquetas,
  dsSetMuted,
  dsSetNote,
  dsSetResolved,
  dsTriage,
} from "@/lib/data-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugDaUrl(req: Request): string {
  const partes = new URL(req.url).pathname.split("/").filter(Boolean);
  const slug = decodeURIComponent(partes[partes.length - 1] ?? "");
  if (!slugValido(slug)) throw new ErroApi("invalid_request", "slug inválido");
  return slug;
}

/** Detalhe do chat: identidade, contagem e o estado de triagem atual. */
export const GET = rota("read", async ({ req }) => {
  const slug = slugDaUrl(req);
  const grupo = (await listGroups()).find((g) => g.slug === slug);
  if (!grupo) throw new ErroApi("not_found", `chat "${slug}" não encontrado`);
  const triagem = await dsTriage();
  return respostaOk({
    slug: grupo.slug,
    name: grupo.name,
    jid: await jidDoSlug(slug),
    messageCount: await countGroupMessages(slug),
    lastTimestamp: grupo.lastTimestamp,
    triage: {
      mode: triagem.autonomo?.[slug] === true ? "autonomous" : "confirm",
      muted: triagem.muted?.[slug] === true,
      resolvedAt: triagem.resolved?.[slug] ?? null,
      note: triagem.notes?.[slug] ?? null,
      tags: triagem.etiquetas?.[slug] ?? [],
    },
  });
});

interface CorpoTriagem {
  mode?: "confirm" | "autonomous";
  muted?: boolean;
  resolvedAt?: string;
  note?: string;
  tags?: string[];
}

/**
 * Atualiza a triagem do chat. Campos ausentes ficam como estão — é PATCH,
 * não substituição.
 */
export const PATCH = rota("write", async ({ req }) => {
  const slug = slugDaUrl(req);
  const corpo = await corpoJson<CorpoTriagem>(req);

  if (corpo.mode !== undefined) {
    if (corpo.mode !== "confirm" && corpo.mode !== "autonomous") {
      throw new ErroApi("invalid_request", 'mode deve ser "confirm" ou "autonomous"');
    }
    await dsSetAutonomo(slug, corpo.mode === "autonomous");
  }
  if (corpo.muted !== undefined) await dsSetMuted(slug, corpo.muted === true);
  if (corpo.resolvedAt !== undefined) await dsSetResolved(slug, corpo.resolvedAt);
  if (corpo.note !== undefined) await dsSetNote(slug, corpo.note);
  if (corpo.tags !== undefined) {
    if (!Array.isArray(corpo.tags)) throw new ErroApi("invalid_request", "tags deve ser lista");
    await dsSetEtiquetas(slug, corpo.tags.map(String));
  }

  const triagem = await dsTriage();
  return respostaOk({
    slug,
    triage: {
      mode: triagem.autonomo?.[slug] === true ? "autonomous" : "confirm",
      muted: triagem.muted?.[slug] === true,
      resolvedAt: triagem.resolved?.[slug] ?? null,
      note: triagem.notes?.[slug] ?? null,
      tags: triagem.etiquetas?.[slug] ?? [],
    },
  });
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
