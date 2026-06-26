import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import { ensureLocalMedia } from './cloud-media';
import { safeDataPath } from './paths';

/** Acima disso truncamos para não estourar o contexto da IA. */
const MAX_CHARS = 100_000;

/** Resultado da extração de texto de um documento. */
export interface DocumentText {
  /** Texto extraído (já truncado se preciso). Vazio se não há camada de texto. */
  text: string;
  /** Nº de páginas, quando a extração conhece (PDF). */
  pages?: number;
  /** true se o texto foi cortado em MAX_CHARS. */
  truncated?: boolean;
  /** Aviso quando não há texto extraível (ex.: PDF escaneado). */
  note?: string;
}

/** Extensões que lemos como texto puro (UTF-8). */
const PLAIN_EXTS = new Set(['.txt', '.csv', '.md', '.json', '.log', '.tsv']);

/** Lê o sidecar de texto já extraído, se existir (dedup). */
async function cached(sidecar: string): Promise<string | null> {
  try {
    await access(sidecar);
    return await readFile(sidecar, 'utf8');
  } catch {
    return null;
  }
}

/** Corta em MAX_CHARS e sinaliza. */
function clamp(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_CHARS), truncated: true };
}

/** Extrai texto de um PDF via unpdf (PDF.js serverless embutido, ESM). */
async function extractPdf(absPath: string): Promise<DocumentText> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const buf = await readFile(absPath);
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  const merged = (text ?? '').trim();

  if (!merged) {
    return {
      text: '',
      pages: totalPages,
      truncated: false,
      note: 'PDF sem texto extraível (provável digitalização) — use ver_imagem se for o caso',
    };
  }

  const { text: clamped, truncated } = clamp(merged);
  return { text: clamped, pages: totalPages, truncated };
}

/** Extrai texto de um .docx via mammoth (se instalado). */
async function extractDocx(absPath: string): Promise<DocumentText> {
  let mammoth: typeof import('mammoth');
  try {
    mammoth = await import('mammoth');
  } catch {
    return {
      text: '',
      truncated: false,
      note: '.docx não suportado neste ambiente (mammoth não instalado)',
    };
  }
  const { value } = await mammoth.extractRawText({ path: absPath });
  const { text, truncated } = clamp((value ?? '').trim());
  return { text, truncated };
}

/**
 * Extrai o texto de um documento já baixado pelo coletor e cacheia o resultado
 * num sidecar `<arquivo>.extracted.txt` ao lado do original. Em chamadas
 * seguintes o sidecar é reaproveitado (não reprocessa).
 *
 * `relPath` é relativo a DATA_DIR, ex.: "acme/document/2026-..._contrato.pdf".
 * Suporta .pdf, .docx e texto puro (.txt/.csv/.md/.json/...).
 */
export async function extractDocumentText(relPath: string): Promise<DocumentText> {
  const absPath = await ensureLocalMedia(relPath);
  const ext = extname(absPath).toLowerCase();
  const sidecar = safeDataPath(`${relPath}.extracted.txt`);

  const hit = await cached(sidecar);
  if (hit !== null) {
    const { text, truncated } = clamp(hit);
    return { text, truncated };
  }

  let result: DocumentText;
  if (ext === '.pdf') {
    result = await extractPdf(absPath);
  } else if (ext === '.docx') {
    result = await extractDocx(absPath);
  } else if (PLAIN_EXTS.has(ext)) {
    const raw = await readFile(absPath, 'utf8');
    const { text, truncated } = clamp(raw);
    result = { text, truncated };
  } else {
    throw new Error(`tipo não suportado: ${ext || '(sem extensão)'}`);
  }

  // Cacheia mesmo texto vazio: evita reprocessar PDF escaneado a cada chamada.
  await mkdir(dirname(sidecar), { recursive: true });
  await writeFile(sidecar, result.text, 'utf8');
  return result;
}
