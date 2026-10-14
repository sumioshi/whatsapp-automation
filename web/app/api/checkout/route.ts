import { NextResponse } from "next/server";
import { criarSessaoCheckoutDodo, ehPlanoBalcao, PLANOS_BALCAO } from "@/lib/dodo-checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/checkout?plano=solo|pro|scale[&json=1]
 * Cria uma sessão de checkout no Dodo Payments para o plano escolhido e
 * redireciona (303) direto para o checkout. Com `json=1`, devolve o JSON.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const planoParam = url.searchParams.get("plano");

  if (!ehPlanoBalcao(planoParam)) {
    return NextResponse.json(
      { error: "Plano inválido. Use solo, pro ou scale.", planos: PLANOS_BALCAO },
      { status: 400 },
    );
  }

  try {
    const sessao = await criarSessaoCheckoutDodo(planoParam, url.origin);
    if (url.searchParams.get("json") === "1") {
      return NextResponse.json(sessao);
    }
    return NextResponse.redirect(sessao.checkoutUrl, 303);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao iniciar checkout";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
