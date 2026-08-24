import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, sessionToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pausa fixa em falha — desanima força bruta sem precisar de estado. */
const FAIL_DELAY_MS = 800;

export async function POST(req: Request) {
  const user = process.env.PANEL_USER;
  const pass = process.env.PANEL_PASS;
  // Sem credenciais configuradas (dev local) o painel já é aberto — nada a fazer.
  if (!user || !pass) return NextResponse.json({ ok: true });

  let given: { user?: string; pass?: string };
  try {
    given = (await req.json()) as { user?: string; pass?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "corpo inválido" }, { status: 400 });
  }

  if (given.user !== user || given.pass !== pass) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return NextResponse.json({ ok: false, error: "usuário ou senha incorretos" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(user, pass), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
