import { NextResponse } from "next/server";
import { credenciaisDoDono } from "@/lib/equipe/autenticar";
import { comCodigos, conferirCodigo } from "@/lib/equipe/codigo-email";
import { caminhoInterno } from "@/lib/equipe/destino-login";
import { ehEmailDoDono } from "@/lib/equipe/login-externo";
import { chaveDeSessao, novaSessao } from "@/lib/equipe/sessao";
import { comCookieDeSessao, pausa } from "../../sessao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAUSA_FALHA_MS = 800;
const MENSAGEM = {
  vencido: "o código venceu; peça um novo",
  tentativas: "muitas tentativas com esse código; peça um novo",
} as const;

/** Confere o código do e-mail e, se bater, abre a sessão do dono. */
export async function POST(req: Request) {
  const cred = credenciaisDoDono();
  const chave = chaveDeSessao();
  if (!cred || !chave) {
    return NextResponse.json({ ok: false, error: "a entrada por código não está configurada neste painel" }, { status: 503 });
  }
  type Corpo = { email?: unknown; codigo?: unknown; next?: unknown } | null;
  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ ok: false, error: "corpo inválido" }, { status: 400 });
  }
  const email = typeof corpo?.email === "string" ? corpo.email.trim().toLowerCase() : "";
  const codigo = typeof corpo?.codigo === "string" ? corpo.codigo : "";

  const conferido = await comCodigos((estado) => {
    const r = conferirCodigo(estado, email, codigo, Date.now(), chave);
    return { estado: r.estado, resultado: r };
  });
  // O e-mail precisa continuar sendo do dono na hora de entrar, não só na hora de pedir.
  if (!conferido.ok || !ehEmailDoDono(email)) {
    await pausa(PAUSA_FALHA_MS);
    const motivo = conferido.ok ? null : conferido.motivo;
    const error = motivo === "vencido" || motivo === "tentativas" ? MENSAGEM[motivo] : "código incorreto";
    return NextResponse.json({ ok: false, error }, { status: 401 });
  }
  return comCookieDeSessao(
    NextResponse.json({ ok: true, destino: caminhoInterno(corpo?.next) }),
    novaSessao(cred.user, "dono", 0),
    chave,
  );
}
