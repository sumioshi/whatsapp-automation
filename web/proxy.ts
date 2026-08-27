import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Autenticação do painel (páginas + rotas /api). Ativa SÓ quando PANEL_USER e
 * PANEL_PASS estão definidas (na nuvem). Sem elas (dev local no Mac) o painel
 * fica liberado, como hoje.
 *
 * Dois jeitos de entrar, com o mesmo par de credenciais:
 *  - **Cookie de sessão** (navegador): emitido pelo /login, HttpOnly, 30 dias.
 *    Navegador sem sessão é REDIRECIONADO pra /login — nada de popup nativo
 *    de Basic Auth, que gerenciador de senha não preenche.
 *  - **Basic Auth por header** (clientes programáticos): MCP remoto, sync,
 *    SSE do plantão e integrações seguem mandando Authorization como sempre.
 *
 * Next.js 16 renomeou a convenção `middleware` → `proxy` (arquivo proxy.ts,
 * função `proxy`). O matcher em `config` segue idêntico.
 */
export async function proxy(req: NextRequest) {
  const user = process.env.PANEL_USER;
  const pass = process.env.PANEL_PASS;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    // atob é seguro no edge/middleware; credenciais são ASCII.
    const decoded = atob(encoded);
    const idx = decoded.indexOf(":");
    if (decoded.slice(0, idx) === user && decoded.slice(idx + 1) === pass) {
      return NextResponse.next();
    }
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  if (cookie && (await verifySession(cookie, user, pass))) {
    return NextResponse.next();
  }

  // Navegação de página (documento) → tela de login, preservando o destino.
  if (req.headers.get("sec-fetch-dest") === "document") {
    const login = new URL("/login", req.url);
    const dest = req.nextUrl.pathname + req.nextUrl.search;
    if (dest !== "/") login.searchParams.set("next", dest);
    return NextResponse.redirect(login);
  }

  // Demais requisições (fetch/API) sem credencial: 401 seco, sem o header
  // WWW-Authenticate — é ele que dispara o popup nativo do navegador.
  return new NextResponse("Autenticação necessária.", { status: 401 });
}

export const config = {
  // protege tudo, menos: assets estáticos do Next, favicon, o proxy da API de
  // controle e a API pública v1 (as duas têm auth própria por Bearer) e o
  // próprio fluxo de login.
  // manifest e ícones ficam públicos: o fetch do manifest é SEM cookies
  // (padrão dos navegadores) e sem ele o "Instalar app" não aparece.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/control|api/v1|api/login|login|manifest.webmanifest|icon-192.png|icon-512.png|apple-touch-icon.png).*)",
  ],
};
