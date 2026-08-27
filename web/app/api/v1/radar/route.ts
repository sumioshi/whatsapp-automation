import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { preflight, respostaOk, rota } from "@/lib/api-v1";
import { DATA_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quem está aguardando resposta, segundo o radar de sem-resposta do coletor. */
export const GET = rota("read", async () => {
  let status: Record<string, unknown> = {};
  try {
    status = JSON.parse(
      await readFile(join(DATA_DIR, ".radar-status.json"), "utf8"),
    ) as Record<string, unknown>;
  } catch {
    return respostaOk({ pending: [], lastRun: null, config: null });
  }
  return respostaOk({
    pending: status.pendencias ?? [],
    lastRun: status.ultimaExecucao ?? null,
    nextRun: status.proximaExecucao ?? null,
    config: status.config ?? null,
  });
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
