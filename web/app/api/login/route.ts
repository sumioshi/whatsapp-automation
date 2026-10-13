import { NextResponse } from "next/server";
import { caminhoInterno } from "@/lib/equipe/destino-login";
import { credenciaisDoDono, igualSeguro } from "@/lib/equipe/autenticar";
import { pedidoDoProprioSite } from "@/lib/equipe/login-externo";
import { hashSenha, verificarSenha } from "@/lib/equipe/senha";
import { chaveDeSessao, novaSessao, type Papel } from "@/lib/equipe/sessao";
import { alterarUsuarios, acharUsuario } from "@/lib/equipe/usuarios";
import { comCookieDeSessao } from "./sessao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pausa fixa em falha — desanima força bruta sem precisar de estado. */
const FAIL_DELAY_MS = 800;
/** Senha maior que isso é falha direta, sem gastar scrypt. */
const SENHA_MAX = 256;

/** Hash fixo pra gastar o mesmo tempo quando o login não existe. */
let hashFalso: Promise<string> | null = null;

/** Destino depois de entrar: atendente só vai pra dentro da própria área. */
function destino(papel: Papel, next: unknown): string {
  const n = caminhoInterno(next);
  if (papel === "dono") return n;
  return n === "/atendimento" || n.startsWith("/atendimento/") ? n : "/atendimento";
}

export async function POST(req: Request) {
  if (!pedidoDoProprioSite(req.headers)) return NextResponse.json({ ok: false, error: "pedido recusado" }, { status: 403 });
  const cred = credenciaisDoDono();
  const chave = chaveDeSessao();
  // Sem credenciais configuradas (dev local) o painel já é aberto — nada a fazer.
  if (!cred || !chave) return NextResponse.json({ ok: true, destino: "/" });

  let given: { user?: unknown; pass?: unknown; next?: unknown } | null;
  try {
    given = (await req.json()) as typeof given;
  } catch {
    return NextResponse.json({ ok: false, error: "corpo inválido" }, { status: 400 });
  }
  const valido = !!given && typeof given === "object" && typeof given.user === "string" && typeof given.pass === "string";
  const user = valido ? (given!.user as string).trim() : "";
  const pass = valido ? (given!.pass as string) : "";

  let sessao: ReturnType<typeof novaSessao> | null = null;
  if (valido && pass.length <= SENHA_MAX) {
    if (igualSeguro(user, cred.user) && igualSeguro(pass, cred.pass)) {
      sessao = novaSessao(cred.user, "dono", 0);
    } else {
      try {
        const u = await acharUsuario(user.toLowerCase());
        if (u?.ativo) {
          if (await verificarSenha(pass, u.senha)) {
            sessao = novaSessao(u.login, "atendente", u.versao);
          }
        } else {
          hashFalso ??= hashSenha("x");
          await verificarSenha(pass, await hashFalso);
        }
        if (sessao) {
          const agora = new Date().toISOString();
          try {
            await alterarUsuarios((lista) => {
              const alvo = lista.find((x) => x.login === u!.login);
              if (alvo) alvo.ultimoAcesso = agora;
            });
          } catch {
            // Registrar o último acesso nunca bloqueia um login válido.
          }
        }
      } catch {
        sessao = null;
      }
    }
  }

  if (!sessao) {
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS));
    return NextResponse.json({ ok: false, error: "usuário ou senha incorretos" }, { status: 401 });
  }

  return comCookieDeSessao(NextResponse.json({ ok: true, destino: destino(sessao.p, given?.next) }), sessao, chave);
}
