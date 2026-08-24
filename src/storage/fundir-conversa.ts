import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mergeDedupLines, mergeMessagesById } from './jsonl-merge.js';

/**
 * Funde o diretório de uma conversa duplicada no canônico: .jsonl com merge
 * por id (dedup), mediaPath reescrito pro slug canônico, mídia movida sem
 * sobrescrever, e o duplicado removido. É o núcleo do caso clássico de DM
 * duplicada (mesmo contato visto por LID e por telefone) — usado pelo
 * reconciliador e reutilizável por scripts.
 */
export async function fundirConversa(
  dataDir: string,
  canonico: string,
  duplicado: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const canonDir = join(dataDir, canonico);
  const dupDir = join(dataDir, duplicado);
  if (canonico === duplicado) return { ok: false, motivo: 'slugs iguais' };
  if (!existsSync(dupDir)) return { ok: false, motivo: 'duplicado não existe' };
  await mkdir(canonDir, { recursive: true });

  for (const entry of await readdir(dupDir, { withFileTypes: true })) {
    const src = join(dupDir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const conteudo = (await readFile(src, 'utf8')).replaceAll(
        `${duplicado}/`,
        `${canonico}/`,
      );
      const dest = join(canonDir, entry.name);
      const atual = existsSync(dest) ? await readFile(dest, 'utf8') : '';
      const merged =
        entry.name === 'messages.jsonl'
          ? mergeMessagesById(atual, conteudo)
          : mergeDedupLines(atual, conteudo);
      await writeFile(dest, merged, 'utf8');
      continue;
    }
    if (entry.isDirectory()) {
      // Diretórios de mídia: move arquivo a arquivo, sem sobrescrever existentes.
      const destDir = join(canonDir, entry.name);
      await mkdir(destDir, { recursive: true });
      for (const arquivo of await readdir(src)) {
        const destino = join(destDir, arquivo);
        if (!existsSync(destino)) await rename(join(src, arquivo), destino);
      }
      continue;
    }
    // Arquivos soltos (avatar.jpg, sidecars não-jsonl): só copia se não existir.
    const destino = join(canonDir, entry.name);
    if (!existsSync(destino)) await rename(src, destino);
  }

  await rm(dupDir, { recursive: true, force: true });
  return { ok: true };
}
