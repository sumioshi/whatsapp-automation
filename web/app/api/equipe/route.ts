import { NextResponse } from "next/server";
import { listGroups } from "@/lib/data";
import { type Comando, executar } from "@/lib/equipe/admin";
import { lerUsuarios, publico } from "@/lib/equipe/usuarios";
import { readTriage } from "@/lib/triage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Contas (sem senha) + chats e etiquetas pra montar a tela de permissões. */
export async function GET() {
  const [usuarios, grupos, triage] = await Promise.all([lerUsuarios(), listGroups(), readTriage()]);
  return NextResponse.json({
    usuarios: usuarios.map(publico),
    chats: grupos.map((g) => ({ slug: g.slug, nome: g.name, etiquetas: triage.etiquetas[g.slug] ?? [] })),
  });
}

export async function POST(req: Request) {
  let c: Comando;
  try {
    c = (await req.json()) as Comando;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  try {
    const r = await executar(c, process.env.PANEL_USER ?? "");
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 400 });
  }
}
