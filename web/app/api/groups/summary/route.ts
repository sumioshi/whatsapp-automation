import { NextResponse } from "next/server";
import { listGroups } from "@/lib/data";
import { readGroupsConfig } from "@/lib/config";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const groups = await listGroups();
  const config = await readGroupsConfig().catch(() => []);
  const jidPorSlug = new Map(config.map((g) => [slugify(g.name), g.id]));
  return NextResponse.json(groups.map((g) => ({ ...g, jid: jidPorSlug.get(g.slug) ?? null })));
}
