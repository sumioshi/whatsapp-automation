import { type NextRequest, NextResponse } from "next/server";
import { credenciaisDoDono, quemDoPedido, SESSION_COOKIE } from "@/lib/equipe/autenticar";
import { decidir, ehNavegacao } from "@/lib/equipe/politica";

/**
 * Autenticação e autorização do painel. Ativa SÓ quando PANEL_USER e
 * PANEL_PASS estão definidas (na nuvem); sem elas (dev local) fica aberto.
 *
 * Quem entra:
 *  - dono: Basic Auth por header (MCP remoto, sync, plantão, CI) ou cookie de sessão;
 *  - atendente: cookie de sessão de uma conta ativa da equipe.
 *
 * Nega por padrão: o atendente só alcança a área de atendimento (ver
 * lib/equipe/politica). A identidade não viaja por header até as rotas: cada
 * rota ou página que precisa saber quem é revalida o cookie por conta própria.
 *
 * Roda no runtime Node (padrão do proxy no Next 16), por isso pode ler o
 * arquivo de contas.
 */
export async function proxy(req: NextRequest) {
  const cred = credenciaisDoDono();
  if (!cred) return NextResponse.next();

  const quem = await quemDoPedido(
    req.headers.get("authorization"),
    req.cookies.get(SESSION_COOKIE)?.value,
    cred,
  );
  const d = decidir(quem, req.nextUrl.pathname, ehNavegacao(req.headers, req.method));

  if (d.tipo === "login") {
    const login = new URL("/login", req.url);
    const dest = req.nextUrl.pathname + req.nextUrl.search;
    if (dest !== "/") login.searchParams.set("next", dest);
    return NextResponse.redirect(login);
  }
  if (d.tipo === "redirecionar") return NextResponse.redirect(new URL(d.para, req.url));
  if (d.tipo === "negar") {
    // Sem WWW-Authenticate: é ele que dispara o popup nativo do navegador.
    return new NextResponse(d.status === 401 ? "Autenticação necessária." : "Sem acesso.", {
      status: d.status,
    });
  }

  return NextResponse.next();
}

export const config = {
  // protege tudo, menos: assets estáticos do Next, favicon, o proxy da API de
  // controle e a API pública v1 (as duas têm auth própria por Bearer), o
  // fluxo de login (senha, Google e código: é por elas que a sessão nasce) e
  // de saída, o manifest e os ícones (o fetch do manifest é sem
  // cookies; sem ele o "Instalar app" não aparece) e a política de privacidade
  // (a tela de consentimento do Google exige link público).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/control(?:/|$)|api/v1(?:/|$)|api/login(?:/|$)|api/logout$|login$|privacidade$|landing(?:/|$)|landing-assets(?:/|$)|manifest.webmanifest|icon-192.png|icon-512.png|apple-touch-icon.png).*)",
  ],
};
