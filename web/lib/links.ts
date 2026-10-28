import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { DATA_DIR } from './paths';

/**
 * Liga um repositório de cliente a um grupo/DM de WhatsApp (bidirecional).
 *
 * Dois lados:
 *  - `data/links.json` (aqui) — índice central WhatsApp→repo que o painel usa.
 *  - `<repoPath>/.claude/whatsapp.json` + uma linha no `<repoPath>/CLAUDE.md` —
 *    o lado repo→WhatsApp, que o Claude lê sozinho ao abrir o repo do cliente.
 *
 * O arquivo central vive em DATA_DIR (gitignored), chaveado pelo slug do chat.
 */
const LINKS_FILE = join(DATA_DIR, 'links.json');

export type LinkTipo = 'grupo' | 'dm' | 'projeto';

export interface LinkEntry {
  repoPath: string;
  cliente: string;
  tipo: LinkTipo;
  notas: string;
  /** Repositório no GitHub, `owner/repo` — onde o agente de triagem abre issues. */
  github?: string;
  /** Nome do diretório de memória do Claude Code pra este repo (ver brainDirDe). */
  brainDir?: string;
}

export type LinksMap = Record<string, LinkEntry>;

const GITHUB_RE = /^[\w.-]+\/[\w.-]+$/;

/** `owner/repo`, sem URL nem caminho extra. */
export function githubValido(s: string): boolean {
  return GITHUB_RE.test(s);
}

/**
 * O Claude Code guarda a memória de um projeto em `~/.claude/projects/<dir>/memory`,
 * onde `<dir>` é o caminho absoluto com todo caractere fora de [A-Za-z0-9] trocado
 * por hífen. Reproduzimos o encoding pra localizar a memória no brain.
 */
export function brainDirDe(repoPath: string): string {
  return repoPath.replace(/[^A-Za-z0-9]/g, '-');
}

/**
 * Combina o corpo parcial de um POST em `/api/links` com a entrada já existente,
 * sem apagar campo nenhum por omissão: `github` ausente do corpo mantém o
 * github atual (apagá-lo desliga o agente de triagem do chat), e `brainDir`
 * só é recalculado quando o `repoPath` muda ou ainda não existe brainDir.
 */
export function mesclarLink(existente: LinkEntry | undefined, novo: LinkEntry, githubInformado: boolean): LinkEntry {
  const mesclado: LinkEntry = { ...novo };
  if (!githubInformado && existente?.github) mesclado.github = existente.github;
  const repoPathMudou = existente?.repoPath !== novo.repoPath;
  mesclado.brainDir = repoPathMudou || !existente?.brainDir ? brainDirDe(novo.repoPath) : existente.brainDir;
  return mesclado;
}

function isLinkEntry(v: unknown): v is LinkEntry {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as LinkEntry).repoPath === 'string' &&
    typeof (v as LinkEntry).cliente === 'string'
  );
}

/** Lê o índice central (default {} se não existir ou estiver corrompido). */
export async function readLinks(): Promise<LinksMap> {
  try {
    const parsed = JSON.parse(await readFile(LINKS_FILE, 'utf8')) as Record<string, unknown>;
    const out: LinksMap = {};
    for (const [slug, entry] of Object.entries(parsed)) {
      if (isLinkEntry(entry)) {
        const entry2: LinkEntry = {
          repoPath: entry.repoPath,
          cliente: entry.cliente,
          tipo: (['grupo', 'dm', 'projeto'].includes(entry.tipo) ? entry.tipo : 'projeto') as LinkTipo,
          notas: typeof entry.notas === 'string' ? entry.notas : '',
        };
        if (typeof entry.github === 'string' && githubValido(entry.github)) entry2.github = entry.github;
        if (typeof entry.brainDir === 'string' && /^[A-Za-z0-9-]+$/.test(entry.brainDir)) {
          entry2.brainDir = entry.brainDir;
        }
        out[slug] = entry2;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Cria/atualiza a entrada do slug no índice central (escrita atômica). */
export async function writeLink(slug: string, entry: LinkEntry): Promise<void> {
  const links = await readLinks();
  links[slug] = entry;
  await writeJsonAtomic(LINKS_FILE, links);
}

/** Remove o slug do índice central. Não toca nos arquivos do repo do cliente. */
export async function removeLink(slug: string): Promise<void> {
  const links = await readLinks();
  if (!(slug in links)) return;
  delete links[slug];
  await writeJsonAtomic(LINKS_FILE, links);
}

const MARK_START = '<!-- wa-link:start -->';
const MARK_END = '<!-- wa-link:end -->';

/** Bloco que vai no CLAUDE.md do cliente — o que dispara a descoberta automática. */
function claudeMdBlock(slug: string, entry: LinkEntry): string {
  const quem = entry.cliente ? ` (${entry.cliente})` : '';
  return [
    MARK_START,
    `WhatsApp deste projeto: \`${slug}\`${quem}. Consulte o histórico via MCP \`whatsapp-collector\``,
    `usando esse slug (ex: resumo_do_dia, ler_mensagens, buscar). "Teve mensagem nova?": \`caixa_de_entrada\``,
    `com \`grupos: ["${slug}"]\` (barato; \`ler_mensagens\` só pra ler a conversa). Pra acompanhar ativamente (ser`,
    `acordado quando chega msg), arme um Monitor no \`data/${slug}/messages.jsonl\`. Detalhes em \`.claude/whatsapp.json\`.`,
    MARK_END,
  ].join('\n');
}

/** Substitui o bloco wa-link existente, ou anexa um novo no fim. Idempotente. */
function upsertBlock(existing: string, block: string): string {
  const start = existing.indexOf(MARK_START);
  const end = existing.indexOf(MARK_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start);
    const after = existing.slice(end + MARK_END.length);
    return `${before}${block}${after}`;
  }
  const base = existing.trimEnd();
  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}

/**
 * Escreve o lado do repo do cliente: `.claude/whatsapp.json` + linha no `CLAUDE.md`.
 * Valida que repoPath é absoluto e um diretório existente (o painel é localhost-only,
 * mas não queremos escrever em path arbitrário/inválido).
 */
export async function writeClientFiles(slug: string, entry: LinkEntry): Promise<void> {
  if (!isAbsolute(entry.repoPath)) {
    throw new Error('repoPath precisa ser um caminho absoluto');
  }
  let st;
  try {
    st = await stat(entry.repoPath);
  } catch {
    throw new Error(`repoPath não existe: ${entry.repoPath}`);
  }
  if (!st.isDirectory()) throw new Error(`repoPath não é um diretório: ${entry.repoPath}`);

  // .claude/whatsapp.json
  const dotClaude = join(entry.repoPath, '.claude');
  await mkdir(dotClaude, { recursive: true });
  const clientFile = {
    grupo: slug,
    cliente: entry.cliente,
    tipo: entry.tipo,
    notas: entry.notas,
  };
  await writeJsonAtomic(join(dotClaude, 'whatsapp.json'), clientFile);

  // CLAUDE.md (cria ou faz upsert do bloco marcado)
  const claudeMd = join(entry.repoPath, 'CLAUDE.md');
  let current = '';
  try {
    current = await readFile(claudeMd, 'utf8');
  } catch {
    current = '';
  }
  const next = upsertBlock(current, claudeMdBlock(slug, entry));
  await writeFileAtomic(claudeMd, next);
}

// ---------- util ----------

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeFileAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${Date.now()}.tmp`);
  await writeFile(tmp, content, 'utf8');
  await rename(tmp, path);
}
