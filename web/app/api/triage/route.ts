import { NextResponse } from "next/server";
import { readTriage, setAlert, setCopilot, setLastSeen, setMuted, setNote, setResolved } from "@/lib/triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readTriage());
}

interface TriagePost {
  action?: "resolved" | "muted" | "note" | "lastSeen" | "copilot" | "alertar";
  slug?: string;
  value?: string | boolean;
}

export async function POST(req: Request) {
  let body: TriagePost;
  try {
    body = (await req.json()) as TriagePost;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { action, slug, value } = body;
  if (typeof slug !== "string" || !slug) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }

  switch (action) {
    case "resolved":
      if (typeof value !== "string") {
        return NextResponse.json({ error: "value deve ser string" }, { status: 400 });
      }
      await setResolved(slug, value);
      break;
    case "muted":
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: "value deve ser boolean" }, { status: 400 });
      }
      await setMuted(slug, value);
      break;
    case "copilot":
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: "value deve ser boolean" }, { status: 400 });
      }
      await setCopilot(slug, value);
      break;
    case "alertar":
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: "value deve ser boolean" }, { status: 400 });
      }
      await setAlert(slug, value);
      break;
    case "note":
      if (typeof value !== "string") {
        return NextResponse.json({ error: "value deve ser string" }, { status: 400 });
      }
      await setNote(slug, value);
      break;
    case "lastSeen":
      if (typeof value !== "string") {
        return NextResponse.json({ error: "value deve ser string" }, { status: 400 });
      }
      await setLastSeen(slug, value);
      break;
    default:
      return NextResponse.json({ error: "action inválida" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
