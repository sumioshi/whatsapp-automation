import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { limparCache } from "@/lib/google/calendario";
import {
  CAMINHO_CALLBACK,
  STATE_COOKIE,
  configOAuth,
  emailDoIdToken,
  escoposSuficientes,
  origemPublica,
  revogar,
  stateValido,
  trocarCodigo,
} from "@/lib/google/oauth";
import { gravarToken } from "@/lib/google/token-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Volta do Google: confere o `state`, troca o código pelo token e guarda no volume. */
export async function GET(req: Request) {
  const origem = origemPublica(req.headers);
  const voltar = (query: string) => {
    const res = NextResponse.redirect(new URL(`/agenda?${query}`, origem));
    res.cookies.set(STATE_COOKIE, "", { path: "/api/google", maxAge: 0 });
    return res;
  };
  const cfg = configOAuth();
  if (!cfg) return voltar("erro=nao_configurado");
  const url = new URL(req.url);
  const cookie = (await cookies()).get(STATE_COOKIE)?.value;
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code || !stateValido(url.searchParams.get("state"), cookie)) {
    return voltar("erro=conexao");
  }
  try {
    const t = await trocarCodigo(cfg, `${origem}${CAMINHO_CALLBACK}`, code);
    if (!t.refresh_token) return voltar("erro=conexao");
    if (!escoposSuficientes(t.scope)) {
      await revogar(t.refresh_token);
      return voltar("erro=permissao");
    }
    await gravarToken({
      refresh_token: t.refresh_token,
      access_token: t.access_token,
      expira_em: Date.now() + t.expires_in * 1000,
      email: emailDoIdToken(t.id_token),
      escopos: (t.scope ?? "").split(" ").filter(Boolean),
    });
    limparCache();
    return voltar("conectado=1");
  } catch {
    return voltar("erro=conexao");
  }
}
