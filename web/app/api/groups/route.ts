import { NextResponse } from "next/server";
import { readGroupsWithTags, setGroupTags, setManyWatch } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readGroupsWithTags());
}

interface Body {
  id?: string;
  ids?: string[];
  watch?: boolean;
  tags?: string[];
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Tags de um grupo
  if (typeof body.id === "string" && Array.isArray(body.tags)) {
    return NextResponse.json(await setGroupTags(body.id, body.tags));
  }

  // Watch em lote ou individual
  if (typeof body.watch === "boolean") {
    const ids = body.ids ?? (body.id ? [body.id] : []);
    if (ids.length === 0) {
      return NextResponse.json({ error: "id/ids ausente" }, { status: 400 });
    }
    return NextResponse.json(await setManyWatch(ids, body.watch));
  }

  return NextResponse.json({ error: "payload inválido" }, { status: 400 });
}
