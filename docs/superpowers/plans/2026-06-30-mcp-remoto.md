# MCP Remoto (multi-tenant via HTTP) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao MCP server um modo REMOTO opcional — quando ligado, ele lê dados e envia ações via HTTP autenticado para o painel Next.js na nuvem (Railway) daquele usuário, em vez de ler disco local + `127.0.0.1:4310`. Cada pessoa aponta para o próprio container (multi-tenant por instância).

**Architecture:** Estilo "Fat MCP / Thin transporte": a lógica de domínio fica no MCP em ambos os modos; só a FONTE dos dados crus muda de disco→HTTP, centralizada numa fachada `web/lib/data-source.ts`. O interruptor é a env `WAC_MCP_REMOTE=1` (reusa o trio `WAC_CLOUD_*` já existente). O painel já tem rotas `/api`, Basic Auth (`web/proxy.ts`) e HTTPS; criamos só as rotas que faltam.

**Tech Stack:** TypeScript (ESM), Next.js 16 (App Router, rotas `web/app/api/**/route.ts`), MCP SDK (`web/mcp/server.ts`, rodado via `tsx`), Vitest (raiz cobre `web/lib/**/*.test.ts` e `scripts/**/*.test.ts`).

## Global Constraints

- **RESTRIÇÃO DURA — modo local intocado:** o comportamento local atual NÃO pode mudar. O remoto é aditivo, atrás de `WAC_MCP_REMOTE`, default desligado. Em modo não-remoto, cada função `ds*` chama EXATAMENTE a lib de hoje (passthrough), sem nenhuma branch nova de runtime que toque o caminho local.
- **Interruptor:** `mcpRemote()` retorna `true` SOMENTE se `process.env.WAC_MCP_REMOTE === '1'` **E** `cloudEnabled()`. Endereço/credenciais vêm de `WAC_CLOUD_URL`/`WAC_CLOUD_USER`/`WAC_CLOUD_PASS` (NÃO criar `WAC_REMOTE_*`).
- **Não tocar** `scripts/sync-pull.ts` nem `web/lib/cloud-media.ts` — eles dependem só de `cloudEnabled()` e devem continuar idênticos.
- **Suíte verde:** 84 testes existentes devem continuar passando. Só ADIÇÕES nas libs locais; nada renomeado/removido.
- **Auth:** todo `cloudPost`/`cloudJson`/`cloudFetch` reusa `authHeaders()` (Basic Auth) já em `web/lib/cloud.ts`. As rotas `/api` ficam atrás do `web/proxy.ts` (já protege `/api/*`).
- **Idioma:** símbolos, comentários e mensagens em pt-BR com acentuação correta.
- **Sem header de licença** em arquivos de `web/lib/` e `web/app/` (siga os vizinhos — não têm).
- **Tipos reais confirmados no código** (use verbatim):
  - `Contacts` (`web/lib/contacts.ts:7`): `{ names: Map<string,string>; ownIds: Set<string>; teamIds: Set<string>; phones: Map<string,string>; lids: Set<string>; hasSidecar: boolean }`.
  - `TriageState` (`web/lib/triage.ts:10`): 8 campos, todos `Record<...>` (JSON puro).
  - `GroupSummary` (`web/lib/data.ts:172`), `MessageView` (`web/lib/data.ts:156`), `GroupEntry` (`web/lib/config.ts:7`): JSON puros.
  - `cloudFetch(path)` é GET-only (`web/lib/cloud.ts:24`).

---

### Task 1: Transporte — `mcpRemote`, `cloudJson`, `cloudPost`

Adiciona ao `web/lib/cloud.ts` o interruptor e os dois helpers HTTP que o data-source usa. Base de tudo.

**Files:**
- Modify: `web/lib/cloud.ts` (após `cloudFetch`, ~linha 33)
- Test: `web/lib/cloud.test.ts` (CRIAR)

**Interfaces:**
- Consumes: `cloudUrl()`, `cloudEnabled()`, `authHeaders()` (privada — fica no módulo) já existentes.
- Produces (consumido pela Task 2+):
  - `mcpRemote(): boolean`
  - `cloudJson<T>(path: string): Promise<T>`
  - `cloudPost(path: string, body: unknown): Promise<Response>`

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `web/lib/cloud.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules(); // cloud.ts lê env na hora da chamada; reimporta limpo
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('mcpRemote', () => {
  it('false quando a flag não está setada (mesmo com cloud configurado)', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    const { mcpRemote } = await import('./cloud');
    expect(mcpRemote()).toBe(false);
  });
  it('false quando flag=1 mas sem WAC_CLOUD_URL (cinto de segurança)', async () => {
    vi.stubEnv('WAC_MCP_REMOTE', '1');
    vi.stubEnv('WAC_CLOUD_URL', '');
    const { mcpRemote } = await import('./cloud');
    expect(mcpRemote()).toBe(false);
  });
  it('true quando flag=1 E cloud configurado', async () => {
    vi.stubEnv('WAC_MCP_REMOTE', '1');
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    const { mcpRemote } = await import('./cloud');
    expect(mcpRemote()).toBe(true);
  });
  it('false quando flag tem outro valor', async () => {
    vi.stubEnv('WAC_MCP_REMOTE', 'true');
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    const { mcpRemote } = await import('./cloud');
    expect(mcpRemote()).toBe(false);
  });
});

describe('cloudPost', () => {
  it('POST com Basic Auth, JSON body e timeout', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.stubEnv('WAC_CLOUD_USER', 'u');
    vi.stubEnv('WAC_CLOUD_PASS', 'p');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { cloudPost } = await import('./cloud');
    await cloudPost('/api/send', { jid: 'x@g.us', text: 'oi' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('u:p').toString('base64')}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ jid: 'x@g.us', text: 'oi' }),
      }),
    );
  });
  it('lança em HTTP não-2xx', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('erro', { status: 500 }));
    const { cloudPost } = await import('./cloud');
    await expect(cloudPost('/api/send', {})).rejects.toThrow(/500/);
  });
});

describe('cloudJson', () => {
  it('faz GET e parseia JSON', async () => {
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ a: 1 }]), { status: 200 }),
    );
    const { cloudJson } = await import('./cloud');
    expect(await cloudJson('/api/x')).toEqual([{ a: 1 }]);
  });
});
```

- [ ] **Step 2: Rodar — devem FALHAR**

Run: `npx vitest run web/lib/cloud.test.ts`
Expected: FAIL — `mcpRemote`/`cloudPost`/`cloudJson` não exportados.

- [ ] **Step 3: Implementar em `web/lib/cloud.ts`**

Adicione ao final de `web/lib/cloud.ts` (após `cloudFetch`). Note que `authHeaders()` já existe no módulo — reuse:

```typescript
/** Interruptor do modo remoto do MCP. Só liga se a flag estiver em '1' E a nuvem
 * configurada (cinto de segurança: remoto sem URL cairia em erro). Lido na hora. */
export function mcpRemote(): boolean {
  return process.env.WAC_MCP_REMOTE === '1' && cloudEnabled();
}

/** GET autenticado + parse JSON. Reusa o cloudFetch (Basic Auth + timeout). */
export async function cloudJson<T>(path: string): Promise<T> {
  const res = await cloudFetch(path);
  return (await res.json()) as T;
}

/** POST autenticado com corpo JSON. cloudFetch é GET-only, então fazemos aqui o
 * fetch com método POST reusando o mesmo header de auth e timeout. */
export async function cloudPost(path: string, body: unknown): Promise<Response> {
  const base = cloudUrl();
  if (!base) throw new Error('WAC_CLOUD_URL não configurado');
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`nuvem ${path} -> HTTP ${res.status}`);
  return res;
}
```

- [ ] **Step 4: Rodar — devem PASSAR**

Run: `npx vitest run web/lib/cloud.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/cloud.ts web/lib/cloud.test.ts
git commit -m "feat(mcp-remoto): transporte — mcpRemote + cloudJson + cloudPost (testado)"
```

---

### Task 2: Rotas `/api` que faltam (summary, contacts/raw, agent-seen, profile, send-media-json, triage autonomo)

As rotas que o data-source remoto consome e que ainda não existem. Cada uma reusa uma função de lib já existente. São rotas Next.js (handlers GET/POST). Não têm teste unitário próprio (são casca fina sobre libs já testadas); a verificação é o build do painel + o type-check.

**Files:**
- Create: `web/app/api/groups/summary/route.ts`
- Create: `web/app/api/contacts/raw/route.ts`
- Create: `web/app/api/agent-seen/route.ts`
- Create: `web/app/api/profile/route.ts`
- Create: `web/app/api/send-media-json/route.ts`
- Modify: `web/app/api/triage/route.ts` (adicionar `case "autonomo"`)

**Interfaces:**
- Consumes: `listGroups`, `buildContacts`, `readAgentSeen`/`setAgentSeenMany`, `setAutonomo`, `CONTROL_URL` (de `web/lib/paths`), `safeDataPath`.
- Produces (consumido pela Task 3/4 via HTTP):
  - `GET /api/groups/summary` → `GroupSummary[]`
  - `GET /api/contacts/raw` → `{ names:[string,string][]; ownIds:string[]; teamIds:string[]; phones:[string,string][]; lids:string[]; hasSidecar:boolean }`
  - `GET /api/agent-seen` → `Record<string,string>`; `POST {updates}` → `{ ok:true }`
  - `POST /api/profile {name?,status?,picturePath?}` → `{ ok:true }`
  - `POST /api/send-media-json {jid,kind,path,caption?,fileName?,mimetype?}` → `{ ok:true }`
  - `POST /api/triage {action:"autonomo", slug, value}` → `{ ok:true }`

- [ ] **Step 1: `web/app/api/groups/summary/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { listGroups } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listGroups());
}
```

- [ ] **Step 2: `web/app/api/contacts/raw/route.ts`**

Serializa os `Map`/`Set` do `Contacts` em arrays (JSON não carrega Map/Set). O data-source rehidrata.

```typescript
import { NextResponse } from "next/server";
import { buildContacts } from "@/lib/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const c = await buildContacts();
  return NextResponse.json({
    names: [...c.names.entries()],
    ownIds: [...c.ownIds],
    teamIds: [...c.teamIds],
    phones: [...c.phones.entries()],
    lids: [...c.lids],
    hasSidecar: c.hasSidecar,
  });
}
```

- [ ] **Step 3: `web/app/api/agent-seen/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { readAgentSeen, setAgentSeenMany } from "@/lib/agent-seen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readAgentSeen());
}

export async function POST(req: Request) {
  const { updates } = (await req.json()) as { updates?: Record<string, string> };
  await setAgentSeenMany(updates ?? {});
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: `web/app/api/profile/route.ts`**

Reencaminha pro control server local (mesmo padrão de `web/app/api/send/route.ts`). Cobre name/status/picture numa rota.

```typescript
import { NextResponse } from "next/server";
import { CONTROL_URL } from "@/lib/paths";

export const runtime = "nodejs";

interface ProfileBody {
  name?: string;
  status?: string;
  picturePath?: string;
}

async function fwd(rota: string, body: unknown): Promise<void> {
  const res = await fetch(`${CONTROL_URL}${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? `falha em ${rota}`);
}

export async function POST(req: Request) {
  const { name, status, picturePath } = (await req.json()) as ProfileBody;
  if (!name && !status && !picturePath) {
    return NextResponse.json({ error: "nada para editar" }, { status: 400 });
  }
  try {
    if (name) await fwd("/profile/name", { name });
    if (status) await fwd("/profile/status", { status });
    if (picturePath) await fwd("/profile/picture", { path: picturePath });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5: `web/app/api/send-media-json/route.ts`**

Reenvio de mídia já no `DATA_DIR` do container (mediaPath relativo), via JSON. Reencaminha pro control server.

```typescript
import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { CONTROL_URL, safeDataPath } from "@/lib/paths";

export const runtime = "nodejs";

interface Body {
  jid?: string;
  kind?: string;
  path?: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
}

export async function POST(req: Request) {
  const { jid, kind, path, caption, fileName, mimetype } = (await req.json()) as Body;
  if (!jid || !kind || !path) {
    return NextResponse.json({ error: "jid, kind e path são obrigatórios" }, { status: 400 });
  }
  // path é mediaPath relativo dentro do DATA_DIR do container.
  const abs = path.startsWith("/") ? path : safeDataPath(path);
  if (!existsSync(abs)) {
    return NextResponse.json({ error: `arquivo não encontrado: ${path}` }, { status: 400 });
  }
  try {
    const res = await fetch(`${CONTROL_URL}/send-media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jid, kind, path: abs, caption, fileName, mimetype }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return NextResponse.json({ error: data.error ?? "falha no envio" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
```

- [ ] **Step 6: Adicionar `case "autonomo"` em `web/app/api/triage/route.ts`**

Confirmado no código: o handler usa `const { action, slug, value } = body;` e cada case valida o tipo de `value`. Faça TRÊS edições:

(a) Importe `setAutonomo` — a linha de import atual é:
```typescript
import { readTriage, setAlert, setCopilot, setLastSeen, setMuted, setNote, setResolved } from "@/lib/triage";
```
troque para incluir `setAutonomo` (ordem alfabética):
```typescript
import { readTriage, setAlert, setAutonomo, setCopilot, setLastSeen, setMuted, setNote, setResolved } from "@/lib/triage";
```

(b) Adicione `"autonomo"` ao union do `action` na interface `TriagePost`:
```typescript
  action?: "resolved" | "muted" | "note" | "lastSeen" | "copilot" | "alertar" | "autonomo";
```

(c) Adicione o case no switch, espelhando `muted` (exige boolean):
```typescript
    case "autonomo":
      if (typeof value !== "boolean") {
        return NextResponse.json({ error: "value deve ser boolean" }, { status: 400 });
      }
      await setAutonomo(slug, value);
      break;
```

- [ ] **Step 7: Build do painel (verificação — não há unit test de rota)**

Run: `cd web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "api/(groups/summary|contacts/raw|agent-seen|profile|send-media-json|triage)" || echo "sem erro de tipo nas rotas novas"`
Expected: "sem erro de tipo nas rotas novas".

- [ ] **Step 8: Commit**

```bash
git add web/app/api/groups/summary web/app/api/contacts/raw web/app/api/agent-seen web/app/api/profile web/app/api/send-media-json web/app/api/triage/route.ts
git commit -m "feat(mcp-remoto): rotas /api que faltam (summary, contacts/raw, agent-seen, profile, send-media-json, triage autonomo)"
```

---

### Task 3: Data-source — LEITURA (`dsGroupMessages`, `dsListGroups`, `dsTriage`, `dsContacts`, `dsGroupsConfig`, `dsAgentSeen`)

A fachada de leitura: local chama a lib de hoje (passthrough); remoto busca via HTTP. É o coração do "local intocado". TDD com mock de fetch.

**Files:**
- Create: `web/lib/data-source.ts`
- Test: `web/lib/data-source.test.ts`

**Interfaces:**
- Consumes (Task 1): `mcpRemote`, `cloudJson` (de `./cloud`); libs locais `readGroupMessages`/`listGroups` (`./data`), `readTriage` (`./triage`), `buildContacts` (`./contacts`), `readGroupsConfig` (`./config`), `readAgentSeen` (`./agent-seen`).
- Produces (consumido pela Task 5):
  - `dsGroupMessages(slug: string): Promise<MessageView[]>`
  - `dsListGroups(): Promise<GroupSummary[]>`
  - `dsTriage(): Promise<TriageState>`
  - `dsContacts(): Promise<Contacts>`
  - `dsGroupsConfig(): Promise<GroupEntry[]>`
  - `dsAgentSeen(): Promise<Record<string,string>>`

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `web/lib/data-source.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('modo LOCAL (sem flag) — delega à lib, não toca a rede', () => {
  it('dsGroupMessages não chama fetch e devolve o que a lib local devolve', async () => {
    vi.stubEnv('WAC_CLOUD_URL', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.doMock('./data', () => ({
      readGroupMessages: vi.fn(async () => [{ id: 'm1' }]),
      listGroups: vi.fn(async () => []),
    }));
    const { dsGroupMessages } = await import('./data-source');
    expect(await dsGroupMessages('g')).toEqual([{ id: 'm1' }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('modo REMOTO (flag=1) — busca via HTTP', () => {
  beforeEach(() => {
    vi.stubEnv('WAC_MCP_REMOTE', '1');
    vi.stubEnv('WAC_CLOUD_URL', 'https://nuvem.exemplo');
    vi.stubEnv('WAC_CLOUD_USER', 'u');
    vi.stubEnv('WAC_CLOUD_PASS', 'p');
  });

  it('dsGroupMessages chama /api/messages?slug=', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([{ id: 'r1' }]), { status: 200 }));
    const { dsGroupMessages } = await import('./data-source');
    expect(await dsGroupMessages('meu-grupo')).toEqual([{ id: 'r1' }]);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/messages?slug=meu-grupo',
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('dsContacts rehidrata os Maps/Sets de /api/contacts/raw', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          names: [['123', 'Fulano']],
          ownIds: ['999'],
          teamIds: ['123'],
          phones: [['123', '5511999']],
          lids: ['abc'],
          hasSidecar: true,
        }),
        { status: 200 },
      ),
    );
    const { dsContacts } = await import('./data-source');
    const c = await dsContacts();
    expect(c.names.get('123')).toBe('Fulano');
    expect(c.ownIds.has('999')).toBe(true);
    expect(c.teamIds.has('123')).toBe(true);
    expect(c.phones.get('123')).toBe('5511999');
    expect(c.lids.has('abc')).toBe(true);
    expect(c.hasSidecar).toBe(true);
  });

  it('dsTriage busca /api/triage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ autonomo: { g: true } }), { status: 200 }),
    );
    const { dsTriage } = await import('./data-source');
    expect((await dsTriage()).autonomo).toEqual({ g: true });
  });
});
```

- [ ] **Step 2: Rodar — devem FALHAR**

Run: `npx vitest run web/lib/data-source.test.ts`
Expected: FAIL — `Cannot find module './data-source'`.

- [ ] **Step 3: Implementar `web/lib/data-source.ts` (leitura)**

```typescript
import { cloudJson, mcpRemote } from './cloud';
import type { Contacts } from './contacts';
import { buildContacts } from './contacts';
import type { GroupEntry } from './config';
import { readGroupsConfig } from './config';
import type { GroupSummary, MessageView } from './data';
import { listGroups, readGroupMessages } from './data';
import type { TriageState } from './triage';
import { readTriage } from './triage';
import { readAgentSeen } from './agent-seen';

/**
 * Fachada de acesso a dados do MCP. Em modo LOCAL (default) delega às libs de
 * hoje (passthrough — comportamento intocado). Em modo REMOTO (mcpRemote())
 * busca os MESMOS dados via HTTP no painel da nuvem; a lógica de domínio
 * (compact, selectNew, resolveDestino...) continua rodando no MCP.
 */

export async function dsGroupMessages(slug: string): Promise<MessageView[]> {
  if (mcpRemote()) return cloudJson(`/api/messages?slug=${encodeURIComponent(slug)}`);
  return readGroupMessages(slug);
}

export async function dsListGroups(): Promise<GroupSummary[]> {
  if (mcpRemote()) return cloudJson('/api/groups/summary');
  return listGroups();
}

export async function dsTriage(): Promise<TriageState> {
  if (mcpRemote()) return cloudJson('/api/triage');
  return readTriage();
}

/** Shape cru do /api/contacts/raw (Map/Set viram arrays no fio). */
interface ContactsRaw {
  names: [string, string][];
  ownIds: string[];
  teamIds: string[];
  phones: [string, string][];
  lids: string[];
  hasSidecar: boolean;
}

export async function dsContacts(): Promise<Contacts> {
  if (!mcpRemote()) return buildContacts();
  const raw = await cloudJson<ContactsRaw>('/api/contacts/raw');
  return {
    names: new Map(raw.names),
    ownIds: new Set(raw.ownIds),
    teamIds: new Set(raw.teamIds),
    phones: new Map(raw.phones),
    lids: new Set(raw.lids),
    hasSidecar: raw.hasSidecar,
  };
}

export async function dsGroupsConfig(): Promise<GroupEntry[]> {
  if (!mcpRemote()) return readGroupsConfig();
  // No remoto, derivamos os grupos do summary (slug + name bastam pro matchGrupo).
  const summary = await cloudJson<GroupSummary[]>('/api/groups/summary');
  return summary.map((g) => ({ id: g.slug, name: g.name, watch: true }));
}

export async function dsAgentSeen(): Promise<Record<string, string>> {
  if (mcpRemote()) return cloudJson('/api/agent-seen');
  return readAgentSeen();
}
```

> Nota sobre `dsGroupsConfig` no remoto: `matchGrupo` (`web/lib/resolve-grupo.ts`) casa por jid/nome/slug. O `GroupEntry.id` local é o JID; no remoto usamos o `slug` como `id` — `matchGrupo` ainda casa por nome e por slug. Confirme no Step 4 que os testes de `resolve-grupo` não quebram (eles testam a função pura, não esta derivação).

- [ ] **Step 4: Rodar — devem PASSAR + suíte de resolve-grupo intacta**

Run: `npx vitest run web/lib/data-source.test.ts web/lib/resolve-grupo.test.ts`
Expected: PASS (data-source novos + resolve-grupo continua verde).

- [ ] **Step 5: Commit**

```bash
git add web/lib/data-source.ts web/lib/data-source.test.ts
git commit -m "feat(mcp-remoto): data-source leitura (local passthrough / remoto HTTP) testado"
```

---

### Task 4: Data-source — ESCRITA (triage writes, envio, perfil, agent-seen)

As funções de escrita da fachada: local faz o que o MCP faz hoje (set* / fetch CONTROL_URL); remoto faz `cloudPost`. TDD com mock de fetch.

**Files:**
- Modify: `web/lib/data-source.ts` (adicionar writes)
- Modify: `web/lib/data-source.test.ts` (adicionar testes de escrita)

**Interfaces:**
- Consumes (Task 1): `cloudPost`; libs locais `setResolved`/`setMuted`/`setNote`/`setAlert`/`setAutonomo` (`./triage`), `setAgentSeenMany` (`./agent-seen`), `CONTROL_URL` (`./paths`).
- Produces (consumido pela Task 5):
  - `dsSetResolved(slug, value:string)`, `dsSetMuted(slug, value:boolean)`, `dsSetNote(slug, value:string)`, `dsSetAlert(slug, value:boolean)`, `dsSetAutonomo(slug, value:boolean)` — todas `Promise<void>`
  - `dsSetAgentSeen(updates: Record<string,string>): Promise<void>`
  - `dsSend(jid:string, text:string): Promise<void>` (lança em falha)
  - `dsSendMedia(args:{jid,kind,path,caption?,fileName?,mimetype?}): Promise<void>`
  - `dsEditarPerfil(args:{name?,status?,picturePath?}): Promise<void>`

- [ ] **Step 1: Adicionar os testes de escrita (falhando)**

Adicione ao `web/lib/data-source.test.ts`, dentro do bloco `describe('modo REMOTO ...')`:

```typescript
  it('dsSetAutonomo faz POST /api/triage {action:autonomo}', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { dsSetAutonomo } = await import('./data-source');
    await dsSetAutonomo('meu-grupo', true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/triage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'autonomo', slug: 'meu-grupo', value: true }),
      }),
    );
  });

  it('dsSend faz POST /api/send', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { dsSend } = await import('./data-source');
    await dsSend('x@g.us', 'oi');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/send',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ jid: 'x@g.us', text: 'oi' }) }),
    );
  });

  it('dsEditarPerfil faz POST /api/profile', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const { dsEditarPerfil } = await import('./data-source');
    await dsEditarPerfil({ status: 'fora do expediente' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://nuvem.exemplo/api/profile',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ status: 'fora do expediente' }) }),
    );
  });
```

E um teste de modo local pra escrita (não toca rede):

```typescript
describe('escrita LOCAL — delega à lib, sem rede', () => {
  it('dsSetAutonomo chama setAutonomo e não faz fetch', async () => {
    vi.stubEnv('WAC_CLOUD_URL', '');
    const setAutonomo = vi.fn(async () => {});
    vi.doMock('./triage', () => ({ setAutonomo }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { dsSetAutonomo } = await import('./data-source');
    await dsSetAutonomo('g', true);
    expect(setAutonomo).toHaveBeenCalledWith('g', true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar — os novos devem FALHAR**

Run: `npx vitest run web/lib/data-source.test.ts`
Expected: FAIL nos novos (`dsSetAutonomo`/`dsSend`/`dsEditarPerfil` não exportados); os de leitura continuam passando.

- [ ] **Step 3: Implementar os writes em `web/lib/data-source.ts`**

Adicione os imports e as funções. No topo, estenda os imports:

```typescript
import { cloudJson, cloudPost, mcpRemote } from './cloud';
// ... (imports de leitura já existentes) ...
import { readTriage, setAlert, setAutonomo, setMuted, setNote, setResolved } from './triage';
import { readAgentSeen, setAgentSeenMany } from './agent-seen';
import { CONTROL_URL } from './paths';
```

E ao final do arquivo:

```typescript
// ---------- ESCRITA ----------

export async function dsSetResolved(slug: string, value: string): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'resolved', slug, value }); return; }
  return setResolved(slug, value);
}
export async function dsSetMuted(slug: string, value: boolean): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'muted', slug, value }); return; }
  return setMuted(slug, value);
}
export async function dsSetNote(slug: string, value: string): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'note', slug, value }); return; }
  return setNote(slug, value);
}
export async function dsSetAlert(slug: string, value: boolean): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'alertar', slug, value }); return; }
  return setAlert(slug, value);
}
export async function dsSetAutonomo(slug: string, value: boolean): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'autonomo', slug, value }); return; }
  return setAutonomo(slug, value);
}

export async function dsSetAgentSeen(updates: Record<string, string>): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/agent-seen', { updates }); return; }
  return setAgentSeenMany(updates);
}

/** Envio de texto: remoto via /api/send; local direto no control server. */
export async function dsSend(jid: string, text: string): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/send', { jid, text }); return; }
  const res = await fetch(`${CONTROL_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, text }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'falha no envio');
}

interface SendMediaArgs {
  jid: string;
  kind: string;
  path: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
}
export async function dsSendMedia(args: SendMediaArgs): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/send-media-json', args); return; }
  const res = await fetch(`${CONTROL_URL}/send-media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'falha no envio');
}

interface PerfilArgs {
  name?: string;
  status?: string;
  picturePath?: string;
}
export async function dsEditarPerfil(args: PerfilArgs): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/profile', args); return; }
  const fwd = async (rota: string, body: unknown): Promise<void> => {
    const res = await fetch(`${CONTROL_URL}${rota}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) throw new Error(data.error ?? `falha em ${rota}`);
  };
  if (args.name) await fwd('/profile/name', { name: args.name });
  if (args.status) await fwd('/profile/status', { status: args.status });
  if (args.picturePath) await fwd('/profile/picture', { path: args.picturePath });
}
```

> Atenção: o import de `./triage` agora também traz `readTriage` (já usado na leitura) + os setters. O import de `./agent-seen` traz `readAgentSeen` (leitura) + `setAgentSeenMany`. Consolide numa linha cada, sem duplicar.

- [ ] **Step 4: Rodar — devem PASSAR (suíte do data-source inteira)**

Run: `npx vitest run web/lib/data-source.test.ts`
Expected: PASS (leitura + escrita).

- [ ] **Step 5: Commit**

```bash
git add web/lib/data-source.ts web/lib/data-source.test.ts
git commit -m "feat(mcp-remoto): data-source escrita (triage/envio/perfil) testado"
```

---

### Task 5: Ligar o `server.ts` na fachada

Troca, dentro de `web/mcp/server.ts`, as chamadas diretas às libs pelas funções `ds*`. O corpo das tools quase não muda — só a fonte. Esta é a task que faz o modo remoto valer pra todas as tools de uma vez. Sem unit test próprio (o MCP é validado por driver/integração); verificação por carregamento + suíte inteira verde.

**Files:**
- Modify: `web/mcp/server.ts`

**Interfaces:**
- Consumes (Tasks 3-4): todas as `ds*` de `../lib/data-source`.

- [ ] **Step 1: Trocar os imports de LEITURA**

Em `web/mcp/server.ts`, adicione `import { ... } from "../lib/data-source";` com as `ds*` e troque os usos. Mapa exato:
- `readGroupMessages(x)` → `dsGroupMessages(x)` (em `ler_mensagens`, `buscar`, `resumo_do_dia`, `novidades`, `resolverMidia`).
- `listGroups()` → `dsListGroups()` (em `listar_grupos`, `buscar`).
- `readGroupsConfig()` → `dsGroupsConfig()` (em `resolveDestino`, `listar_grupos`).
- Dentro do helper `contacts()` (o cache TTL): `buildContacts()` → `dsContacts()`.
- `readTriage()` → `dsTriage()` (em `ler_notas`, `estado_triagem`, `novidades`, e onde `isAutonomo` lê — ver nota).
- `readAgentSeen()` → `dsAgentSeen()`; `setAgentSeenMany(u)` → `dsSetAgentSeen(u)` (em `novidades`).

> **Nota `isAutonomo` (confirmado no código):** `isAutonomo(slug)` faz `(await readTriage()).autonomo[slugify(slug)] === true` (`web/lib/triage.ts:120`, `slugify` de `./slug`). Hoje `responder` chama `isAutonomo(grupo)`. No remoto, `readTriage` precisa virar `dsTriage`. Como `isAutonomo` é uma função de uma linha sobre `readTriage`, NÃO mude `isAutonomo` — em vez disso, no `responder`, derive direto da fachada: importe `slugify` de `../lib/slug` e troque `(await isAutonomo(grupo))` por `((await dsTriage()).autonomo[slugify(grupo)] === true)`. Isso funciona em AMBOS os modos (local: `dsTriage`→`readTriage` disco; remoto: `dsTriage`→`/api/triage`). Resultado idêntico ao `isAutonomo` atual. Remova o import de `isAutonomo` se ele não for mais usado em outro lugar (confira com grep antes).

- [ ] **Step 2: Trocar os imports/usos de ESCRITA**

- `setResolved` → `dsSetResolved` (`marcar_resolvido`).
- `setMuted` → `dsSetMuted` (`silenciar_grupo`).
- `setNote` → `dsSetNote` (`anotar`).
- `setAlert` → `dsSetAlert` (`alertar_chat`).
- `setAutonomo` → `dsSetAutonomo` (`definir_modo`).
- Em `responder`: o bloco `fetch(`${CONTROL_URL}/send`...)` → `await dsSend(jid, texto)` (e trate erro com try/catch como hoje).
- Em `responder_midia`: o bloco `fetch(`${CONTROL_URL}/send-media`...)` → `await dsSendMedia({ jid, kind, path: abs, caption, fileName, mimetype })`.
- Em `editar_perfil`/`postProfile`: trocar os 3 `postProfile(...)` por `await dsEditarPerfil({ nome→name, recado→status, foto→picturePath })`. Resolva `foto` (absoluto vs `safeDataPath`) ANTES, como hoje, e passe como `picturePath`.

- [ ] **Step 3: Verificar que o MCP carrega (modo local, sem flag) sem erro**

Run: `cd /Users/rodrigosumioshi/projetos/empresa-sumioshi/whatsapp-automation/web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "mcp/server" || echo "sem erro de tipo em mcp/server.ts"`
Expected: "sem erro de tipo em mcp/server.ts".

- [ ] **Step 4: Verificar carregamento em runtime (driver, modo local)**

Run: `cd /Users/rodrigosumioshi/projetos/empresa-sumioshi/whatsapp-automation && node .claude/skills/run-whatsapp-automation/driver.mjs 2>&1 | grep -c "editar_perfil\|listar_grupos" || true`
Expected: ≥1 (o server sobe e lista as tools — prova que os imports resolvem; modo local intocado pois sem `WAC_MCP_REMOTE`).

- [ ] **Step 5: Commit**

```bash
git add web/mcp/server.ts
git commit -m "feat(mcp-remoto): server.ts consome a fachada data-source (local intocado)"
```

---

### Task 6: Docs — `.env.example`, `.mcp.json.example`, README

Documenta o modo remoto para qualquer pessoa publicar. Sem teste (docs).

**Files:**
- Modify: `.env.example` (se existir)
- Modify: `.mcp.json.example`
- Modify: `README.md`

- [ ] **Step 1: `.env.example`**

Run: `test -f .env.example && echo EXISTE || echo NAO`. Se EXISTE, adicione ao final:

```bash
# MCP remoto: aponta o MCP para o painel na nuvem (em vez de disco local).
# Ligue WAC_MCP_REMOTE=1 e configure os WAC_CLOUD_* abaixo com a URL do SEU painel
# Railway e o Basic Auth (PANEL_USER/PANEL_PASS daquele container).
# WAC_MCP_REMOTE=1
# WAC_CLOUD_URL=https://seu-coletor-production-xxxx.up.railway.app
# WAC_CLOUD_USER=seu_usuario_do_painel
# WAC_CLOUD_PASS=sua_senha_do_painel
```

- [ ] **Step 2: `.mcp.json.example`**

Leia o arquivo e adicione um comentário/exemplo (em JSON não há comentário; use uma chave `_comment` ou documente no README) mostrando o bloco `env` com `WAC_MCP_REMOTE`/`WAC_CLOUD_*` no servidor `whatsapp-collector`. Se o formato não aceitar comentário, deixe um segundo arquivo `.mcp.json.remote.example` com o bloco env preenchido de placeholders.

- [ ] **Step 3: README — seção "Modo remoto (multi-tenant)"**

Adicione uma subseção curta após a seção do MCP explicando: por padrão o MCP é local (lê disco do próprio Mac); para usar um coletor que roda na nuvem (Railway), set `WAC_MCP_REMOTE=1` + `WAC_CLOUD_URL/USER/PASS` apontando para o painel daquele container. Cada pessoa aponta para o seu. Os dois modos coexistem (um Mac local, outro remoto). Mencione que o control server continua só em 127.0.0.1 dentro do container — o acesso externo é só pelo painel autenticado.

- [ ] **Step 4: Commit**

```bash
git add .env.example .mcp.json.example .mcp.json.remote.example README.md 2>/dev/null || true
git commit -m "docs(mcp-remoto): documenta WAC_MCP_REMOTE + WAC_CLOUD_* e os dois modos"
```

---

### Task 7: Verificação final

Garante que nada quebrou — a restrição dura.

**Files:** nenhum.

- [ ] **Step 1: Suíte inteira**

Run: `npm test`
Expected: PASS — 84 existentes + os novos de `cloud.test.ts` e `data-source.test.ts`, sem regressão.

- [ ] **Step 2: Build do coletor**

Run: `npm run build`
Expected: `tsc` limpo (o coletor não foi tocado, mas confirma).

- [ ] **Step 3: Type-check do painel (rotas novas + server.ts)**

Run: `cd web && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20`
Expected: sem erros novos nas rotas criadas nem em `mcp/server.ts`.

- [ ] **Step 4: Prova de coexistência (manual, anotar pro review)**

Anote para validação quando houver um painel de teste:
- SEM `WAC_MCP_REMOTE`: `driver.mjs call listar_grupos` lê do disco local (como hoje).
- COM `WAC_MCP_REMOTE=1` + `WAC_CLOUD_*` apontando pro painel de teste: o mesmo comando vem da nuvem; `responder` envia pelo container remoto; `editar_perfil` aplica via `/api/profile`.

---

## Self-Review

**1. Spec coverage:**
- Interruptor `WAC_MCP_REMOTE` reusando `WAC_CLOUD_*` → Task 1 (`mcpRemote`). ✓
- Camada data-source local/remoto → Tasks 3 (leitura) + 4 (escrita). ✓
- Rotas que faltam (groups/summary, contacts/raw, agent-seen, profile, send-media-json, triage autonomo) → Task 2. ✓
- server.ts consumindo a fachada (todas as tools) → Task 5. ✓
- Mídia remota (ver_imagem/transcrever via ensureLocalMedia ao trocar resolverMidia→dsGroupMessages) → Task 5 Step 1 (resolverMidia usa dsGroupMessages) + Task 7 Step 4. ✓
- Rehidratação dos Maps de contacts → Task 2 Step 2 (rota raw) + Task 3 (dsContacts). ✓
- Local intocado / default desligado → Global Constraints + testes "modo local não chama fetch" (Tasks 3, 4). ✓
- Docs → Task 6. ✓
- Verificação 84 testes verdes → Task 7. ✓

**2. Placeholder scan:** Os pontos "confirme a normalização de slug de isAutonomo" (Task 5 Step 1) e "confirme o nome do param value no switch de triage" (Task 2 Step 6) são verificações deliberadas contra o código real (têm o comando/arquivo a checar), não placeholders. Todo step de código tem o código completo.

**3. Type consistency:**
- `Contacts` (6 campos) consistente entre rota raw (Task 2), `ContactsRaw`/`dsContacts` (Task 3) e teste (Task 3). ✓
- `ds*` nomes idênticos entre data-source (Tasks 3-4), testes e server.ts (Task 5). ✓
- `cloudJson`/`cloudPost`/`mcpRemote` mesmos nomes em Task 1 e consumidores. ✓
- `dsSend`/`dsSendMedia`/`dsEditarPerfil` args batem entre data-source (Task 4) e os usos em server.ts (Task 5). ✓
