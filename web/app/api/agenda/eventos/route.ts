import { NextResponse } from "next/server";
import { apagarEvento, criarEvento, editarEvento, listarEventos } from "@/lib/google/calendario";
import { type EntradaEvento, ErroAgenda, entradaDeJson } from "@/lib/google/evento";
import { respostaDeErroAgenda } from "@/lib/google/resposta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function erro(e: unknown) {
  const { status, corpo } = respostaDeErroAgenda(e);
  return NextResponse.json(corpo, { status });
}

async function corpoJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ErroAgenda("entrada_invalida", "JSON inválido");
  }
}

/** Eventos de uma janela (`de`/`ate`), opcionalmente só de algumas agendas. */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const de = q.get("de");
    const ate = q.get("ate");
    if (!de || !ate) throw new ErroAgenda("entrada_invalida", "de e ate são obrigatórios");
    const agendas = q
      .get("agendas")
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return NextResponse.json(await listarEventos(de, ate, agendas));
  } catch (e) {
    return erro(e);
  }
}

export async function POST(req: Request) {
  try {
    const evento = await criarEvento(entradaDeJson(await corpoJson(req)) as EntradaEvento);
    return NextResponse.json({ evento }, { status: 201 });
  } catch (e) {
    return erro(e);
  }
}

/** Edição: `{ agenda, id, ...campos }` no corpo (id de agenda tem `#` e `@`, fora do caminho). */
export async function PATCH(req: Request) {
  try {
    const json = await corpoJson(req);
    const id = (json as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !id) throw new ErroAgenda("entrada_invalida", "id obrigatório");
    const { agenda, ...patch } = entradaDeJson(json);
    if (!agenda) throw new ErroAgenda("entrada_invalida", "agenda obrigatória");
    return NextResponse.json({ evento: await editarEvento(agenda, id, patch) });
  } catch (e) {
    return erro(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const agenda = q.get("agenda");
    const id = q.get("id");
    if (!agenda || !id) throw new ErroAgenda("entrada_invalida", "agenda e id são obrigatórios");
    await apagarEvento(agenda, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erro(e);
  }
}
