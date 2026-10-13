import { NextResponse } from "next/server";
import { credenciaisDoDono } from "@/lib/equipe/autenticar";
import { comCodigos, configDoEnvio, emailDoCodigo, enviarPeloResend, novoCodigo, registrarCodigo } from "@/lib/equipe/codigo-email";
import { ehEmailDoDono, emailsDoDono, emailValido, pedidoDoProprioSite } from "@/lib/equipe/login-externo";
import { chaveDeSessao } from "@/lib/equipe/sessao";
import { pausa } from "../sessao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pede um código por e-mail. A resposta é a mesma para e-mail com e sem acesso
 * (com a mesma demora), para a tela não revelar quem pode entrar.
 */
export async function POST(req: Request) {
  if (!pedidoDoProprioSite(req.headers)) return NextResponse.json({ ok: false, error: "pedido recusado" }, { status: 403 });
  const envio = configDoEnvio();
  const chave = chaveDeSessao();
  if (!envio || !credenciaisDoDono() || !chave || emailsDoDono().length === 0) {
    return NextResponse.json({ ok: false, error: "a entrada por código não está configurada neste painel" }, { status: 503 });
  }
  type Corpo = { email?: unknown } | null;
  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ ok: false, error: "corpo inválido" }, { status: 400 });
  }
  const email = typeof corpo?.email === "string" ? corpo.email.trim().toLowerCase() : "";
  if (!emailValido(email)) return NextResponse.json({ ok: false, error: "digite um e-mail válido" }, { status: 400 });

  if (!ehEmailDoDono(email)) {
    await pausa(700 + Math.floor(Math.random() * 400));
    return NextResponse.json({ ok: true });
  }

  const codigo = novoCodigo();
  const registrado = await comCodigos((estado) => {
    const r = registrarCodigo(estado, email, codigo, Date.now(), chave);
    return { estado: r.estado, resultado: r };
  });
  if (!registrado.ok) {
    const error =
      registrado.motivo === "bloqueado"
        ? "muitas tentativas erradas com esse e-mail; entre com o Google ou com a senha, ou tente de novo amanhã"
        : "muitos códigos pedidos; espere alguns minutos e tente de novo";
    return NextResponse.json({ ok: false, error }, { status: 429 });
  }
  if (!(await enviarPeloResend(emailDoCodigo(codigo, envio.remetente, email), envio.apiKey))) {
    return NextResponse.json({ ok: false, error: "não foi possível mandar o e-mail agora; tente de novo" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
