import { NextResponse } from "next/server";
import { buildContacts } from "@/lib/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const c = await buildContacts();
  return NextResponse.json({
    names: [...c.names.entries()],
    ownIds: [...c.ownIds],
    teamIds: [...c.teamIds],
    phones: [...c.phones.entries()],
    lids: [...c.lids],
    hasSidecar: c.hasSidecar,
  });
}
