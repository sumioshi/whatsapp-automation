import { NextResponse } from "next/server";
import { montarDashboardAtual } from "@/lib/dashboard-atual";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dashboard dos grupos monitorados; a montagem (com cache de 60 s) mora em `lib/dashboard-atual`. */
export async function GET() {
  return NextResponse.json(await montarDashboardAtual());
}
