import { NextResponse } from "next/server";
import {
  criarColuna,
  excluirColuna,
  moverCartao,
  recolherColuna,
  renomearColuna,
} from "@/lib/kanban";
import { readKanban, writeKanban } from "@/lib/kanban-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readKanban());
}

interface Acao {
  acao: "mover" | "criar" | "renomear" | "excluir" | "recolher";
  slug?: string;
  colunaId?: string;
  nome?: string;
  recolhida?: boolean;
}

export async function POST(req: Request) {
  let a: Acao;
  try {
    a = (await req.json()) as Acao;
  } catch {
    return NextResponse.json({ ok: false, error: "corpo inválido" }, { status: 400 });
  }

  let state = await readKanban();
  switch (a.acao) {
    case "mover":
      if (!a.slug || !a.colunaId) break;
      state = moverCartao(state, a.slug, a.colunaId);
      break;
    case "criar":
      if (!a.nome) break;
      state = criarColuna(state, a.nome);
      break;
    case "renomear":
      if (!a.colunaId || !a.nome) break;
      state = renomearColuna(state, a.colunaId, a.nome);
      break;
    case "excluir":
      if (!a.colunaId) break;
      state = excluirColuna(state, a.colunaId);
      break;
    case "recolher":
      if (!a.colunaId) break;
      state = recolherColuna(state, a.colunaId, a.recolhida ?? true);
      break;
    default:
      return NextResponse.json({ ok: false, error: "ação desconhecida" }, { status: 400 });
  }
  await writeKanban(state);
  return NextResponse.json({ ok: true, state });
}
