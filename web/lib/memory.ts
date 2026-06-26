import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { DATA_DIR, safeDataPath } from "./paths";

/**
 * Camada de memória MODEL-AGNOSTIC do copiloto.
 *
 * Memória aqui é só **markdown puro em arquivos** — nada da Anthropic, nada de
 * "memory tool" de provider específico. Consumir = ler o arquivo e injetar o texto
 * no contexto do prompt; isso funciona com QUALQUER modelo (Claude, GPT, Gemini,
 * local). Este módulo não importa o SDK da Anthropic de propósito: o acoplamento a
 * um provider vive só no buildPrompt (lib/copilot.ts). Um futuro adapter de outro
 * modelo reusa estas funções direto.
 *
 * Duas fontes, mescladas no contexto do copiloto:
 *  1. **Memória do Claude Code** (compartilhada, mantida por mim nas sessões): os
 *     mesmos arquivos `~/.claude/projects/<slug>/memory/*.md`. Quando o operador me
 *     pede "lembra disso", eu escrevo lá — e o copiloto passa a ler o arquivo
 *     atualizado. Read-only pelo painel.
 *  2. **Memória curada por grupo** (`data/<slug>/copilot/memory.md`): fatos do
 *     cliente daquele grupo, editável no painel. Específica, tem prioridade.
 */

/* ------------------------------------------------------------------ */
/* 1. Memória do Claude Code (compartilhada, model-agnostic)           */
/* ------------------------------------------------------------------ */

/**
 * Diretório de memória do Claude Code para ESTE projeto. O Claude Code guarda a
 * memória por projeto em `~/.claude/projects/<cwd-slugificado>/memory/`, onde o
 * slug é o caminho absoluto do projeto com `/` virando `-` (a barra inicial vira
 * um `-` à esquerda). Derivamos o slug da raiz do repo (`DATA_DIR/..`).
 * Override explícito via `COPILOT_CLAUDE_MEMORY_DIR` (ex.: em servidor sem ~/.claude).
 */
export function claudeMemoryDir(): string {
  if (process.env.COPILOT_CLAUDE_MEMORY_DIR) {
    return resolve(process.env.COPILOT_CLAUDE_MEMORY_DIR);
  }
  const repoRoot = resolve(DATA_DIR, "..");
  const slug = repoRoot.split(sep).join("-");
  return join(homedir(), ".claude", "projects", slug, "memory");
}

/** Orçamento de caracteres da memória compartilhada injetada (corte de token). */
export const SHARED_MEMORY_BUDGET = Number(process.env.COPILOT_SHARED_MEMORY_BUDGET ?? 12_000);

export interface MemoryDoc {
  /** slug do arquivo (frontmatter `name` ou nome do arquivo sem .md). */
  name: string;
  description: string;
  /** user | feedback | project | reference (frontmatter `metadata.type`). */
  type: string;
  body: string;
  /** mtime epoch ms — pra priorizar as memórias mais recentes no corte de orçamento. */
  mtime: number;
}

/** Extrai um campo simples (`name: x`) do bloco de frontmatter. */
function frontmatterField(fm: string, key: string): string {
  const m = fm.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
}

/** Faz o parse de um arquivo de memória (frontmatter YAML + corpo markdown). */
function parseMemoryDoc(file: string, raw: string, mtime: number): MemoryDoc {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm = fmMatch ? fmMatch[1] : "";
  const body = fmMatch ? raw.slice(fmMatch[0].length) : raw;
  return {
    name: frontmatterField(fm, "name") || file.replace(/\.md$/, ""),
    description: frontmatterField(fm, "description"),
    type: frontmatterField(fm, "type"),
    body: body.trim(),
    mtime,
  };
}

export interface ClaudeMemory {
  /** Conteúdo bruto do MEMORY.md (índice de uma linha por memória), se existir. */
  index: string;
  docs: MemoryDoc[];
}

/**
 * Lê a memória de um diretório de projetos do Claude Code. Markdown puro — qualquer
 * processo/modelo consome. Diretório ausente (ex.: servidor sem ~/.claude) → vazio, sem erro.
 * Se `dir` for omitido, usa o diretório deste projeto (comportamento original).
 */
export async function readClaudeMemory(dir?: string): Promise<ClaudeMemory> {
  const memDir = dir ?? claudeMemoryDir();
  let files: string[];
  try {
    files = await readdir(memDir);
  } catch {
    return { index: "", docs: [] };
  }
  let index = "";
  const docs: MemoryDoc[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const full = join(memDir, file);
    const raw = await readFile(full, "utf8").catch(() => "");
    if (!raw) continue;
    if (file === "MEMORY.md") {
      index = raw.trim();
      continue;
    }
    const { mtimeMs } = await stat(full).catch(() => ({ mtimeMs: 0 }));
    docs.push(parseMemoryDoc(file, raw, mtimeMs));
  }
  // Mais recentes primeiro — é o que sobrevive ao corte de orçamento.
  docs.sort((a, b) => b.mtime - a.mtime);
  return { index, docs };
}

/* ------------------------------------------------------------------ */
/* 1b. Listagem e leitura vinculada de projetos do Claude Code         */
/* ------------------------------------------------------------------ */

export interface ProjectInfo {
  /** Slug do diretório dentro de ~/.claude/projects/ */
  slug: string;
  /** Caminho absoluto para a pasta memory/ do projeto */
  dir: string;
  /** Rótulo amigável derivado do slug (último segmento legível do caminho) */
  name: string;
  /** Quantidade de arquivos .md na pasta memory/ */
  count: number;
}

/**
 * Deriva um nome legível do slug do projeto Claude Code.
 * O slug é o caminho absoluto com `/` → `-` (barra inicial vira `-` no início).
 * Ex.: `-Users-eu-projetos-meu-projeto` → `meu-projeto`
 */
function slugToName(slug: string): string {
  // Reconstrói o caminho: substitui `-` por `/` mas respeita hifens internos
  // levando em conta que o slug começa com `-` (barra inicial).
  // Estratégia: pegar o último segmento não-vazio após split por `/`.
  // Para isso, reconstruímos o caminho completo invertendo o slug.
  // Slug: -Users-eu-projetos-meu-projeto
  // Path: /Users/eu/projetos/meu-projeto
  // Problema: hifens no nome de pasta vs separadores de path são ambíguos.
  // Solução pragmática: pegar os últimos N tokens separados por `-` e juntar com `-`
  // O último "segmento" é a parte após o último separador de caminho conhecido.
  // Usamos heurística: pegar tudo após o último bloco de tokens comuns de caminho.
  const cleaned = slug.startsWith("-") ? slug.slice(1) : slug;
  // Tenta reconstruir o path e pegar o basename
  // Como o slug pode ter hifens nos nomes de pasta, pegamos os últimos 1-2 tokens
  // separados por hífen como o nome (geralmente funciona pra nomes de projeto)
  const parts = cleaned.split("-").filter(Boolean);
  // Retorna o último token não-vazio como nome principal, com prefixo se curto
  if (parts.length === 0) return slug;
  const last = parts[parts.length - 1];
  // Se o penúltimo parte parece um "namespace" (SaaS, empresa, etc.), mostra ambos
  const secondToLast = parts.length >= 2 ? parts[parts.length - 2] : "";
  const shortNames = ["ia", "v2", "v1", "app", "api", "web", "bot", "new"];
  if (last.length <= 3 || shortNames.includes(last.toLowerCase())) {
    return secondToLast ? `${secondToLast}-${last}` : last;
  }
  return last;
}

/**
 * Lista todos os projetos Claude Code em ~/.claude/projects/ que têm memória.
 * Retorna apenas os que possuem ao menos 1 arquivo .md em memory/.
 * Ordena por contagem de arquivos desc.
 */
export async function listClaudeProjects(): Promise<ProjectInfo[]> {
  const projectsDir = join(homedir(), ".claude", "projects");
  let slugs: string[];
  try {
    slugs = await readdir(projectsDir);
  } catch {
    return [];
  }

  const results: ProjectInfo[] = [];
  for (const slug of slugs) {
    const memDir = join(projectsDir, slug, "memory");
    let files: string[];
    try {
      files = await readdir(memDir);
    } catch {
      continue;
    }
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    if (mdFiles.length === 0) continue;
    results.push({
      slug,
      dir: memDir,
      name: slugToName(slug),
      count: mdFiles.length,
    });
  }

  results.sort((a, b) => b.count - a.count);
  return results;
}

/**
 * Lê memória de múltiplos diretórios vinculados, concatenando via formatClaudeMemory.
 * Valida que cada dir é absoluto e ignora dirs inexistentes.
 * Budget compartilhado entre todos os dirs.
 */
export async function readBoundMemory(dirs: string[]): Promise<string> {
  const validDirs = dirs.filter((d) => isAbsolute(d));
  if (validDirs.length === 0) return "";

  const allMems = await Promise.all(validDirs.map((d) => readClaudeMemory(d)));
  // Mescla índices e docs de todos os diretórios
  const merged: ClaudeMemory = { index: "", docs: [] };
  const indexParts: string[] = [];
  for (const mem of allMems) {
    if (mem.index) indexParts.push(mem.index);
    merged.docs.push(...mem.docs);
  }
  merged.index = indexParts.join("\n");
  merged.docs.sort((a, b) => b.mtime - a.mtime);

  return formatClaudeMemory(merged);
}

/**
 * Monta o bloco de texto da memória compartilhada pro prompt, respeitando o
 * orçamento de caracteres. Sempre inclui o índice (barato, dá o mapa do que
 * existe); depois injeta os corpos das memórias (mais recentes primeiro) até o teto.
 * Texto puro: serve a qualquer modelo.
 */
export function formatClaudeMemory(mem: ClaudeMemory, budget = SHARED_MEMORY_BUDGET): string {
  if (!mem.index && mem.docs.length === 0) return "";
  const parts: string[] = [];
  if (mem.index) parts.push(`ÍNDICE:\n${mem.index}`);
  let used = parts.join("\n").length;
  let truncated = 0;
  for (const doc of mem.docs) {
    const header = doc.description ? `## ${doc.name} — ${doc.description}` : `## ${doc.name}`;
    const block = `${header}\n${doc.body}`;
    if (used + block.length > budget) {
      truncated++;
      continue;
    }
    parts.push(block);
    used += block.length;
  }
  if (truncated > 0) {
    parts.push(`(+${truncated} memória(s) omitida(s) por limite de contexto — veja o índice acima.)`);
  }
  return parts.join("\n\n");
}

/* ------------------------------------------------------------------ */
/* 2. Memória curada por grupo (editável no painel)                    */
/* ------------------------------------------------------------------ */

/**
 * Lê a memória curada do grupo (`data/<slug>/copilot/memory.md`). Texto livre
 * (não exige frontmatter). Ausente → string vazia.
 */
export async function readGroupMemory(slug: string): Promise<string> {
  try {
    return await readFile(safeDataPath(slug, "copilot", "memory.md"), "utf8");
  } catch {
    return "";
  }
}

/** Grava a memória do grupo com escrita atômica (tmp + rename), criando o dir antes. */
export async function writeGroupMemory(slug: string, content: string): Promise<void> {
  const path = safeDataPath(slug, "copilot", "memory.md");
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${process.pid}-${Date.now()}.tmp`);
  await writeFile(tmp, content, "utf8");
  await rename(tmp, path);
}
