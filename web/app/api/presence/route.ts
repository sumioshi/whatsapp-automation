import { NextResponse } from "next/server";
import { readPresence } from "@/lib/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE = /^[A-Za-z0-9._-]+$/;

/**
 * Presença ATUAL de uma conversa: { status, lastSeen }.
 *   status: "typing" | "recording" | "online" | "offline" | null
 *   lastSeen: ms epoch | null  (só em offline, quando o contato expõe)
 * `presence: null` = sem sinal de presença (sidecar ausente/expirado). Sempre 200.
 */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug || !SAFE.test(slug)) {
    return NextResponse.json({ error: "slug inválido" }, { status: 400 });
  }
  const presence = await readPresence(slug);
  return NextResponse.json({ presence });
}
