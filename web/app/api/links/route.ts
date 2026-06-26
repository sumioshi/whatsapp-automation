import { NextResponse } from "next/server";
import { listGroups } from "@/lib/data";
import {
  type LinkEntry,
  type LinkTipo,
  readLinks,
  removeLink,
  writeClientFiles,
  writeLink,
} from "@/lib/links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Links indexados + todos os chats coletados (grupos E DMs) pro dropdown da tela.
 * Usa listGroups() — readGroupsWithTags() só traria grupos, e um link pode ser
 * pra um DM (ex: o contato do cliente).
 */
export async function GET() {
  const [links, chats] = await Promise.all([readLinks(), listGroups()]);
  const opcoes = chats.map((c) => ({
    slug: c.slug,
    name: c.name,
    messageCount: c.messageCount,
    tipo: c.slug.startsWith("dm-") ? ("dm" as const) : ("grupo" as const),
  }));
  return NextResponse.json({ links, chats: opcoes });
}

interface PostBody {
  slug?: string;
  repoPath?: string;
  cliente?: string;
  tipo?: string;
  notas?: string;
}

const TIPOS: LinkTipo[] = ["grupo", "dm", "projeto"];

export async function POST(req: Request) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const slug = body.slug?.trim();
  const repoPath = body.repoPath?.trim();
  if (!slug) return NextResponse.json({ error: "slug ausente" }, { status: 400 });
  if (!repoPath) return NextResponse.json({ error: "repoPath ausente" }, { status: 400 });

  const entry: LinkEntry = {
    repoPath,
    cliente: body.cliente?.trim() ?? "",
    tipo: TIPOS.includes(body.tipo as LinkTipo) ? (body.tipo as LinkTipo) : "projeto",
    notas: body.notas?.trim() ?? "",
  };

  try {
    // Escreve o lado do repo primeiro: se o repoPath for inválido, falha ANTES
    // de sujar o índice central.
    await writeClientFiles(slug, entry);
    await writeLink(slug, entry);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao gravar o link" },
      { status: 400 },
    );
  }

  return NextResponse.json({ links: await readLinks() });
}

export async function DELETE(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug")?.trim();
  if (!slug) return NextResponse.json({ error: "slug ausente" }, { status: 400 });
  await removeLink(slug);
  return NextResponse.json({ links: await readLinks() });
}
