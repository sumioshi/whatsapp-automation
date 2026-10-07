import { NextResponse } from "next/server";
import { limparCache } from "@/lib/google/calendario";
import { revogar } from "@/lib/google/oauth";
import { apagarToken, lerToken } from "@/lib/google/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Revoga no Google (se ele responder) e apaga o token do volume. */
export async function POST() {
  const t = await lerToken();
  if (t) await revogar(t.refresh_token);
  await apagarToken();
  limparCache();
  return NextResponse.json({ ok: true });
}
