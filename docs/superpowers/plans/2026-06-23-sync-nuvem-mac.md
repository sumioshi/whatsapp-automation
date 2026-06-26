# Sync nuvem → Mac — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer pro `data/` local o que a nuvem captura enquanto o Mac está off (merge de texto por `id`) e baixar mídia da nuvem sob demanda, sem derrubar o coletor/MCP local em uso.

**Architecture:** A nuvem (painel Next) expõe 2 rotas read-only de texto (`/api/sync/manifest`, `/api/sync/file`) — a rota de mídia (`/api/media/[...path]`) já existe e serve o fallback. No Mac, um script `scripts/sync-pull.ts` baixa os `.jsonl` e mergeia por `id`; as libs de mídia ganham `ensureLocalMedia()` que baixa o arquivo da nuvem quando ele não existe local.

**Tech Stack:** TypeScript, Next.js 16 (painel), tsx (runner), Vitest (testes), Node 24.

## Global Constraints

- **ZERO edição em `src/`** — `dev:collector` é `tsx watch src/index.ts`; tocar `src/` reinicia o coletor e derruba o `:4310` em uso. Todas as mudanças são em `web/`, `scripts/` e `package.json` raiz.
- **Não reiniciar o `npm run dev` em andamento.** Edições em `web/` dão hot-reload inofensivo; o MCP em execução só pega o código novo quando a sessão for recarregada (não é nosso problema agora).
- **Testes de merge/IO só em fixtures isoladas** (dir temporário / `WAC_DATA_DIR` temp) — **nunca** rodar merge no `data/` real, que está em uso.
- **Nuvem = read-only.** Nenhuma rota nova escreve. O envio continua exclusivo do `:4310` local.
- **`WAC_CLOUD_URL` vazio ⇒ comportamento idêntico ao de hoje** (sync e fallback viram no-op).
- **Framework de teste: Vitest** (devDep só na raiz), rodado por `npm test`. Config cobre `scripts/**` e `web/lib/**`.
- Envs novas (lidas só no `web`/script, nunca em `src/`): `WAC_CLOUD_URL`, `WAC_CLOUD_USER`, `WAC_CLOUD_PASS`.

---

### Task 1: Setup do Vitest + merge de JSONL (lógica pura, TDD)

**Files:**
- Create: `vitest.config.ts`, `scripts/lib/jsonl-merge.ts`
- Test: `scripts/lib/jsonl-merge.test.ts`
- Modify: `package.json` (raiz) — devDep `vitest` + script `test`

**Interfaces:**
- Produces: `mergeMessagesById(local: string, remote: string): string` — união por `id` (local vence empate), ordenada por `timestamp` asc, com `\n` final. `mergeDedupLines(local: string, remote: string): string` — dedup por linha inteira, preserva ordem (local antes do remoto novo).

- [ ] **Step 1: Instalar o Vitest e configurar**

Instalar (devDep, só na raiz — não toca `src/` nem o coletor rodando):
```bash
npm i -D vitest
```
Criar `vitest.config.ts` (raiz):
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts', 'web/lib/**/*.test.ts'],
    environment: 'node',
  },
});
```
Em `package.json` (raiz), no bloco `scripts`, adicionar:
```json
"test": "vitest run",
```

- [ ] **Step 2: Escrever o teste que falha**

```ts
// scripts/lib/jsonl-merge.test.ts
import { describe, expect, it } from 'vitest';
import { mergeDedupLines, mergeMessagesById } from './jsonl-merge';

describe('mergeMessagesById', () => {
  it('une por id, ordena por timestamp, sem duplicar', () => {
    const local = JSON.stringify({ id: 'A', timestamp: '2026-06-23T10:00:00.000Z', text: 'oi' }) + '\n';
    const remote =
      JSON.stringify({ id: 'A', timestamp: '2026-06-23T10:00:00.000Z', text: 'oi' }) + '\n' +
      JSON.stringify({ id: 'B', timestamp: '2026-06-23T09:00:00.000Z', text: 'antes' }) + '\n';
    const out = mergeMessagesById(local, remote).trim().split('\n');
    expect(out).toHaveLength(2); // A não duplica
    expect(out[0]).toContain('"id":"B"'); // 09h vem antes
    expect(out[1]).toContain('"id":"A"');
  });

  it('idempotente', () => {
    const a = JSON.stringify({ id: 'A', timestamp: '2026-06-23T10:00:00.000Z' }) + '\n';
    const once = mergeMessagesById(a, '');
    expect(mergeMessagesById(once, '')).toBe(once);
  });

  it('ignora linha sem id ou inválida', () => {
    expect(mergeMessagesById('{"timestamp":"t"}\nnão-json\n', '').trim()).toBe('');
  });
});

describe('mergeDedupLines', () => {
  it('remove repetidas, preserva ordem', () => {
    const out = mergeDedupLines('{"x":1}\n{"x":2}\n', '{"x":2}\n{"x":3}\n').trim().split('\n');
    expect(out).toEqual(['{"x":1}', '{"x":2}', '{"x":3}']);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test`
Expected: FALHA (não resolve `./jsonl-merge`).

- [ ] **Step 4: Implementar o módulo**

```ts
// scripts/lib/jsonl-merge.ts
// Merge de arquivos .jsonl append-only do coletor (nuvem ∪ local), sem perda.

/** Linhas não-vazias, sem espaços nas pontas. */
function lines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * messages.jsonl: união por `id`. Em empate de id, a versão LOCAL prevalece
 * (tem o contexto resolvido do Mac). Ordena por `timestamp` (ISO, ordenável
 * lexicograficamente). Idempotente. Retorna jsonl com `\n` final.
 */
export function mergeMessagesById(local: string, remote: string): string {
  const byId = new Map<string, { ts: string; line: string }>();
  const add = (line: string) => {
    let obj: { id?: string; timestamp?: string };
    try {
      obj = JSON.parse(line);
    } catch {
      return;
    }
    if (!obj.id) return;
    byId.set(obj.id, { ts: obj.timestamp ?? '', line });
  };
  for (const l of lines(remote)) add(l); // remoto primeiro…
  for (const l of lines(local)) add(l); // …local sobrescreve no empate
  const sorted = [...byId.values()].sort((a, b) => a.ts.localeCompare(b.ts));
  return sorted.length ? sorted.map((v) => v.line).join('\n') + '\n' : '';
}

/** Sidecars .jsonl (fatos imutáveis): dedup por linha inteira, ordem preservada. */
export function mergeDedupLines(local: string, remote: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of [...lines(local), ...lines(remote)]) {
    if (seen.has(l)) continue;
    seen.add(l);
    out.push(l);
  }
  return out.length ? out.join('\n') + '\n' : '';
}
```

- [ ] **Step 5: Rodar os testes (devem passar)**

Run: `npm test`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts scripts/lib/jsonl-merge.ts scripts/lib/jsonl-merge.test.ts package.json package-lock.json
git commit -m "feat(sync): vitest + merge de jsonl por id/linha (lógica pura, testada)"
```

---

### Task 2: Rotas read-only de texto no painel

**Files:**
- Create: `web/app/api/sync/manifest/route.ts`
- Create: `web/app/api/sync/file/[...path]/route.ts`

**Interfaces:**
- Produces: `GET /api/sync/manifest` → `{ files: { path, size, mtime }[] }` (só `<grupo>/*.jsonl`). `GET /api/sync/file/<grupo>/<arquivo>.jsonl` → corpo `text/plain`; recusa não-`.jsonl` (400), traversal (400), inexistente (404).
- Consumes: `DATA_DIR`, `safeDataPath` de `@/lib/paths`.

- [ ] **Step 1: Criar a rota manifest**

```ts
// web/app/api/sync/manifest/route.ts
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { DATA_DIR } from '@/lib/paths';

export const runtime = 'nodejs';

/** Lista os .jsonl de cada grupo pro sync do Mac puxar e mergear. */
export async function GET() {
  const files: { path: string; size: number; mtime: number }[] = [];
  let groups: string[] = [];
  try {
    const entries = await readdir(DATA_DIR, { withFileTypes: true });
    groups = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return NextResponse.json({ files });
  }
  for (const g of groups) {
    let inner: string[] = [];
    try {
      inner = await readdir(join(DATA_DIR, g));
    } catch {
      continue;
    }
    for (const f of inner) {
      if (!f.endsWith('.jsonl')) continue;
      const s = await stat(join(DATA_DIR, g, f));
      files.push({ path: `${g}/${f}`, size: s.size, mtime: s.mtimeMs });
    }
  }
  return NextResponse.json({ files });
}
```

- [ ] **Step 2: Criar a rota file (catch-all)**

```ts
// web/app/api/sync/file/[...path]/route.ts
import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { safeDataPath } from '@/lib/paths';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.length || !path[path.length - 1].endsWith('.jsonl')) {
    return NextResponse.json({ error: 'só .jsonl' }, { status: 400 });
  }
  let abs: string;
  try {
    abs = safeDataPath(...path);
  } catch {
    return NextResponse.json({ error: 'path inválido' }, { status: 400 });
  }
  try {
    const body = await readFile(abs, 'utf8');
    return new NextResponse(body, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  } catch {
    return NextResponse.json({ error: 'não encontrado' }, { status: 404 });
  }
}
```

- [ ] **Step 3: Smoke test contra o painel local (já rodando — next dev faz hot-reload das rotas novas)**

Run (escolha um grupo real do seu `data/`, ex. `meu-grupo`):
```bash
curl -s localhost:3000/api/sync/manifest | head -c 400; echo
curl -s "localhost:3000/api/sync/file/meu-grupo/messages.jsonl" | head -c 200; echo
curl -s -o /dev/null -w '%{http_code}\n' "localhost:3000/api/sync/file/meu-grupo/avatar.jpg"   # espera 400
curl -s -o /dev/null -w '%{http_code}\n' "localhost:3000/api/sync/file/..%2f..%2fpackage.json"      # espera 400
```
Expected: manifest lista `…/messages.jsonl`; o file devolve JSON-lines; não-`.jsonl` e traversal → `400`.

- [ ] **Step 4: Commit**

```bash
git add web/app/api/sync/manifest/route.ts web/app/api/sync/file
git commit -m "feat(sync): rotas read-only de texto (manifest + file) no painel"
```

---

### Task 3: Acesso à nuvem + `ensureLocalMedia` (TDD)

**Files:**
- Create: `web/lib/cloud.ts`, `web/lib/cloud-media.ts`
- Test: `web/lib/cloud-media.test.ts`

**Interfaces:**
- Produces: `CLOUD_URL: string`, `cloudEnabled(): boolean`, `cloudFetch(path: string): Promise<Response>` (de `cloud.ts`). `ensureLocalMedia(relPath: string): Promise<string>` (de `cloud-media.ts`) — devolve o caminho absoluto local, baixando da nuvem se faltar.
- Consumes: `safeDataPath` de `./paths`; `cloud.ts`.

- [ ] **Step 1: Criar `cloud.ts`**

```ts
// web/lib/cloud.ts — acesso READ-ONLY à instância da nuvem (sync + mídia sob demanda).
/** Base da nuvem (sem barra final). Vazio = recursos de nuvem desligados. */
export const CLOUD_URL = (process.env.WAC_CLOUD_URL ?? '').replace(/\/+$/, '');

export function cloudEnabled(): boolean {
  return CLOUD_URL.length > 0;
}

function authHeaders(): Record<string, string> {
  const user = process.env.WAC_CLOUD_USER;
  const pass = process.env.WAC_CLOUD_PASS;
  if (!user || !pass) return {};
  return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` };
}

/** GET num caminho da nuvem (ex.: "/api/sync/manifest"). Lança se !ok. Timeout 30s. */
export async function cloudFetch(path: string): Promise<Response> {
  if (!cloudEnabled()) throw new Error('WAC_CLOUD_URL não configurado');
  const res = await fetch(`${CLOUD_URL}${path}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`nuvem ${path} -> HTTP ${res.status}`);
  return res;
}
```

- [ ] **Step 2: Criar `cloud-media.ts`**

```ts
// web/lib/cloud-media.ts — garante a mídia local, baixando da nuvem sob demanda.
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { cloudEnabled, cloudFetch } from './cloud';
import { safeDataPath } from './paths';

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Caminho absoluto da mídia (relativa a DATA_DIR). Se não existe local e a nuvem
 * está configurada, baixa de /api/media e cacheia. Sem nuvem e sem arquivo → erro.
 */
export async function ensureLocalMedia(relPath: string): Promise<string> {
  const abs = safeDataPath(relPath);
  if (await exists(abs)) return abs;
  if (!cloudEnabled()) {
    throw new Error(`Mídia não está no Mac e WAC_CLOUD_URL não configurado: ${relPath}`);
  }
  const url = `/api/media/${relPath.split('/').map(encodeURIComponent).join('/')}`;
  const res = await cloudFetch(url);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(await res.arrayBuffer()));
  return abs;
}
```

- [ ] **Step 3: Escrever os testes (local existe / sem nuvem / baixa da nuvem)**

```ts
// web/lib/cloud-media.test.ts
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wac-media-'));
  vi.stubEnv('WAC_DATA_DIR', dir);
  vi.resetModules(); // paths.ts/cloud.ts leem env no import → reimporta limpo por teste
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('arquivo local existe → retorna sem rede', async () => {
  vi.stubEnv('WAC_CLOUD_URL', '');
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const { ensureLocalMedia } = await import('./cloud-media');
  await mkdir(join(dir, 'g/audio'), { recursive: true });
  await writeFile(join(dir, 'g/audio/x.ogg'), 'oi');
  expect(await ensureLocalMedia('g/audio/x.ogg')).toBe(join(dir, 'g/audio/x.ogg'));
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('sem arquivo e sem nuvem → erro claro', async () => {
  vi.stubEnv('WAC_CLOUD_URL', '');
  const { ensureLocalMedia } = await import('./cloud-media');
  await expect(ensureLocalMedia('g/audio/nao.ogg')).rejects.toThrow(/WAC_CLOUD_URL/);
});

it('sem arquivo e com nuvem → baixa e cacheia', async () => {
  vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
  vi.stubEnv('WAC_CLOUD_USER', 'u');
  vi.stubEnv('WAC_CLOUD_PASS', 'p');
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
  );
  const { ensureLocalMedia } = await import('./cloud-media');
  const abs = await ensureLocalMedia('g/audio/baixa.ogg');
  expect(abs).toBe(join(dir, 'g/audio/baixa.ogg'));
  expect(await readFile(abs)).toEqual(Buffer.from([1, 2, 3]));
});
```

- [ ] **Step 4: Rodar os testes (devem passar)**

Run: `npm test`
Expected: PASS (merge + cloud-media).

- [ ] **Step 5: Commit**

```bash
git add web/lib/cloud.ts web/lib/cloud-media.ts web/lib/cloud-media.test.ts
git commit -m "feat(sync): cloud.ts + ensureLocalMedia (mídia sob demanda da nuvem)"
```

---

### Task 4: Plugar `ensureLocalMedia` nos pontos de leitura de mídia

**Files:**
- Modify: `web/lib/transcribe.ts` (chamada em `transcribe`, ~linha 146)
- Modify: `web/lib/documents.ts` (`extractDocumentText`, ~linha 86)
- Modify: `web/mcp/server.ts` (`ver_imagem` ~184, `ver_video` ~262)

**Interfaces:**
- Consumes: `ensureLocalMedia` de Task 3.

- [ ] **Step 1: `transcribe.ts`** — importar e trocar a resolução do caminho.

Topo do arquivo, junto aos imports de `./`:
```ts
import { ensureLocalMedia } from './cloud-media';
```
Na função `transcribe`, trocar `runTranscription(safeDataPath(mediaPath), model, language)` por:
```ts
    const text = await runTranscription(await ensureLocalMedia(mediaPath), model, language);
```
(Se `safeDataPath` ficar sem uso no arquivo, remover do import pra não quebrar o `biome check`.)

- [ ] **Step 2: `documents.ts`** — baixar antes de extrair.

Import:
```ts
import { ensureLocalMedia } from './cloud-media';
```
Em `extractDocumentText`, trocar `const absPath = safeDataPath(relPath);` por:
```ts
  const absPath = await ensureLocalMedia(relPath);
```
(O sidecar `${relPath}.extracted.txt` continua com `safeDataPath` — é local, não baixa.)

- [ ] **Step 3: `server.ts`** — `ver_imagem` e `ver_video`.

Import (junto a `safeDataPath`):
```ts
import { ensureLocalMedia } from '../lib/cloud-media';
```
Em `ver_imagem`: trocar `await readFile(safeDataPath(mediaPath))` por `await readFile(await ensureLocalMedia(mediaPath))`.
Em `ver_video`: trocar `sampleVideoFrames(safeDataPath(mediaPath), frames ?? 3)` por `sampleVideoFrames(await ensureLocalMedia(mediaPath), frames ?? 3)`.

- [ ] **Step 4: Verificar tipos + comportamento inalterado sem nuvem**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.
Run (sem `WAC_CLOUD_URL`, um áudio que já existe local): `curl -s localhost:3000/api/transcribe -X POST -H 'content-type: application/json' -d '{"slug":"<grupo>","mediaPath":"<grupo>/audio/<arquivo>.ogg"}' | head -c 200; echo`
Expected: transcrição normal (idêntico a antes — `ensureLocalMedia` devolve o path local na hora).

- [ ] **Step 5: Commit**

```bash
git add web/lib/transcribe.ts web/lib/documents.ts web/mcp/server.ts
git commit -m "feat(sync): mídia sob demanda em transcrever/ver_imagem/ver_video/ler_documento"
```

---

### Task 5: `sync-pull` + gatilhos no `package.json`

**Files:**
- Create: `scripts/sync-pull.ts`
- Modify: `package.json` (raiz) — scripts `sync` e `dev`

**Interfaces:**
- Consumes: `mergeMessagesById`/`mergeDedupLines` (Task 1), `CLOUD_URL`/`cloudEnabled`/`cloudFetch` (Task 3).

- [ ] **Step 1: Criar `scripts/sync-pull.ts`**

```ts
// scripts/sync-pull.ts — puxa os .jsonl da nuvem e mergeia no data/ local (Mac-side).
// No-op silencioso sem WAC_CLOUD_URL. Sai 0 mesmo em erro (não bloqueia o `dev`).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { CLOUD_URL, cloudEnabled, cloudFetch } from '../web/lib/cloud';
import { mergeDedupLines, mergeMessagesById } from './lib/jsonl-merge';

const DATA_DIR = resolve(process.env.WAC_DATA_DIR ?? join(process.cwd(), 'data'));

async function readOrEmpty(p: string): Promise<string> {
  try {
    return await readFile(p, 'utf8');
  } catch {
    return '';
  }
}

async function writeAtomic(p: string, content: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, p);
}

async function main(): Promise<void> {
  if (!cloudEnabled()) {
    console.log('[sync] WAC_CLOUD_URL não setado — pulando.');
    return;
  }
  console.log(`[sync] puxando de ${CLOUD_URL} …`);
  const manifest = (await (await cloudFetch('/api/sync/manifest')).json()) as {
    files: { path: string }[];
  };
  let changed = 0;
  for (const { path: rel } of manifest.files) {
    const enc = rel.split('/').map(encodeURIComponent).join('/');
    const remote = await (await cloudFetch(`/api/sync/file/${enc}`)).text();
    const localPath = join(DATA_DIR, rel);
    const local = await readOrEmpty(localPath);
    const out = rel.endsWith('messages.jsonl')
      ? mergeMessagesById(local, remote)
      : mergeDedupLines(local, remote);
    if (out && out !== local) {
      await writeAtomic(localPath, out);
      changed++;
    }
  }
  console.log(`[sync] pronto — ${changed} arquivo(s) atualizado(s).`);
}

main().catch((err) => {
  console.error('[sync] falhou (seguindo sem bloquear):', err?.message ?? err);
  process.exitCode = 0;
});
```

- [ ] **Step 2: Adicionar os scripts no `package.json` (raiz)**

Adicionar `sync` e prefixar o `dev` com o pull (ignorando falha):
```json
"sync": "tsx scripts/sync-pull.ts",
"dev": "npm run sync || true && concurrently -k -n collector,panel,transcriber -c cyan,green,magenta \"npm:dev:collector\" \"npm:dev:panel\" \"npm:dev:transcriber\"",
```
(O `npm run sync` no `dev` roda **antes** do coletor subir = janela segura. **Não rodar `npm run dev` agora** — só vale na próxima vez que ligar o projeto.)

- [ ] **Step 3: Smoke test end-to-end em DIR TEMP (não toca o `data/` real)**

Pré-requisito: `WAC_CLOUD_URL`/`USER`/`PASS` da nuvem real (read-only). Rodar o pull contra um `data/` temporário:
```bash
TMP=$(mktemp -d)
WAC_DATA_DIR="$TMP" WAC_CLOUD_URL="https://seu-painel.exemplo" \
  WAC_CLOUD_USER="<user>" WAC_CLOUD_PASS="<senha>" \
  npx tsx scripts/sync-pull.ts
echo "--- grupos baixados ---"; ls "$TMP"
echo "--- 1ª msg de um grupo ---"; head -1 "$TMP"/*/messages.jsonl 2>/dev/null | head -1
rm -rf "$TMP"
```
Expected: log `[sync] pronto — N arquivo(s)…`; o temp tem pastas de grupo com `messages.jsonl`. **O `data/` real não é tocado.**

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-pull.ts package.json
git commit -m "feat(sync): sync-pull (merge nuvem→Mac) + gatilho no npm run dev"
```

---

### Task 6: Documentar as envs do sync

**Files:**
- Modify/Create: `.env.example` (raiz)
- Modify: `.claude/skills/run-whatsapp-automation/SKILL.md` (seção curta sobre o sync)

**Interfaces:** nenhuma (documentação).

- [ ] **Step 1: Registrar as envs**

Adicionar ao `.env.example` (raiz):
```bash
# Sync nuvem→Mac (opcional). Vazio = desligado (comportamento padrão).
# URL do painel na nuvem (Tailscale no caso atual) + Basic Auth do painel.
WAC_CLOUD_URL=
WAC_CLOUD_USER=
WAC_CLOUD_PASS=
```

- [ ] **Step 2: Nota curta na skill**

No `SKILL.md`, sob uma seção "Sync nuvem→Mac": explicar que, com `WAC_CLOUD_*` no `.env`, o `npm run dev` puxa o gap da nuvem antes de subir o coletor, e que mídia é baixada sob demanda; `npm run sync` roda o pull manualmente.

- [ ] **Step 3: Commit**

```bash
git add .env.example .claude/skills/run-whatsapp-automation/SKILL.md
git commit -m "docs(sync): envs WAC_CLOUD_* e nota na skill"
```

---

## Self-Review

**Spec coverage:**
- Rotas read-only (manifest/file) → Task 2; mídia reusa `/api/media` existente → Task 3/4. ✓
- Pull com merge por id → Task 1 (lógica) + Task 5 (orquestração). ✓
- Mídia sob demanda (`ensureLocalMedia`) → Task 3 + plug Task 4. ✓
- Gatilho no `npm run dev` + `npm run sync` → Task 5. ✓
- Erros/bordas (sem cloud = no-op; nuvem off não bloqueia; escrita atômica; traversal) → Task 5 (catch+exit0, writeAtomic), Task 2 (safeDataPath+sufixo), Global Constraints. ✓
- Testes (merge, ensureLocalMedia incl. download, rotas) → Tasks 1, 3, 2. ✓
- Envs documentadas → Task 6. ✓

**Placeholder scan:** sem TODO/TBD; todo step com código real ou comando concreto (`<senha>`/`<grupo>` são valores que o executor preenche no smoke). ✓
**Type consistency:** `mergeMessagesById`/`mergeDedupLines`, `cloudFetch`, `ensureLocalMedia`, `CLOUD_URL`/`cloudEnabled` usados com as mesmas assinaturas entre tasks. ✓
**Constraint:** nenhuma task toca `src/`. ✓
