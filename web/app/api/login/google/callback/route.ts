import { type NextRequest, NextResponse } from "next/server";
import { credenciaisDoDono } from "@/lib/equipe/autenticar";
import { caminhoInterno } from "@/lib/equipe/destino-login";
import { ehEmailDoDono } from "@/lib/equipe/login-externo";
import {
  CAMINHO_CALLBACK_LOGIN,
  COOKIE_DESTINO_LOGIN,
  COOKIE_STATE_LOGIN,
  emailDoCodigoGoogle,
} from "@/lib/equipe/login-google";
import { chaveDeSessao, novaSessao } from "@/lib/equipe/sessao";
import { configOAuth, origemPublica, stateValido } from "@/lib/google/oauth";
import { comCookieDeSessao } from "../../sessao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Volta do Google: confere o state, troca o código pelo e-mail verificado e, se for do dono, abre a sessão. */
export async function GET(req: NextRequest) {
  const origem = origemPublica(req.headers);
  const params = req.nextUrl.searchParams;
  const limpar = (res: NextResponse) => {
    res.cookies.set(COOKIE_STATE_LOGIN, "", { path: "/api/login/google", maxAge: 0 });
    res.cookies.set(COOKIE_DESTINO_LOGIN, "", { path: "/api/login/google", maxAge: 0 });
    return res;
  };
  const falha = (erro: string) => limpar(NextResponse.redirect(new URL(`/login?erro=${erro}`, origem)));

  if (params.get("error")) return falha("google_cancelado");
  const cfg = configOAuth();
  const cred = credenciaisDoDono();
  const chave = chaveDeSessao();
  if (!cfg || !cred || !chave) return falha("google_indisponivel");
  if (!stateValido(params.get("state"), req.cookies.get(COOKIE_STATE_LOGIN)?.value)) return falha("google_falhou");
  const code = params.get("code");
  if (!code) return falha("google_falhou");

  const email = await emailDoCodigoGoogle(cfg, code, `${origem}${CAMINHO_CALLBACK_LOGIN}`);
  if (!email) return falha("google_falhou");
  if (!ehEmailDoDono(email)) return falha("google_sem_acesso");

  const destino = caminhoInterno(req.cookies.get(COOKIE_DESTINO_LOGIN)?.value);
  return comCookieDeSessao(limpar(NextResponse.redirect(new URL(destino, origem))), novaSessao(cred.user, "dono", 0), chave);
}
