import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

/** GET /api/entregas[?jid=|?ticket=] — estado das entregas humanizadas (proxy do control). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticket = url.searchParams.get("ticket");
  const jid = url.searchParams.get("jid");
  const alvo = ticket
    ? `/entregas/${encodeURIComponent(ticket)}`
    : jid
      ? `/entregas?jid=${encodeURIComponent(jid)}`
      : "/entregas";
  try {
    const res = await fetch(`${CONTROL_URL}${alvo}`);
    const data = (await res.json()) as unknown;
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Coletor offline." }, { status: 502 });
  }
}
