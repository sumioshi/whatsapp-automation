/**
 * Registro das revisões (score, hits, se foi enviado) para recalibrar os
 * limiares com dados reais. Best-effort: nunca atrasa nem derruba um envio.
 */
import { appendFile } from "node:fs/promises";
import { join } from "node:path";

export interface RegistroRevisao {
  ts: string;
  slug: string;
  tool: string;
  score: number;
  hits: string[];
  bloqueios: string[];
  enviado: boolean;
  candidatos?: number;
  escolhido?: number;
}

export async function registrarRevisao(dataDir: string, linha: RegistroRevisao): Promise<void> {
  try {
    await appendFile(join(dataDir, ".revisoes.jsonl"), `${JSON.stringify(linha)}\n`);
  } catch {
    /* best-effort */
  }
}
