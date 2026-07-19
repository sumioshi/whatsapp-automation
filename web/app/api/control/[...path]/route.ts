import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

/**
 * Proxy autenticado por Bearer token para a API de controle (127.0.0.1:4310),
 * pensado pra integrações externas (ex.: Radar) na nuvem — onde só o painel
 * tem porta pública. Exige CONTROL_TOKEN definido; sem a env, a rota nega tudo
 * (fail closed). O Basic Auth do painel não se aplica aqui (ver web/proxy.ts);
 * a autenticação desta rota é exclusivamente o Bearer.
 *
 * Só repassa rotas de leitura/envio simples. `send-media-url` baixa a mídia de
 * uma URL (o `/send-media` cru, que aceita path de arquivo local, NÃO é exposto).
 * `messages/<slug>` lê uma conversa (prefixo, o slug é o último segmento).
 */
const ALLOWED = new Set([
  "health",
  "check-number",
  "send",
  "send-media-url",
  "react",
  "edit",
]);

async function proxy(req: Request, path: string[]): Promise<NextResponse> {
  const token = process.env.CONTROL_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "CONTROL_TOKEN não configurado no servidor" },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const route = path.join("/");
  if (!ALLOWED.has(route) && !route.startsWith("messages/")) {
    return NextResponse.json({ error: "rota não permitida" }, { status: 404 });
  }

  const upstream = await fetch(`${CONTROL_URL}/${route}`, {
    method: req.method,
    headers: { "content-type": "application/json" },
    body: req.method === "GET" ? undefined : await req.text(),
  });
  const body = (await upstream.json().catch(() => ({ error: "resposta inválida" }))) as unknown;
  return NextResponse.json(body, { status: upstream.status });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}
