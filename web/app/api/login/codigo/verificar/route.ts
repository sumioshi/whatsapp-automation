import { NextResponse } from "next/server";
import { credenciaisDoDono } from "@/lib/equipe/autenticar";
import { comCodigos, conferirCodigo } from "@/lib/equipe/codigo-email";
import { caminhoInterno } from "@/lib/equipe/destino-login";
import { ehEmailDoDono, emailValido, pedidoDoProprioSite } from "@/lib/equipe/login-externo";
import { chaveDeSessao, novaSessao } from "@/lib/equipe/sessao";
import { comCookieDeSessao, pausa } from "../../sessao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAUSA_FALHA_MS = 800;
/** Uma frase só para toda falha: a resposta não diz se havia código pendente. */
const FALHOU = "código incorreto ou vencido; confira o e-mail ou peça um novo";
const BLOQUEADO = "muitas tentativas erradas; entre com o Google ou com a senha, ou tente de novo amanhã";

/** Confere o código do e-mail e, se bater, abre a sessão do dono. */
export async function POST(req: Request) {
  if (!pedidoDoProprioSite(req.headers)) return NextResponse.json({ ok: false, error: "pedido recusado" }, { status: 403 });
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

  // Só e-mail do dono chega ao estado dos códigos: qualquer outro texto nem é procurado
  // (e não grava nada), e quem deixou de ser dono não entra com código antigo.
  if (!emailValido(email) || !ehEmailDoDono(email)) {
    await pausa(PAUSA_FALHA_MS);
    return NextResponse.json({ ok: false, error: FALHOU }, { status: 401 });
  }
  const conferido = await comCodigos((estado) => {
    const r = conferirCodigo(estado, email, codigo, Date.now(), chave);
    return { estado: r.estado, resultado: r };
  });
  if (!conferido.ok) {
    await pausa(PAUSA_FALHA_MS);
    return NextResponse.json({ ok: false, error: conferido.motivo === "bloqueado" ? BLOQUEADO : FALHOU }, { status: 401 });
  }
  return comCookieDeSessao(
    NextResponse.json({ ok: true, destino: caminhoInterno(corpo?.next) }),
    novaSessao(cred.user, "dono", 0),
    chave,
  );
}
