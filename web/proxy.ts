import { type NextRequest, NextResponse } from "next/server";

/**
 * Basic Auth no painel inteiro (páginas + rotas /api). Ativa SÓ quando PANEL_USER
 * e PANEL_PASS estão definidas (na nuvem). Sem elas (dev local no Mac) o painel
 * fica liberado, como hoje. Atrás do HTTPS do Railway, Basic Auth é seguro o
 * suficiente pra um usuário.
 *
 * Next.js 16 renomeou a convenção `middleware` → `proxy` (arquivo proxy.ts,
 * função `proxy`). O matcher em `config` segue idêntico.
 */
export function proxy(req: NextRequest) {
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
  return new NextResponse("Autenticação necessária.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="WhatsApp Painel", charset="UTF-8"' },
  });
}

export const config = {
  // protege tudo, menos os assets estáticos do Next e o favicon
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
