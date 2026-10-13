import { NextResponse } from "next/server";
import { credenciaisDoDono } from "@/lib/equipe/autenticar";
import { caminhoInterno } from "@/lib/equipe/destino-login";
import { emailsDoDono } from "@/lib/equipe/login-externo";
import { CAMINHO_CALLBACK_LOGIN, COOKIE_DESTINO_LOGIN, COOKIE_STATE_LOGIN, urlDeLoginGoogle } from "@/lib/equipe/login-google";
import { chaveDeSessao } from "@/lib/equipe/sessao";
import { configOAuth, novoState, origemPublica, STATE_VALIDADE_S } from "@/lib/google/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Começa o "Entrar com Google": guarda o state e o destino em cookies curtos e vai pro Google. */
export async function GET(req: Request) {
  const origem = origemPublica(req.headers);
  const cfg = configOAuth();
  if (!cfg || emailsDoDono().length === 0 || !credenciaisDoDono() || !chaveDeSessao()) {
    return NextResponse.redirect(new URL("/login?erro=google_indisponivel", origem));
  }
  const destino = caminhoInterno(new URL(req.url).searchParams.get("next"));
  const state = novoState();
  const res = NextResponse.redirect(urlDeLoginGoogle(cfg, `${origem}${CAMINHO_CALLBACK_LOGIN}`, state));
  const opcoes = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/login/google",
    maxAge: STATE_VALIDADE_S,
  };
  res.cookies.set(COOKIE_STATE_LOGIN, state, opcoes);
  res.cookies.set(COOKIE_DESTINO_LOGIN, destino, opcoes);
  return res;
}
