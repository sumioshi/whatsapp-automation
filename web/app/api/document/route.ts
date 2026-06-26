import { NextResponse } from "next/server";
import { extractDocumentText } from "@/lib/documents";

export const runtime = "nodejs";

interface Body {
  mediaPath?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!body.mediaPath) {
    return NextResponse.json({ error: "mediaPath é obrigatório" }, { status: 400 });
  }

  try {
    const doc = await extractDocumentText(body.mediaPath);
    return NextResponse.json(doc);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao ler documento" },
      { status: 500 },
    );
  }
}
