import { NextResponse } from "next/server";
import { readAgentSeen, setAgentSeenMany } from "@/lib/agent-seen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readAgentSeen());
}

export async function POST(req: Request) {
  const { updates } = (await req.json()) as { updates?: Record<string, string> };
  await setAgentSeenMany(updates ?? {});
  return NextResponse.json({ ok: true });
}
