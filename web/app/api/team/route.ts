import { NextResponse } from "next/server";
import { readTeam, setTeam } from "@/lib/config";
import { buildContacts, roleOf } from "@/lib/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function listContacts() {
  const c = await buildContacts();
  return [...c.names.entries()]
    .map(([id, name]) => ({ id, name, role: roleOf(c, id) }))
    .filter((x) => x.role !== "me")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET() {
  return NextResponse.json(await listContacts());
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

  const current = new Set(await readTeam());
  if (body.team) current.add(body.id);
  else current.delete(body.id);
  await setTeam([...current]);

  return NextResponse.json(await listContacts());
}
