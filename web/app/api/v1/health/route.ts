import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { preflight, respostaOk, rota } from "@/lib/api-v1";
import { STATUS_FILE } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Estado da conexão com o WhatsApp. Serve de teste de credencial também. */
export const GET = rota("read", async () => {
  let status: Record<string, unknown> = {};
  try {
    status = JSON.parse(await readFile(STATUS_FILE, "utf8")) as Record<string, unknown>;
  } catch {
    status = { connection: "unknown" };
  }
  return respostaOk({
    connection: status.connection ?? "unknown",
    watchedCount: status.watchedCount ?? null,
    updatedAt: status.updatedAt ?? null,
    version: "v1",
  });
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
