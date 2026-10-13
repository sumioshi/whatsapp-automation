import { NextResponse } from "next/server";
import { readTeam, setTeam } from "@/lib/config";
import { buildContacts, pessoasDoTime, timeAlternado } from "@/lib/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(pessoasDoTime(await buildContacts()));
}

export async function POST(req: Request) {
  let body: { id?: string; team?: boolean };
  try {
    body = (await req.json()) as { id?: string; team?: boolean };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (typeof body.id !== "string" || typeof body.team !== "boolean") {
    return NextResponse.json({ error: "id/team inválido" }, { status: 400 });
  }

  // Marca ou desmarca a pessoa inteira: o LID e o telefone dela.
  await setTeam(timeAlternado(await buildContacts(), await readTeam(), body.id, body.team));

  return NextResponse.json(pessoasDoTime(await buildContacts()));
}
