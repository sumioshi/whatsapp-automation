import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

interface ProfileBody {
  name?: string;
  status?: string;
  picturePath?: string;
}

async function fwd(rota: string, body: unknown): Promise<void> {
  const res = await fetch(`${CONTROL_URL}${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? `falha em ${rota}`);
}

export async function POST(req: Request) {
  const { name, status, picturePath } = (await req.json()) as ProfileBody;
  if (!name && !status && !picturePath) {
    return NextResponse.json({ error: "nada para editar" }, { status: 400 });
  }
  try {
    if (name) await fwd("/profile/name", { name });
    if (status) await fwd("/profile/status", { status });
    if (picturePath) await fwd("/profile/picture", { path: picturePath });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
