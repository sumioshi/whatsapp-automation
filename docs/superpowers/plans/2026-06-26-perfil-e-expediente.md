# Edição de perfil + recado de expediente — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar o perfil do WhatsApp (nome, recado/"sobre", foto) pela ferramenta — manualmente, pela IA quando o operador pede, e automaticamente — e trocar o recado sozinho fora do expediente.

**Architecture:** Ports & Adapters preservado. O gateway Baileys (`src/whatsapp/gateway.ts`) ganha 3 métodos de escrita de perfil; a porta `WhatsAppGateway` (`src/core/ports.ts`) os declara; a API de controle (`src/control/server.ts`, só 127.0.0.1) expõe `POST /profile/name|status|picture`; o MCP (`web/mcp/server.ts`) ganha a tool `editar_perfil` que bate nesses endpoints (mesmo padrão de `responder`). O agendador de expediente é um **script standalone** (`scripts/expediente-scheduler.ts`) — igual a `scripts/notifier.ts`/`scripts/sync-pull.ts`, que já importam de `web/lib` e chamam APIs — com o núcleo puro e testável em `scripts/lib/expediente.ts`. O agendador chama o control server por HTTP; **não** mexe no processo do coletor além dos endpoints.

**Tech Stack:** TypeScript (ESM), Baileys 7.0.0-rc13, Node `node:http`, Zod (validação de env no coletor), Vitest (raiz, cobre `web/lib/**` e `scripts/**`), `tsx` para rodar scripts.

## Global Constraints

- **Licença/headers:** todo arquivo novo em `src/` leva o header Apache-2.0 (bloco de 15 linhas idêntico ao topo de `src/index.ts`). Arquivos em `web/lib/`, `web/mcp/` e `scripts/` seguem o padrão do diretório (a maioria **sem** header; só replique header se o vizinho imediato tiver — `web/mcp/server.ts` tem, `web/lib/*.ts` e `scripts/*.ts` não).
- **Control server é só 127.0.0.1**: nunca exponha em 0.0.0.0. Os novos endpoints herdam isso de `startControlServer` (já faz `server.listen(port, '127.0.0.1')`).
- **Path traversal**: qualquer endpoint que receba caminho de arquivo (a foto) DEVE validar com `isWithin(path, allowedDirs)` antes de usar — mesmo padrão de `/send-media`. `allowedDirs` já é `[env.DATA_DIR, tmpdir()]`.
- **Confirmação (convenção, não trava)**: a tool `editar_perfil` edita perfil público; a descrição instrui a IA a MOSTRAR o que vai mudar e ter o OK do operador antes de chamar — mesma convenção de `responder`/`definir_modo`. Não é trava de código.
- **Antispam**: o agendador NUNCA reescreve o recado se o estado (dentro/fora) não mudou. Só troca na transição.
- **Timezone**: o expediente usa o timezone do config (`America/Sao_Paulo` por padrão), via `Intl.DateTimeFormat` — nunca a TZ do processo (o container roda UTC).
- **Idioma**: nomes de símbolo, comentários e mensagens de log/erro em pt-BR (com acentuação correta), seguindo o resto do código.
- **Vitest da raiz** só enxerga `scripts/**/*.test.ts` e `web/lib/**/*.test.ts` (ver `vitest.config.ts`). Todo teste deste plano fica num desses dois lugares. `src/**` não tem testes (validação manual).

---

### Task 1: Métodos de perfil no gateway + porta

Adiciona a capacidade de escrita de perfil ao adapter Baileys e declara na porta. Sem isso, nada mais consegue editar. Não há teste automatizado em `src/` (é I/O com o socket real) — validação é por compilação (`tsc`) e, ao final do plano, manual.

**Files:**
- Modify: `src/core/ports.ts` (interface `WhatsAppGateway`, após `getAvatarUrl`, ~linha 74)
- Modify: `src/whatsapp/gateway.ts` (classe `BaileysGateway`, métodos novos após `getAvatarUrl`, ~linha 260)

**Interfaces:**
- Consumes: `this.sock` (`WASocket | null`) já existente na classe; lança `'Coletor não está conectado ao WhatsApp.'` quando null (mesma mensagem de `sendText`).
- Produces (porta `WhatsAppGateway`, consumidas pela Task 2):
  - `updateProfileName(nome: string): Promise<void>`
  - `updateProfileStatus(recado: string): Promise<void>`
  - `updateProfilePicture(path: string): Promise<void>` — recebe **caminho** de arquivo (não Buffer); o gateway lê via `{ url: path }`, igual `sendMedia` faz com mídia.

- [ ] **Step 1: Declarar os 3 métodos na porta**

Em `src/core/ports.ts`, dentro de `interface WhatsAppGateway`, logo após o bloco de `getAvatarUrl(...)` (a última declaração, ~linha 74), adicione:

```typescript
  /** Edita o nome do perfil (push name). Lança se desconectado. */
  updateProfileName(nome: string): Promise<void>;
  /** Edita o recado/"sobre" do perfil (status). Lança se desconectado. */
  updateProfileStatus(recado: string): Promise<void>;
  /**
   * Edita a foto do perfil a partir de um caminho de arquivo local.
   * O gateway lê o arquivo via `{ url: path }` (igual ao envio de mídia).
   * Lança se desconectado.
   */
  updateProfilePicture(path: string): Promise<void>;
```

- [ ] **Step 2: Implementar no `BaileysGateway`**

Em `src/whatsapp/gateway.ts`, logo após o método `getAvatarUrl(...)` terminar (a chave de fechamento em ~linha 260, antes de `async start()`), adicione:

```typescript
  async updateProfileName(nome: string): Promise<void> {
    if (!this.sock) throw new Error('Coletor não está conectado ao WhatsApp.');
    await this.sock.updateProfileName(nome);
  }

  async updateProfileStatus(recado: string): Promise<void> {
    if (!this.sock) throw new Error('Coletor não está conectado ao WhatsApp.');
    await this.sock.updateProfileStatus(recado);
  }

  async updateProfilePicture(path: string): Promise<void> {
    if (!this.sock) throw new Error('Coletor não está conectado ao WhatsApp.');
    // Baileys aceita `{ url }` (lê do disco) igual ao envio de mídia.
    await this.sock.updateProfilePicture(this.sock.user?.id ?? '', { url: path });
  }
```

> Nota Baileys 7.x: `updateProfilePicture(jid, content)` — o `jid` é o do próprio usuário (`sock.user.id`); para a própria conta o WhatsApp aceita o jid próprio. `updateProfileName(name)` e `updateProfileStatus(status)` levam só o texto.

- [ ] **Step 3: Compilar o coletor para garantir tipos**

Run: `npm run build` (na raiz)
Expected: build passa sem erro de tipo. Se o TS reclamar que `updateProfilePicture` não existe em `WASocket`, confirme a assinatura com `grep -rn "updateProfilePicture\|updateProfileStatus\|updateProfileName" node_modules/baileys/lib/**/*.d.ts | head` e ajuste a chamada conforme a definição real da versão instalada (a forma `(jid, { url })` é a esperada na 7.x).

- [ ] **Step 4: Commit**

```bash
git add src/core/ports.ts src/whatsapp/gateway.ts
git commit -m "feat(gateway): métodos de edição de perfil (nome/recado/foto)"
```

---

### Task 2: Endpoints `/profile/*` na API de controle

Expõe os 3 métodos do gateway via HTTP local, para o MCP e o agendador chamarem. Segue o padrão exato de `/send` e `/send-media` (validação, `isWithin` para a foto, respostas `{ ok }`/`{ error }`).

**Files:**
- Modify: `src/control/server.ts` (novos `if` de rota dentro de `createServer`, antes do `json(404, ...)` final ~linha 161; nova interface de body no topo ~linha 36)

**Interfaces:**
- Consumes (da Task 1): `gateway.updateProfileName/Status/Picture`.
- Produces (consumidas pelas Tasks 3 e 5) — três rotas POST, todas respondendo `200 { ok: true }` em sucesso e `4xx/500 { error }` em falha:
  - `POST /profile/name`    body `{ name: string }`
  - `POST /profile/status`  body `{ status: string }`
  - `POST /profile/picture` body `{ path: string }` (caminho dentro de `allowedDirs`)

- [ ] **Step 1: Adicionar a interface de body**

Em `src/control/server.ts`, junto às outras interfaces de body (após `SendMediaBody`, ~linha 36), adicione:

```typescript
interface ProfileNameBody {
  name?: string;
}
interface ProfileStatusBody {
  status?: string;
}
interface ProfilePictureBody {
  path?: string;
}
```

- [ ] **Step 2: Adicionar as 3 rotas**

Em `src/control/server.ts`, dentro do `createServer((req, res) => { ... })`, imediatamente antes do `json(404, { error: 'rota não encontrada' });` final (~linha 161), insira:

```typescript
    if (req.method === 'POST' && req.url === '/profile/name') {
      readJson(req)
        .then(async (parsed) => {
          const { name } = (parsed ?? {}) as ProfileNameBody;
          if (!name || !name.trim()) {
            json(400, { error: 'name é obrigatório' });
            return;
          }
          await gateway.updateProfileName(name.trim());
          logger.info('👤 Nome do perfil atualizado via API de controle.');
          json(200, { ok: true });
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/profile/status') {
      readJson(req)
        .then(async (parsed) => {
          const { status } = (parsed ?? {}) as ProfileStatusBody;
          if (typeof status !== 'string' || !status.trim()) {
            json(400, { error: 'status é obrigatório' });
            return;
          }
          await gateway.updateProfileStatus(status.trim());
          logger.info('💬 Recado do perfil atualizado via API de controle.');
          json(200, { ok: true });
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/profile/picture') {
      readJson(req)
        .then(async (parsed) => {
          const { path } = (parsed ?? {}) as ProfilePictureBody;
          if (!path) {
            json(400, { error: 'path é obrigatório' });
            return;
          }
          if (!isWithin(path, allowed)) {
            json(400, { error: 'path fora do diretório permitido' });
            return;
          }
          if (!existsSync(path)) {
            json(400, { error: `arquivo não encontrado: ${path}` });
            return;
          }
          await gateway.updateProfilePicture(path);
          logger.info('🖼️  Foto do perfil atualizada via API de controle.');
          json(200, { ok: true });
        })
        .catch((err) => json(500, { error: err instanceof Error ? err.message : 'erro' }));
      return;
    }
```

> `isWithin`, `existsSync`, `allowed` (a versão resolvida de `allowedDirs`) e `logger` já estão no escopo do arquivo — `allowed` é criado em `startControlServer` na linha `const allowed = allowedDirs.map((d) => resolve(d));`.

- [ ] **Step 3: Compilar**

Run: `npm run build`
Expected: passa sem erro.

- [ ] **Step 4: Commit**

```bash
git add src/control/server.ts
git commit -m "feat(control): endpoints POST /profile/name|status|picture"
```

---

### Task 3: Tool MCP `editar_perfil`

A IA (e o painel, via mesma API) edita o perfil quando o operador pede. Espelha o `responder`: resolve nada (não tem destino), bate no control server, devolve `ok`/`fail`. A descrição instrui confirmação antes de chamar.

**Files:**
- Modify: `web/mcp/server.ts` (novo `server.registerTool("editar_perfil", ...)`, junto aos outros — logo após o bloco de `responder_midia`, ~linha 575)

**Interfaces:**
- Consumes (da Task 2): `POST {CONTROL_URL}/profile/name|status|picture`. `CONTROL_URL`, `safeDataPath`, `ok`, `fail` já importados/definidos no arquivo.
- Produces: a tool `editar_perfil` (chamada pela IA). Input Zod: `{ nome?: string; recado?: string; foto?: string }` — `foto` é caminho absoluto OU mediaPath relativo (resolvido com `safeDataPath`, igual `responder_midia`).

- [ ] **Step 1: Registrar a tool**

Em `web/mcp/server.ts`, logo após o fechamento de `server.registerTool("responder_midia", ...)` (a linha `);` em ~linha 574) e antes de `server.registerTool("marcar_resolvido", ...)`, insira:

```typescript
server.registerTool(
  "editar_perfil",
  {
    description:
      "Edita o PERFIL do WhatsApp do operador: nome, recado/'sobre' (status) e/ou foto. " +
      "Passe só os campos que quer mudar. 'foto' é caminho absoluto de imagem OU o mediaPath de uma mensagem recebida. " +
      "CONFIRMAÇÃO: o perfil é PÚBLICO (todo contato vê). Você DEVE mostrar ao operador o que vai mudar e ter o OK ANTES de chamar — " +
      "mesma convenção do 'responder'. Não é trava de código; não burle. " +
      "LIMITE: catálogo, localização, link e horário-oficial do business são read-only no WhatsApp (não editáveis por aqui).",
    inputSchema: {
      nome: z.string().optional().describe("novo nome do perfil (push name)"),
      recado: z.string().optional().describe("novo recado/'sobre' (status do perfil)"),
      foto: z
        .string()
        .optional()
        .describe("caminho absoluto de uma imagem OU mediaPath relativo (de uma mensagem recebida)"),
    },
  },
  async ({ nome, recado, foto }) => {
    if (!nome && !recado && !foto) {
      return fail("nada para editar: passe nome, recado e/ou foto");
    }
    const aplicado: string[] = [];
    try {
      if (nome) {
        await postProfile("/profile/name", { name: nome });
        aplicado.push("nome");
      }
      if (recado) {
        await postProfile("/profile/status", { status: recado });
        aplicado.push("recado");
      }
      if (foto) {
        const abs = foto.startsWith("/") ? foto : safeDataPath(foto);
        await postProfile("/profile/picture", { path: abs });
        aplicado.push("foto");
      }
      return ok({ aplicado }, `Perfil atualizado (${aplicado.join(", ")}).`);
    } catch (e) {
      const falha = e instanceof Error ? e.message : "coletor offline?";
      return fail(
        aplicado.length
          ? `parcial — aplicado: ${aplicado.join(", ")}; falhou no resto: ${falha}`
          : falha,
      );
    }
  },
);
```

- [ ] **Step 2: Adicionar o helper `postProfile`**

A tool usa um helper `postProfile`. Adicione-o uma vez, junto aos helpers do topo do arquivo (após a função `ok(...)`, ~linha 120):

```typescript
/** POST num endpoint /profile/* do control server; lança Error com a mensagem do servidor se falhar. */
async function postProfile(rota: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${CONTROL_URL}${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? `falha em ${rota}`);
}
```

- [ ] **Step 3: Type-check do MCP**

Run: `cd web && npx tsc --noEmit -p tsconfig.json`
Expected: sem erros. (Se o projeto não tiver `tsc` configurado pro MCP, rode `cd web && npx tsc --noEmit web/mcp/server.ts` não — use o tsconfig; em último caso confie no `next build`/lint. O objetivo é só pegar erro de tipo óbvio.)

- [ ] **Step 4: Commit**

```bash
git add web/mcp/server.ts
git commit -m "feat(mcp): tool editar_perfil (nome/recado/foto) com confirmação"
```

---

### Task 4: Núcleo puro do expediente (`estadoExpediente` + `proximaTransicao`)

A lógica testável do agendador, isolada de I/O. Decide se um instante está DENTRO ou FORA do expediente, dada a config. É o coração da Parte 2.

**Files:**
- Create: `scripts/lib/expediente.ts`
- Test: `scripts/lib/expediente.test.ts`

**Interfaces:**
- Produces (consumidas pela Task 5):
  - `type DiaSemana = 'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab'`
  - `interface ExpedienteConfig { ativo: boolean; timezone: string; dias: Partial<Record<DiaSemana, [string, string]>>; recado_dentro: string; recado_fora: string; }`
  - `function estadoExpediente(agora: Date, cfg: ExpedienteConfig): 'dentro' | 'fora'` — usa `Intl.DateTimeFormat` com `cfg.timezone` para extrair dia-da-semana e HH:MM no fuso certo; `'dentro'` se o horário cair na faixa `[abre, fecha)` do dia; dia ausente ou faixa vazia ⇒ `'fora'`.
  - `function recadoPara(estado: 'dentro' | 'fora', cfg: ExpedienteConfig): string`

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `scripts/lib/expediente.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { estadoExpediente, recadoPara, type ExpedienteConfig } from './expediente';

const base: ExpedienteConfig = {
  ativo: true,
  timezone: 'America/Sao_Paulo',
  dias: {
    seg: ['09:00', '18:00'],
    ter: ['09:00', '18:00'],
    qua: ['09:00', '18:00'],
    qui: ['09:00', '18:00'],
    sex: ['09:00', '18:00'],
  },
  recado_dentro: 'Disponível',
  recado_fora: 'Fora do expediente',
};

// Helper: cria um Date a partir de um horário em São Paulo (UTC-3, sem horário de verão hoje).
// 2026-06-26 é uma sexta-feira.
function spt(iso: string): Date {
  // iso no formato 'YYYY-MM-DDTHH:MM' interpretado como horário de Brasília (UTC-3)
  return new Date(`${iso}:00-03:00`);
}

describe('estadoExpediente', () => {
  it('dentro: sexta 10:00 em dia útil com faixa 09-18', () => {
    expect(estadoExpediente(spt('2026-06-26T10:00'), base)).toBe('dentro');
  });

  it('fora: sexta 08:59 antes de abrir', () => {
    expect(estadoExpediente(spt('2026-06-26T08:59'), base)).toBe('fora');
  });

  it('fora: sexta 18:00 no fechamento (faixa é [abre, fecha))', () => {
    expect(estadoExpediente(spt('2026-06-26T18:00'), base)).toBe('fora');
  });

  it('dentro: sexta 17:59 ainda dentro', () => {
    expect(estadoExpediente(spt('2026-06-26T17:59'), base)).toBe('dentro');
  });

  it('fora: sábado o dia todo (dia ausente na config)', () => {
    // 2026-06-27 é sábado
    expect(estadoExpediente(spt('2026-06-27T12:00'), base)).toBe('fora');
  });

  it('respeita o timezone do config: o mesmo instante UTC muda de estado conforme a TZ', () => {
    // 2026-06-26T11:30Z = 08:30 em São Paulo (fora) mas 11:30 em Lisboa (dentro, se TZ fosse Europe/Lisbon)
    const instante = new Date('2026-06-26T11:30:00Z');
    expect(estadoExpediente(instante, base)).toBe('fora'); // 08:30 BRT
    expect(estadoExpediente(instante, { ...base, timezone: 'Europe/Lisbon' })).toBe('dentro'); // 12:30 WEST
  });

  it('faixa vazia [] no dia = fora o dia todo', () => {
    const cfg: ExpedienteConfig = { ...base, dias: { ...base.dias, sex: undefined } };
    expect(estadoExpediente(spt('2026-06-26T10:00'), cfg)).toBe('fora');
  });
});

describe('recadoPara', () => {
  it('dentro → recado_dentro', () => {
    expect(recadoPara('dentro', base)).toBe('Disponível');
  });
  it('fora → recado_fora', () => {
    expect(recadoPara('fora', base)).toBe('Fora do expediente');
  });
});
```

- [ ] **Step 2: Rodar os testes — devem FALHAR**

Run: `npx vitest run scripts/lib/expediente.test.ts`
Expected: FAIL — `Cannot find module './expediente'` (o módulo ainda não existe).

- [ ] **Step 3: Implementar `scripts/lib/expediente.ts`**

```typescript
export type DiaSemana = 'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab';

/** Config do recado automático de expediente. Vive em `<DATA_DIR>/expediente.json`. */
export interface ExpedienteConfig {
  /** Liga/desliga o agendador. */
  ativo: boolean;
  /** Fuso para interpretar os horários (ex.: 'America/Sao_Paulo'). */
  timezone: string;
  /**
   * Faixa [abre, fecha) por dia da semana, no formato 'HH:MM'. Dia ausente ou
   * faixa undefined = fora o dia todo (ex.: sáb/dom sem entrada = sempre fora).
   */
  dias: Partial<Record<DiaSemana, [string, string]>>;
  /** Recado aplicado quando DENTRO do expediente. */
  recado_dentro: string;
  /** Recado aplicado quando FORA do expediente. */
  recado_fora: string;
}

const ORDEM_DIAS: DiaSemana[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

/** Extrai {dia, minutos-desde-meia-noite} de um instante NO fuso pedido. */
function noFuso(agora: Date, timezone: string): { dia: DiaSemana; minutos: number } {
  // 'en-US' com weekday short dá 'Mon'/'Tue'/...; mapeamos via getUTCDay sobre um
  // instante reconstruído? Mais robusto: usar Intl com as partes e o weekday.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(agora);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  let hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  // Intl pode devolver '24' à meia-noite em alguns ambientes; normaliza.
  if (hh === 24) hh = 0;
  const mapa: Record<string, DiaSemana> = {
    Sun: 'dom',
    Mon: 'seg',
    Tue: 'ter',
    Wed: 'qua',
    Thu: 'qui',
    Fri: 'sex',
    Sat: 'sab',
  };
  return { dia: mapa[wd] ?? 'dom', minutos: hh * 60 + mm };
}

/** Converte 'HH:MM' em minutos desde a meia-noite. */
function hhmmEmMin(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 'dentro' se `agora` (no fuso do config) cai na faixa [abre, fecha) do dia
 * correspondente; senão 'fora'. Dia ausente ou faixa indefinida = 'fora'.
 */
export function estadoExpediente(agora: Date, cfg: ExpedienteConfig): 'dentro' | 'fora' {
  const { dia, minutos } = noFuso(agora, cfg.timezone);
  const faixa = cfg.dias[dia];
  if (!faixa || faixa.length !== 2) return 'fora';
  const abre = hhmmEmMin(faixa[0]);
  const fecha = hhmmEmMin(faixa[1]);
  return minutos >= abre && minutos < fecha ? 'dentro' : 'fora';
}

/** O recado correspondente ao estado. */
export function recadoPara(estado: 'dentro' | 'fora', cfg: ExpedienteConfig): string {
  return estado === 'dentro' ? cfg.recado_dentro : cfg.recado_fora;
}

/** Exportado só para manter `ORDEM_DIAS` referenciada (ordem canônica dos dias). */
export const DIAS_SEMANA = ORDEM_DIAS;
```

- [ ] **Step 4: Rodar os testes — devem PASSAR**

Run: `npx vitest run scripts/lib/expediente.test.ts`
Expected: PASS (todos os casos verdes).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/expediente.ts scripts/lib/expediente.test.ts
git commit -m "feat(expediente): núcleo puro estadoExpediente + recadoPara (testado)"
```

---

### Task 5: Persistência do config + estado, e leitura com defaults

Lê/escreve `expediente.json` (config do usuário) e `.expediente-state.json` (último estado aplicado, para detectar transição). Funções puras de I/O sobre arquivo, testáveis com diretório temporário.

**Files:**
- Create: `scripts/lib/expediente-store.ts`
- Test: `scripts/lib/expediente-store.test.ts`

**Interfaces:**
- Consumes (da Task 4): `ExpedienteConfig`, `DiaSemana`.
- Produces (consumidas pela Task 6):
  - `const EXPEDIENTE_DEFAULT: ExpedienteConfig` — `ativo: false` (desligado até o operador configurar), TZ `America/Sao_Paulo`, dias seg–sex 09:00–18:00, recados padrão.
  - `function lerExpediente(dataDir: string): Promise<ExpedienteConfig>` — lê `<dataDir>/expediente.json`, faz merge com o default (arquivo ausente ⇒ default).
  - `function lerEstadoAplicado(dataDir: string): Promise<'dentro' | 'fora' | null>` — lê `<dataDir>/.expediente-state.json`; `null` se nunca aplicado.
  - `function gravarEstadoAplicado(dataDir: string, estado: 'dentro' | 'fora'): Promise<void>` — escrita atômica.

- [ ] **Step 1: Escrever os testes (falhando)**

Crie `scripts/lib/expediente-store.test.ts`:

```typescript
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXPEDIENTE_DEFAULT,
  gravarEstadoAplicado,
  lerEstadoAplicado,
  lerExpediente,
} from './expediente-store';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wac-exp-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('lerExpediente', () => {
  it('arquivo ausente → default (ativo:false)', async () => {
    const cfg = await lerExpediente(dir);
    expect(cfg.ativo).toBe(false);
    expect(cfg.timezone).toBe(EXPEDIENTE_DEFAULT.timezone);
    expect(cfg.dias.seg).toEqual(['09:00', '18:00']);
  });

  it('merge: arquivo parcial preenche o resto com default', async () => {
    await writeFile(
      join(dir, 'expediente.json'),
      JSON.stringify({ ativo: true, recado_fora: 'Volto segunda' }),
      'utf8',
    );
    const cfg = await lerExpediente(dir);
    expect(cfg.ativo).toBe(true);
    expect(cfg.recado_fora).toBe('Volto segunda');
    // não veio no arquivo → default
    expect(cfg.timezone).toBe(EXPEDIENTE_DEFAULT.timezone);
    expect(cfg.recado_dentro).toBe(EXPEDIENTE_DEFAULT.recado_dentro);
  });

  it('JSON inválido → default (não quebra)', async () => {
    await writeFile(join(dir, 'expediente.json'), '{ não é json', 'utf8');
    const cfg = await lerExpediente(dir);
    expect(cfg.ativo).toBe(false);
  });
});

describe('estado aplicado', () => {
  it('null quando nunca gravado', async () => {
    expect(await lerEstadoAplicado(dir)).toBeNull();
  });

  it('grava e relê (round-trip)', async () => {
    await gravarEstadoAplicado(dir, 'fora');
    expect(await lerEstadoAplicado(dir)).toBe('fora');
    await gravarEstadoAplicado(dir, 'dentro');
    expect(await lerEstadoAplicado(dir)).toBe('dentro');
  });

  it('valor corrompido → null', async () => {
    await writeFile(join(dir, '.expediente-state.json'), JSON.stringify({ estado: 'banana' }), 'utf8');
    expect(await lerEstadoAplicado(dir)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar — devem FALHAR**

Run: `npx vitest run scripts/lib/expediente-store.test.ts`
Expected: FAIL — `Cannot find module './expediente-store'`.

- [ ] **Step 3: Implementar `scripts/lib/expediente-store.ts`**

```typescript
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ExpedienteConfig } from './expediente';

/** Config padrão: DESLIGADO até o operador configurar. Seg–sex 09–18, fuso BR. */
export const EXPEDIENTE_DEFAULT: ExpedienteConfig = {
  ativo: false,
  timezone: 'America/Sao_Paulo',
  dias: {
    seg: ['09:00', '18:00'],
    ter: ['09:00', '18:00'],
    qua: ['09:00', '18:00'],
    qui: ['09:00', '18:00'],
    sex: ['09:00', '18:00'],
  },
  recado_dentro: 'Disponível',
  recado_fora: 'Fora do expediente. Respondo seg–sex, 9h–18h.',
};

function caminhoConfig(dataDir: string): string {
  return join(dataDir, 'expediente.json');
}
function caminhoEstado(dataDir: string): string {
  return join(dataDir, '.expediente-state.json');
}

/** Lê o config do disco e faz merge raso com o default (ausente/ inválido ⇒ default). */
export async function lerExpediente(dataDir: string): Promise<ExpedienteConfig> {
  try {
    const raw = await readFile(caminhoConfig(dataDir), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ExpedienteConfig>;
    return {
      ativo: parsed.ativo ?? EXPEDIENTE_DEFAULT.ativo,
      timezone: parsed.timezone || EXPEDIENTE_DEFAULT.timezone,
      dias: parsed.dias ?? EXPEDIENTE_DEFAULT.dias,
      recado_dentro: parsed.recado_dentro || EXPEDIENTE_DEFAULT.recado_dentro,
      recado_fora: parsed.recado_fora || EXPEDIENTE_DEFAULT.recado_fora,
    };
  } catch {
    return EXPEDIENTE_DEFAULT;
  }
}

/** Último estado aplicado (para detectar transição). `null` se nunca aplicado/corrompido. */
export async function lerEstadoAplicado(dataDir: string): Promise<'dentro' | 'fora' | null> {
  try {
    const raw = await readFile(caminhoEstado(dataDir), 'utf8');
    const parsed = JSON.parse(raw) as { estado?: unknown };
    return parsed.estado === 'dentro' || parsed.estado === 'fora' ? parsed.estado : null;
  } catch {
    return null;
  }
}

/** Persiste o estado aplicado (escrita atômica via tmp+rename). */
export async function gravarEstadoAplicado(
  dataDir: string,
  estado: 'dentro' | 'fora',
): Promise<void> {
  const path = caminhoEstado(dataDir);
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.expediente-state.${process.pid}.tmp`);
  await writeFile(tmp, `${JSON.stringify({ estado, atualizadoEm: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}
```

> Nota: o tmp usa `process.pid` (não `Date.now()`) para evitar a proibição de `Date.now()` em alguns contextos não se aplica aqui (é runtime normal de Node), mas pid já garante unicidade por processo e evita colisão.

- [ ] **Step 4: Rodar — devem PASSAR**

Run: `npx vitest run scripts/lib/expediente-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/expediente-store.ts scripts/lib/expediente-store.test.ts
git commit -m "feat(expediente): persistência de config + estado aplicado (testado)"
```

---

### Task 6: Decisão de transição (`decidirAcao`) — quando trocar o recado

A regra "só troca na transição" isolada e testada: dado o estado atual calculado e o último aplicado, decide se deve aplicar e qual recado. Liga a Task 4 e a Task 5 sem I/O de rede.

**Files:**
- Modify: `scripts/lib/expediente.ts` (adiciona `decidirAcao`)
- Modify: `scripts/lib/expediente.test.ts` (adiciona testes de `decidirAcao`)

**Interfaces:**
- Consumes: `ExpedienteConfig`, `estadoExpediente`, `recadoPara` (mesma Task 4).
- Produces (consumida pela Task 7):
  - `interface AcaoExpediente { aplicar: boolean; estado: 'dentro' | 'fora'; recado: string | null; }`
  - `function decidirAcao(agora: Date, cfg: ExpedienteConfig, ultimoAplicado: 'dentro' | 'fora' | null): AcaoExpediente` — `aplicar: false` se `cfg.ativo` é false OU se o estado novo == último aplicado; senão `aplicar: true` com o `recado` do novo estado.

- [ ] **Step 1: Adicionar os testes (falhando)**

Em `scripts/lib/expediente.test.ts`, adicione ao final (importe `decidirAcao` na linha de import existente):

```typescript
import { decidirAcao } from './expediente';

describe('decidirAcao', () => {
  it('não aplica quando ativo:false (mesmo havendo transição)', () => {
    const cfg = { ...base, ativo: false };
    const a = decidirAcao(spt('2026-06-26T10:00'), cfg, 'fora');
    expect(a.aplicar).toBe(false);
  });

  it('aplica na transição fora→dentro', () => {
    const a = decidirAcao(spt('2026-06-26T10:00'), base, 'fora');
    expect(a).toEqual({ aplicar: true, estado: 'dentro', recado: base.recado_dentro });
  });

  it('aplica na transição dentro→fora', () => {
    const a = decidirAcao(spt('2026-06-26T19:00'), base, 'dentro');
    expect(a).toEqual({ aplicar: true, estado: 'fora', recado: base.recado_fora });
  });

  it('NÃO reaplica quando o estado não mudou (dentro==dentro) — antispam', () => {
    const a = decidirAcao(spt('2026-06-26T10:00'), base, 'dentro');
    expect(a.aplicar).toBe(false);
    expect(a.estado).toBe('dentro');
  });

  it('primeiro boot (último=null) aplica o estado atual', () => {
    const a = decidirAcao(spt('2026-06-26T10:00'), base, null);
    expect(a.aplicar).toBe(true);
    expect(a.estado).toBe('dentro');
  });
});
```

- [ ] **Step 2: Rodar — os novos devem FALHAR**

Run: `npx vitest run scripts/lib/expediente.test.ts`
Expected: FAIL nos casos de `decidirAcao` (`decidirAcao is not a function` / não exportado). Os testes da Task 4 continuam passando.

- [ ] **Step 3: Implementar `decidirAcao` em `scripts/lib/expediente.ts`**

Adicione ao final de `scripts/lib/expediente.ts`:

```typescript
export interface AcaoExpediente {
  /** Se deve chamar o control server para trocar o recado agora. */
  aplicar: boolean;
  /** Estado calculado para `agora`. */
  estado: 'dentro' | 'fora';
  /** Recado a aplicar (só quando `aplicar` é true), senão null. */
  recado: string | null;
}

/**
 * Regra do agendador: troca o recado SÓ na transição. Não aplica se o expediente
 * está desligado (`ativo:false`) ou se o estado novo é igual ao último aplicado
 * (antispam). No primeiro boot (`ultimoAplicado === null`) aplica o estado atual.
 */
export function decidirAcao(
  agora: Date,
  cfg: ExpedienteConfig,
  ultimoAplicado: 'dentro' | 'fora' | null,
): AcaoExpediente {
  const estado = estadoExpediente(agora, cfg);
  if (!cfg.ativo || estado === ultimoAplicado) {
    return { aplicar: false, estado, recado: null };
  }
  return { aplicar: true, estado, recado: recadoPara(estado, cfg) };
}
```

- [ ] **Step 4: Rodar — tudo PASSA**

Run: `npx vitest run scripts/lib/expediente.test.ts`
Expected: PASS (Task 4 + `decidirAcao`).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/expediente.ts scripts/lib/expediente.test.ts
git commit -m "feat(expediente): decidirAcao — troca o recado só na transição (testado)"
```

---

### Task 7: Agendador standalone (`scripts/expediente-scheduler.ts`)

O processo que amarra tudo: a cada tick, lê o config, decide a ação, e na transição chama `POST /profile/status`. Sem teste automatizado (é o orquestrador de I/O — a lógica testável já está nas Tasks 4–6); validação por execução manual. Segue o molde de `scripts/notifier.ts` (fixa `WAC_DATA_DIR` por cwd, usa `CONTROL_URL`).

**Files:**
- Create: `scripts/expediente-scheduler.ts`
- Modify: `package.json` (script `expediente` para rodar via `tsx`)
- Create: `.env.example` entry (documentar `WAC_EXPEDIENTE_INTERVALO_MS`) — ver Step 5

**Interfaces:**
- Consumes: `lerExpediente`, `lerEstadoAplicado`, `gravarEstadoAplicado` (Task 5); `decidirAcao` (Task 6); `CONTROL_URL` de `web/lib/paths` (igual o notifier importa de `web/lib`).

- [ ] **Step 1: Implementar o agendador**

Crie `scripts/expediente-scheduler.ts`:

```typescript
/**
 * Agendador do recado de expediente. A cada tick: lê expediente.json, calcula se
 * estamos DENTRO/FORA do expediente e, SÓ na transição, troca o recado/"sobre" do
 * perfil via a API de controle do coletor (POST /profile/status). Processo
 * standalone (igual scripts/notifier.ts), idempotente: se o coletor estiver
 * offline na hora, a troca falha e tenta de novo no próximo tick.
 *
 * Rodar: `npm run expediente` (via tsx). Variáveis:
 *   WAC_DATA_DIR              raiz dos dados (default ./data)
 *   WAC_CONTROL_PORT          porta do control server (default 4310)
 *   WAC_EXPEDIENTE_INTERVALO_MS  intervalo do tick (default 300000 = 5min)
 */
import { resolve } from 'node:path';

// As libs do painel resolvem DATA_DIR/CONTROL por env — fixa antes de importá-las.
const DATA_DIR = process.env.WAC_DATA_DIR ?? resolve(process.cwd(), 'data');
process.env.WAC_DATA_DIR = DATA_DIR;

const INTERVALO_MS = Number(process.env.WAC_EXPEDIENTE_INTERVALO_MS ?? '300000');

async function tick(): Promise<void> {
  const { CONTROL_URL } = await import('../web/lib/paths');
  const { lerExpediente, lerEstadoAplicado, gravarEstadoAplicado } = await import(
    './lib/expediente-store'
  );
  const { decidirAcao } = await import('./lib/expediente');

  const cfg = await lerExpediente(DATA_DIR);
  if (!cfg.ativo) return; // desligado: nada a fazer

  const ultimo = await lerEstadoAplicado(DATA_DIR);
  const acao = decidirAcao(new Date(), cfg, ultimo);
  if (!acao.aplicar || acao.recado === null) return;

  try {
    const res = await fetch(`${CONTROL_URL}/profile/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: acao.recado }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      console.error(`[expediente] falha ao aplicar recado (${acao.estado}):`, data.error ?? res.status);
      return; // NÃO persiste o estado — tenta de novo no próximo tick
    }
    await gravarEstadoAplicado(DATA_DIR, acao.estado);
    console.log(`[expediente] recado trocado → ${acao.estado}: "${acao.recado}"`);
  } catch (err) {
    console.error('[expediente] coletor offline? tentando no próximo tick:', err);
  }
}

async function main(): Promise<void> {
  console.log(
    `[expediente] agendador iniciado (DATA_DIR=${DATA_DIR}, intervalo=${INTERVALO_MS}ms). ` +
      `Edite expediente.json e ponha "ativo": true para ligar.`,
  );
  await tick(); // aplica o estado atual já no boot (se houver transição vs persistido)
  setInterval(() => {
    void tick();
  }, INTERVALO_MS);
}

void main();
```

- [ ] **Step 2: Adicionar o script no `package.json`**

Em `package.json` (raiz), na seção `"scripts"`, adicione a linha abaixo. O runner é o MESMO de `sync` (confirmado no repo: `node --env-file-if-exists=.env --import tsx scripts/...`) — isso já dá o `.env` ao agendador e usa `tsx` como loader ESM:

```json
    "expediente": "node --env-file-if-exists=.env --import tsx scripts/expediente-scheduler.ts",
```

> Referência (já no `package.json`): `"sync": "node --env-file-if-exists=.env --import tsx scripts/sync-pull.ts"`. Espelhe exatamente.

- [ ] **Step 3: Smoke test — agendador sobe e não faz nada com `ativo:false`**

Run: `WAC_EXPEDIENTE_INTERVALO_MS=2000 timeout 4 npm run expediente`
Expected: imprime a linha "agendador iniciado ..."; como `expediente.json` não existe (ou `ativo:false`), NÃO tenta trocar recado; encerra no timeout sem erro.

- [ ] **Step 4: Smoke test — com `ativo:true` e coletor offline, falha graciosa**

Crie um config temporário e rode um tick (sem coletor no ar deve logar falha, não crashar):

```bash
mkdir -p data
cat > data/expediente.json <<'JSON'
{ "ativo": true, "timezone": "America/Sao_Paulo",
  "dias": { "seg": ["00:00","23:59"], "ter": ["00:00","23:59"], "qua": ["00:00","23:59"], "qui": ["00:00","23:59"], "sex": ["00:00","23:59"], "sab": ["00:00","23:59"], "dom": ["00:00","23:59"] },
  "recado_dentro": "Disponível", "recado_fora": "Fora" }
JSON
WAC_EXPEDIENTE_INTERVALO_MS=99999 WAC_CONTROL_PORT=4999 timeout 6 npm run expediente
```

Expected: loga `[expediente] coletor offline? ...` ou `falha ao aplicar recado` (porta 4999 sem servidor) e NÃO cria `.expediente-state.json` (estado não persiste em falha). Limpe depois: `rm -f data/expediente.json`.

- [ ] **Step 5: Documentar o config e a env**

Verifique se existe `.env.example` na raiz e adicione (se existir) a linha comentada:

Run: `test -f .env.example && echo EXISTE || echo NAO`

Se EXISTE, adicione ao final de `.env.example`:

```bash
# Recado automático de expediente (scripts/expediente-scheduler.ts).
# Intervalo do tick em ms (default 300000 = 5min). O config fica em data/expediente.json.
# WAC_EXPEDIENTE_INTERVALO_MS=300000
```

Independentemente, crie um exemplo de config versionável `data/expediente.json.example` (NÃO o `.json` real, que é do operador):

Crie `data/expediente.json.example`:

```json
{
  "ativo": false,
  "timezone": "America/Sao_Paulo",
  "dias": {
    "seg": ["09:00", "18:00"],
    "ter": ["09:00", "18:00"],
    "qua": ["09:00", "18:00"],
    "qui": ["09:00", "18:00"],
    "sex": ["09:00", "18:00"]
  },
  "recado_dentro": "Disponível",
  "recado_fora": "Fora do expediente. Respondo seg–sex, 9h–18h."
}
```

> Confirme que `data/` não está totalmente gitignored a ponto de bloquear o `.example`. Run: `git check-ignore data/expediente.json.example || echo "rastreável"`. Se for ignorado, ponha o exemplo em `docs/` em vez de `data/` e mencione o caminho final no README (Task 8 cobre o README).

- [ ] **Step 6: Commit**

```bash
git add scripts/expediente-scheduler.ts package.json
git add .env.example 2>/dev/null || true
git add data/expediente.json.example 2>/dev/null || git add docs/expediente.json.example 2>/dev/null || true
git commit -m "feat(expediente): agendador standalone que troca o recado na transição"
```

---

### Task 8: Documentação — README (perfil + expediente)

Registra a nova capacidade para usuários do projeto open-source: a tool `editar_perfil`, os endpoints, o agendador e o limite read-only do business.

**Files:**
- Modify: `README.md` (seção de ferramentas MCP — `editar_perfil`; e uma subseção curta sobre o agendador de expediente)

**Interfaces:** nenhuma (docs).

- [ ] **Step 1: Localizar a lista de ferramentas no README**

Run: `grep -nE "responder|editar|ferramentas|## .*MCP|definir_modo" README.md | head -20`
Expected: acha a seção onde as tools MCP são listadas (provavelmente por categoria).

- [ ] **Step 2: Adicionar `editar_perfil` à lista de tools**

Na categoria adequada (ex.: "Ações" / "Envio" — junto de `responder`/`responder_midia`/`definir_modo`), adicione uma linha no mesmo formato das vizinhas. Exemplo (ajuste ao formato real do arquivo):

```markdown
- **`editar_perfil`** — edita nome, recado/"sobre" e/ou foto do perfil (a IA pede confirmação antes; perfil é público). Catálogo/localização/horário-oficial do business são read-only no WhatsApp.
```

- [ ] **Step 3: Adicionar subseção do agendador de expediente**

Após a lista de tools (ou numa seção de "Processos auxiliares", junto do notifier/sync se houver), adicione:

```markdown
### Recado automático de expediente

`npm run expediente` sobe um agendador que troca o recado/"sobre" do perfil
conforme seu horário de trabalho. Configure em `data/expediente.json` (veja
`expediente.json.example`): dias e faixas `["HH:MM","HH:MM"]`, fuso, e os textos
`recado_dentro`/`recado_fora`. Fora do expediente o recado vira o aviso de
indisponível; dentro, volta ao normal. A troca acontece **só na transição**
(não fica reescrevendo). Ponha `"ativo": true` para ligar.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: editar_perfil + agendador de recado de expediente no README"
```

---

### Task 9: Verificação final (suíte completa + build)

Garante que nada quebrou: toda a suíte de testes da raiz e o build do coletor.

**Files:** nenhum (verificação).

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS — incluindo os novos `scripts/lib/expediente.test.ts` e `scripts/lib/expediente-store.test.ts`, sem regressão nos `web/lib/**` existentes.

- [ ] **Step 2: Build do coletor**

Run: `npm run build`
Expected: compila sem erro (gateway, ports, control server).

- [ ] **Step 3: Lint/format se o projeto tiver**

Run: `npm run lint 2>/dev/null || echo "sem lint script"`
Expected: sem erros novos (ou "sem lint script").

- [ ] **Step 4: Resumo manual a validar com o operador (não automatizável)**

Anote para teste manual com o coletor conectado:
1. Pedir à IA "muda meu recado pra X" → ela mostra o texto, confirma, chama `editar_perfil`, o "sobre" muda no WhatsApp.
2. `editar_perfil` com `foto` apontando uma imagem em `data/` → foto do perfil troca.
3. Ligar `expediente.json` (`ativo:true`) com uma faixa que force transição → `npm run expediente` troca o recado e grava `.expediente-state.json`; segundo tick no mesmo estado não reescreve.

---

## Self-Review

**1. Spec coverage:**
- Parte 1 (editar perfil: nome/recado/foto, manual+IA, confirmação) → Tasks 1, 2, 3. ✓
- "A IA pode editar quando o Rodrigo pede" → Task 3 (tool `editar_perfil` + descrição de confirmação). ✓
- Read-only do business (catálogo/localização/horário/link) → documentado na descrição da tool (Task 3) e no README (Task 8); nenhum código tenta editá-los. ✓
- Parte 2 (config `expediente.json` em DATA_DIR, dias+horários, recado_dentro/fora) → Task 5 (store) + Task 7 (config exemplo). ✓
- Agendador (tick ~5min, calcula dentro/fora, compara com persistido, só troca na transição, idempotente no boot/falha) → Tasks 4, 6, 7. ✓
- Função pura `estadoExpediente(agora, config)` testável (dias, faixas, meia-noite, dia ausente, timezone) → Task 4. ✓
- "só troca na transição" testável isolada → Task 6 (`decidirAcao`). ✓
- gateway/Baileys fora dos testes (I/O), validação manual → Tasks 1, 2, 7 sem teste automatizado + Task 9 Step 4. ✓
- Controle ligar/desligar via `ativo` → Task 6 (`decidirAcao` retorna `aplicar:false` se `!ativo`) + Task 7 (early-return). ✓
- Prioridade MVP sem `pausar_ate` (agendador vence na transição; recado manual dura até a próxima transição) → consequência natural de `decidirAcao` (só age na transição; entre transições não toca, então um recado manual persiste). ✓
- Fora de escopo (catálogo, auto-resposta ao cliente, multi-perfil) → nenhuma task os implementa. ✓
- Arquitetura (gateway único a tocar o socket; control server é a fronteira; agendador chama via HTTP) → Tasks 1/2/7 respeitam. ✓

**2. Placeholder scan:** Sem "TBD/TODO/implementar depois". Todo step de código tem o código completo; todo step de comando tem o comando e o esperado. Os pontos "confirme o padrão X e ajuste" (Task 1 Step 3, Task 7 Step 2, Task 8 Steps 1–2) são verificações deliberadas contra a realidade do repo (assinatura do Baileys, runner de script, formato do README), não placeholders — cada um traz o comando de verificação e o default a usar.

**3. Type consistency:**
- `updateProfileName/Status/Picture` — mesma assinatura na porta (Task 1 Step 1), no gateway (Step 2) e consumida no control (Task 2). ✓
- Endpoints `/profile/name|status|picture` com bodies `{name}`/`{status}`/`{path}` — idênticos entre control (Task 2), tool MCP `postProfile` (Task 3) e agendador (Task 7). ✓
- `ExpedienteConfig`, `'dentro'|'fora'`, `decidirAcao`, `AcaoExpediente` — definidos na Task 4/6 e consumidos consistentemente na Task 5 (store) e Task 7 (scheduler). `estadoExpediente`/`recadoPara`/`decidirAcao` mesmos nomes em todos os usos. ✓
- `lerExpediente`/`lerEstadoAplicado`/`gravarEstadoAplicado`/`EXPEDIENTE_DEFAULT` — nomes idênticos entre store (Task 5) e scheduler (Task 7). ✓

Nenhum ajuste pendente.
