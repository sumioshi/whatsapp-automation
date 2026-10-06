import { NextResponse } from "next/server";
import { credenciaisDoDono, igualSeguro } from "@/lib/equipe/autenticar";
import { verificarSenha } from "@/lib/equipe/senha";
import { assinarSessao, chaveDeSessao, novaSessao, SESSION_COOKIE, VALIDADE_S, type Papel } from "@/lib/equipe/sessao";
import { alterarUsuarios, acharUsuario } from "@/lib/equipe/usuarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pausa fixa em falha — desanima força bruta sem precisar de estado. */
const FAIL_DELAY_MS = 800;
/** Senha maior que isso é falha direta, sem gastar scrypt. */
const SENHA_MAX = 256;

/** Destino depois de entrar: atendente só vai pra dentro da própria área. */
function destino(papel: Papel, next: unknown): string {
  const n = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (papel === "dono") return n;
  return n === "/atendimento" || n.startsWith("/atendimento/") ? n : "/atendimento";
}

export async function POST(req: Request) {
  const cred = credenciaisDoDono();
  const chave = chaveDeSessao();
  // Sem credenciais configuradas (dev local) o painel já é aberto — nada a fazer.
  if (!cred || !chave) return NextResponse.json({ ok: true, destino: "/" });

  let given: { user?: string; pass?: string; next?: string };
  try {
    given = (await req.json()) as typeof given;
  } catch {
    return NextResponse.json({ ok: false, error: "corpo inválido" }, { status: 400 });
  }
  const user = (given.user ?? "").trim();
  const pass = given.pass ?? "";

  let sessao: ReturnType<typeof novaSessao> | null = null;
  if (pass.length <= SENHA_MAX) {
    if (igualSeguro(user, cred.user) && igualSeguro(pass, cred.pass)) {
      sessao = novaSessao(cred.user, "dono", 0);
    } else {
      const login = user.toLowerCase();
      const u = await acharUsuario(login);
      if (u?.ativo && (await verificarSenha(pass, u.senha))) {
        sessao = novaSessao(u.login, "atendente", u.versao);
        const agora = new Date().toISOString();
        try {
          await alterarUsuarios((lista) => {
            const alvo = lista.find((x) => x.login === u.login);
            if (alvo) alvo.ultimoAcesso = agora;
          });
        } catch {
          // Registrar o último acesso nunca bloqueia um login válido.
        }
      }
    }
  }

  if (!sessao) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return NextResponse.json({ ok: false, error: "usuário ou senha incorretos" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, destino: destino(sessao.p, given.next) });
  res.cookies.set(SESSION_COOKIE, assinarSessao(sessao, chave), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VALIDADE_S[sessao.p],
  });
  return res;
}
