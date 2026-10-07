import { NextResponse } from "next/server";
import {
  CAMINHO_CALLBACK,
  STATE_COOKIE,
  STATE_VALIDADE_S,
  configOAuth,
  novoState,
  origemPublica,
  urlDeAutorizacao,
} from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Começa o login no Google: grava o `state` num cookie curto e redireciona. */
export async function GET(req: Request) {
  const origem = origemPublica(req.headers);
  const cfg = configOAuth();
  if (!cfg) return NextResponse.redirect(new URL("/agenda?erro=nao_configurado", origem));
  const state = novoState();
  const res = NextResponse.redirect(urlDeAutorizacao(cfg, `${origem}${CAMINHO_CALLBACK}`, state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google",
    maxAge: STATE_VALIDADE_S,
  });
  return res;
}
