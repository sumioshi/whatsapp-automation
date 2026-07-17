// Migra um diretório de grupo criado por renomeação de volta pro slug estável:
//   npx tsx scripts/migrar-slug.ts <slug-canonico> <slug-duplicado>
// Funde os .jsonl (merge por id / dedup), move mídia e transcrições, grava o
// slug estável no groups.config.json e remove o diretório duplicado.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { slugify } from '../src/storage/paths.js';
import { mergeDedupLines, mergeMessagesById } from './lib/jsonl-merge.js';
import { rewriteMediaPrefix } from './lib/migrar-slug.js';

const DATA_DIR = resolve(process.env.WAC_DATA_DIR ?? process.env.DATA_DIR ?? join(process.cwd(), 'data'));
const GROUPS_CONFIG = resolve(
  process.env.WAC_GROUPS_CONFIG ?? process.env.GROUPS_CONFIG ?? join(process.cwd(), 'groups.config.json'),
);

async function main(): Promise<void> {
  const [canon, dup] = process.argv.slice(2);
  if (!canon || !dup || canon === dup) {
    console.error('uso: tsx scripts/migrar-slug.ts <slug-canonico> <slug-duplicado>');
    process.exit(1);
  }
  const canonDir = join(DATA_DIR, canon);
  const dupDir = join(DATA_DIR, dup);
  if (!existsSync(dupDir)) {
    console.error(`diretório duplicado não existe: ${dupDir}`);
    process.exit(1);
  }
  await mkdir(canonDir, { recursive: true });

  // Config PRIMEIRO: o coletor (hot-reload) passa a gravar no diretório
  // canônico antes da fusão — nada novo cai no duplicado durante a migração.
  await gravarSlugEstavel(canon, dup);
  await new Promise((r) => setTimeout(r, 2000));

  for (const entry of await readdir(dupDir, { withFileTypes: true })) {
    const src = join(dupDir, entry.name);
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      const conteudo = rewriteMediaPrefix(await readFile(src, 'utf8'), dup, canon);
      const dest = join(canonDir, entry.name);
      const atual = existsSync(dest) ? await readFile(dest, 'utf8') : '';
      const merged =
        entry.name === 'messages.jsonl'
          ? mergeMessagesById(atual, conteudo)
          : mergeDedupLines(atual, conteudo);
      await writeFile(dest, merged, 'utf8');
      console.log(`✔ fundido ${entry.name}`);
      continue;
    }
    if (entry.isDirectory()) {
      const destDir = join(canonDir, entry.name);
      await mkdir(destDir, { recursive: true });
      let moved = 0;
      for (const f of await readdir(src)) {
        const dest = join(destDir, f);
        if (existsSync(dest)) continue;
        await rename(join(src, f), dest);
        moved++;
      }
      console.log(`✔ ${entry.name}/: ${moved} arquivo(s) movido(s)`);
    }
  }

  await rm(dupDir, { recursive: true });
  console.log(`✔ removido ${dupDir}`);
  console.log(`✅ migração concluída: ${dup} → ${canon}`);
}

/** Grava o slug estável na entrada do grupo que hoje aponta pro slug duplicado. */
async function gravarSlugEstavel(canon: string, dup: string): Promise<void> {
  try {
    const raw = JSON.parse(await readFile(GROUPS_CONFIG, 'utf8')) as Array<{
      name?: string;
      slug?: string;
    }>;
    const alvo = raw.find((e) => e.slug === dup || slugify(e.name ?? '') === dup);
    if (alvo) {
      alvo.slug = canon;
      await writeFile(GROUPS_CONFIG, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
      console.log(`✔ groups.config: "${alvo.name}" → slug estável "${canon}"`);
    } else {
      console.warn('⚠ nenhuma entrada do groups.config casou com o slug duplicado — ajuste manual');
    }
  } catch (err) {
    console.warn(`⚠ não consegui atualizar ${GROUPS_CONFIG}: ${String(err)}`);
  }
}

void main();
