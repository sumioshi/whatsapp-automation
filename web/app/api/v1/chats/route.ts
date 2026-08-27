import { NextResponse } from "next/server";
import { preflight, respostaOk, rota } from "@/lib/api-v1";
import { readGroupsConfig } from "@/lib/config";
import { listGroups } from "@/lib/data";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMITE_PADRAO = 100;
const LIMITE_MAX = 500;

/**
 * Lista os chats. Paginação por deslocamento simples (`offset`): a lista é
 * pequena e reordena por atividade, então cursor por id não ajudaria aqui.
 */
export const GET = rota("read", async ({ req }) => {
  const url = new URL(req.url);
  const busca = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const cru = Number(url.searchParams.get("limit"));
  const limite = Number.isFinite(cru) && cru > 0 ? Math.min(cru, LIMITE_MAX) : LIMITE_PADRAO;
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const grupos = await listGroups();
  const config = await readGroupsConfig().catch(() => []);
  const jidPorSlug = new Map(config.map((g) => [g.slug ?? slugify(g.name), g.id]));

  const filtrados = busca
    ? grupos.filter((g) => g.name.toLowerCase().includes(busca) || g.slug.includes(busca))
    : grupos;

  const pagina = filtrados.slice(offset, offset + limite);
  return respostaOk(
    pagina.map((g) => ({
      slug: g.slug,
      name: g.name,
      jid: jidPorSlug.get(g.slug) ?? null,
      messageCount: g.messageCount,
      lastTimestamp: g.lastTimestamp,
      lastPreview: g.lastPreview,
      avatarPath: g.avatarPath,
      unread: g.unread,
      pinned: g.pinned ?? false,
      muted: g.muted ?? false,
      archived: g.archived ?? false,
    })),
    {
      page: {
        next: offset + limite < filtrados.length ? String(offset + limite) : null,
        hasMore: offset + limite < filtrados.length,
      },
    },
  );
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
