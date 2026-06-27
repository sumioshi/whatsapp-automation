import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { BATCH_LIMIT, selectBatch } from "./batch-select";
import { ensureLocalMedia, isMediaLocal } from "./cloud-media";
import { readSettings } from "./config";
import { transcriptPathFor } from "./data";
import { binPath } from "./paths";

const MLX_BIN = process.env.WAC_MLX_WHISPER ?? "mlx_whisper";
const SERVICE_URL = `http://127.0.0.1:${process.env.WAC_TRANSCRIBE_PORT ?? "4320"}`;
const OPENROUTER_STT_URL = "https://openrouter.ai/api/v1/audio/transcriptions";
const OR_MODEL = process.env.TRANSCRIBE_OPENROUTER_MODEL ?? "openai/whisper-large-v3";

type Backend = "mlx" | "openrouter";

/**
 * Backend de transcrição. `auto` (default): Apple Silicon (Mac) usa o MLX local;
 * qualquer outro SO (Linux/Windows/nuvem) cai pro OpenRouter STT. Força com a env
 * TRANSCRIBE_BACKEND=mlx|openrouter.
 */
function pickBackend(): Backend {
  const forced = process.env.TRANSCRIBE_BACKEND?.toLowerCase();
  if (forced === "mlx" || forced === "openrouter") return forced;
  return process.platform === "darwin" && process.arch === "arm64" ? "mlx" : "openrouter";
}

/**
 * Transcrição na nuvem via OpenRouter STT (endpoint dedicado). Aceita o `.ogg`
 * do WhatsApp direto — sem conversão. Reusa a OPENROUTER_API_KEY do copiloto.
 */
async function viaOpenRouter(absPath: string, language: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY ausente — necessária p/ transcrição na nuvem.");
  const buf = await readFile(absPath);
  const format = (extname(absPath).slice(1) || "ogg").toLowerCase();
  const res = await fetch(OPENROUTER_STT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OR_MODEL,
      input_audio: { data: buf.toString("base64"), format },
      ...(language && language !== "auto" ? { language } : {}),
    }),
  });
  const data = (await res.json()) as { text?: string; error?: { message?: string } };
  if (!res.ok || typeof data.text !== "string") {
    throw new Error(data.error?.message ?? `OpenRouter STT falhou (HTTP ${res.status}).`);
  }
  return data.text.trim();
}

/**
 * Fila serial: uma transcrição por vez. Com o serviço morno isso só evita
 * sobreposição; o modelo já fica quente entre chamadas.
 */
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

/** Tenta o serviço morno (modelo já carregado). Lança se ele estiver fora. */
async function viaService(absPath: string, model: string, language: string): Promise<string> {
  const res = await fetch(`${SERVICE_URL}/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: absPath, model, language }),
  });
  const data = (await res.json()) as { text?: string; error?: string };
  if (!res.ok || typeof data.text !== "string") {
    throw new Error(data.error ?? "serviço de transcrição falhou");
  }
  return data.text;
}

/** Fallback: roda o mlx_whisper como processo efêmero (recarrega o modelo). */
function viaCli(mediaAbsPath: string, model: string, language: string): Promise<string> {
  return (async () => {
    const tmp = await mkdtemp(join(tmpdir(), "wac-tx-"));
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          MLX_BIN,
          [
            mediaAbsPath,
            "--model", model,
            "--language", language,
            "--task", "transcribe",
            "-f", "txt",
            "-o", tmp,
            "--output-name", "out",
          ],
          { env: { ...process.env, PATH: binPath() }, stdio: ["ignore", "ignore", "pipe"] },
        );
        let stderr = "";
        child.stderr.on("data", (c) => {
          stderr += String(c);
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`mlx_whisper saiu com código ${code}: ${stderr.slice(-300)}`)),
        );
      });
      return (await readFile(join(tmp, "out.txt"), "utf8")).trim();
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  })();
}

async function runTranscription(absPath: string, model: string, language: string): Promise<string> {
  if (pickBackend() === "openrouter") {
    return viaOpenRouter(absPath, language);
  }
  try {
    return await viaService(absPath, model, language);
  } catch {
    // Serviço MLX fora do ar? Cai pro CLI (mais lento, mas funciona).
    return viaCli(absPath, model, language);
  }
}

/** Lê o sidecar se já existir (dedup). */
async function cached(sidecar: string): Promise<string | null> {
  try {
    await access(sidecar);
    return (await readFile(sidecar, "utf8")).trim();
  } catch {
    return null;
  }
}

/**
 * Transcreve uma mídia (ou devolve do cache) e grava o sidecar. Serializada.
 */
export function transcribe(slug: string, mediaPath: string): Promise<string> {
  return enqueue(async () => {
    const sidecar = transcriptPathFor(slug, mediaPath);
    const hit = await cached(sidecar);
    if (hit !== null) return hit;

    const { model, language } = await readSettings();
    const text = await runTranscription(await ensureLocalMedia(mediaPath), model, language);
    await mkdir(dirname(sidecar), { recursive: true });
    await writeFile(sidecar, `${text}\n`, "utf8");
    return text;
  });
}

export interface BatchResult {
  /** [mediaPath, texto] dos transcritos nesta chamada. */
  textos: Array<[string, string]>;
  /** Quantos pendentes sobraram além do teto (chame de novo pra continuar). */
  restantes: number;
}

/**
 * Transcreve um lote dos pendentes, COM PROTEÇÃO contra travamento:
 *  - no máximo `limite` por chamada (default BATCH_LIMIT), pra não ficar preso
 *    processando dezenas de uma vez;
 *  - os que só estão na nuvem são BAIXADOS EM PARALELO (não em série, que era o
 *    que pendurava a chamada até somar o timeout de cada cloudFetch);
 *  - a transcrição em si roda em série, mas o serviço já serializa via lock (1
 *    modelo MLX), então paralelizar a transcrição não ajudaria de qualquer forma.
 * Retorna os textos + quanto ficou de fora, pra o chamador avisar.
 */
export async function transcribeBatch(
  slug: string,
  mediaPaths: string[],
  limite: number = BATCH_LIMIT,
): Promise<BatchResult> {
  const localFlags = await Promise.all(mediaPaths.map((mp) => isMediaLocal(mp)));
  const locais = new Set(mediaPaths.filter((_, i) => localFlags[i]));
  const { processar, restantes } = selectBatch(mediaPaths, locais, limite);

  // Baixa em PARALELO os que estão na nuvem (cacheia no disco). O timeout do
  // cloudFetch protege cada um; em paralelo o tempo total é ~o do mais lento, não
  // a soma. Falha de download de um item não derruba os outros.
  await Promise.allSettled(processar.filter((mp) => !locais.has(mp)).map((mp) => ensureLocalMedia(mp)));

  const textos: Array<[string, string]> = [];
  for (const mp of processar) {
    try {
      textos.push([mp, await transcribe(slug, mp)]);
    } catch {
      // ignora falha de um item; segue os demais
    }
  }
  return { textos, restantes };
}
