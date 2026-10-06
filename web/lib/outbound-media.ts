import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { ehCaminhoDeMidia } from "./caminho-midia";
import { DATA_DIR, safeDataPath } from "./paths";

export interface OutboundMediaInput {
  /** Caminho de um arquivo já residente no DATA_DIR do container (reenvio de mídia da nuvem). */
  path?: string;
  /** Bytes do arquivo — usado quando o operador manda um arquivo novo do disco dele (via multipart). */
  bytes?: Uint8Array;
}

export interface ResolvedOutbound {
  /** Caminho absoluto que o control server consegue ler pra enviar. */
  abs: string;
  /** Arquivo temporário a apagar depois do envio; null se reusou um path existente. */
  tmp: string | null;
}

/**
 * Resolve os bytes de saída para um arquivo absoluto que o control server leia.
 *
 * - `bytes` presente → grava num temp dentro do DATA_DIR (sob `.tmp-outbound/`)
 *   e devolve esse path como descartável. É o caso do arquivo NOVO do operador em
 *   modo remoto: a nuvem não enxerga o disco local dele, então os bytes viajam no corpo.
 * - só `path` → exige mídia de chat dentro do DATA_DIR, valida existência e reusa (reenvio de mídia já sincronizada na nuvem).
 */
export async function resolveOutboundMedia(input: OutboundMediaInput): Promise<ResolvedOutbound> {
  if (input.bytes) {
    const abs = safeDataPath(".tmp-outbound", randomUUID());
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, input.bytes);
    return { abs, tmp: abs };
  }
  if (!input.path) {
    throw new Error("path ou bytes é obrigatório");
  }
  // Só mídia de chat já residente no DATA_DIR pode ser reenviada por caminho.
  const rel = isAbsolute(input.path) ? relative(DATA_DIR, input.path).split(sep).join("/") : input.path;
  if (rel.startsWith("..") || !ehCaminhoDeMidia(rel)) {
    throw new Error(`caminho não é mídia de um chat: ${input.path}`);
  }
  const abs = safeDataPath(rel);
  if (!existsSync(abs)) {
    throw new Error(`arquivo não encontrado: ${input.path}`);
  }
  return { abs, tmp: null };
}
