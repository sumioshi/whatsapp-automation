# Sync nuvem → Mac — Design

**Data:** 2026-06-23
**Status:** Aprovado (o operador), pronto pra plano de implementação.

## Problema

Hoje há **dois coletores** pareados na mesma conta de WhatsApp:
- **Local** (Mac, `npm run dev`) — coleta em tempo real e é por onde sai o envio (`:4310`).
- **Nuvem** (Railway) — coleta 24/7, mesmo com o Mac desligado.

Quando o Mac fica off, só a nuvem captura. Ao religar, o coletor local reconecta como
aparelho existente e pega só dali pra frente — **o gap do período off fica só na nuvem**.
O MCP/MLX local lê o `data/` local, então não enxerga esse gap.

**Objetivo:** trazer pro `data/` local o que a nuvem capturou enquanto o Mac estava off,
sem derrubar nem conflitar com o coletor local (que continua rodando) nem com o MCP em uso.

## Decisões travadas

1. **Manter o coletor local rodando.** Tempo real e envio continuam locais e instantâneos.
   A nuvem é um **backup 24/7 que preenche buracos**. Bônus: redundância.
2. **Mídia sob demanda.** O sync periódico move só **texto** (leve). Os arquivos pesados
   (áudio/imagem/vídeo/PDF) só são baixados da nuvem quando o MLX/MCP realmente precisa deles.
3. **Transporte HTTP, URL configurável.** O Mac fala com a nuvem por HTTPS contra o painel,
   endereço numa env (`WAC_CLOUD_URL`). **Não acopla ao Tailscale** — é só o jeito do operador
   alcançar o painel; quem não usar Tailscale aponta pra outro endereço. Auth = o Basic Auth
   que o painel já tem.
4. **Gatilho: no início do `npm run dev`** (antes do coletor local subir = janela segura),
   mais um `npm run sync` manual. Não precisa daemon nem sync contínuo: o gap só existe no
   período off, e religar o projeto dispara o pull.
5. **Merge por `id`.** Cada mensagem tem `id` único (o ID do WhatsApp, idêntico nos 2
   coletores). União local ∪ nuvem, dedup por id, ordena por timestamp. **Nunca sobrescreve.**

### Não-objetivos (YAGNI)

- **Syncthing / espelho contínuo** — descartado: sobrescreve em vez de mergear; com o coletor
  local ativo (que grava linhas próprias de envio) corromperia o `messages.jsonl`.
- **Espelhar a mídia** (~1.2 GB) — não; sob demanda.
- **Merge dos snapshots JSON de raiz** (`.contacts.json`, `.chats.json`, etc.) — fora do escopo
  inicial. O Mac usa os seus (já populados pela history sync local). Escopo do sync = arquivos
  **por grupo** append-only (`.jsonl`).
- **Mudar o envio.** Continua só no `:4310` local. As rotas da nuvem são **read-only**.

## Arquitetura

```
   ┌─────────── NUVEM (Railway) ───────────┐          ┌─────────── MAC ───────────┐
   │  coletor 24/7 ──► /data/data/          │          │ coletor local ──► data/   │
   │  painel (Next) — rotas READ-ONLY:      │  HTTPS   │ (tempo real + envio :4310) │
   │   GET /api/sync/manifest               │◄─────────│                            │
   │   GET /api/sync/file?path=…  (texto)   │  Basic   │ scripts/sync-pull ─► merge por id
   │   GET /api/media?path=…      (mídia)   │  Auth    │ libs de mídia ─► ensureLocalMedia
   └────────────────────────────────────────┘          └────────────────────────────┘
        alcançável por WAC_CLOUD_URL (Tailscale no caso do operador; não obrigatório)
```

Princípio de segurança: a nuvem **só serve leitura**. Mesmo que as rotas vazassem, ninguém
*envia* nada por elas; o envio é exclusivo do `:4310` local (que nunca é exposto).

## Componentes

### A. Lado nuvem — 3 rotas read-only no painel (`web/app/api`)

Todas atrás do `middleware.ts` (Basic Auth, já existente) e usando `safeDataPath()` de
`web/lib/paths.ts` pra barrar path traversal (já existente). Nenhuma escreve.

- **`GET /api/sync/manifest`** → JSON `{ files: [{ path, size, mtime }] }` listando os arquivos
  de texto sincronizáveis: `<grupo>/*.jsonl` de cada grupo em `DATA_DIR`.
- **`GET /api/sync/file?path=<rel>`** → corpo do arquivo de texto (`text/plain`). Recusa
  qualquer path que não termine em `.jsonl` e que não resolva dentro de `DATA_DIR`.
- **`GET /api/media?path=<rel>`** → streama um arquivo de mídia. (Avaliar reuso da rota
  `web/app/api/media` já existente; estender pra aceitar `path` relativo + auth se preciso.)

### B. Lado Mac — `scripts/sync-pull` + merge

Script TypeScript rodado por `tsx` (já é dep do `web`). Lê de env:
`WAC_CLOUD_URL`, `WAC_CLOUD_USER`, `WAC_CLOUD_PASS`. Se `WAC_CLOUD_URL` vazio → no-op
silencioso (degrada pro comportamento de hoje).

Fluxo:
1. `GET {WAC_CLOUD_URL}/api/sync/manifest` (Basic Auth).
2. Pra cada arquivo: `GET …/api/sync/file?path=…`, mergeia com o local correspondente.
3. **Merge:**
   - `messages.jsonl` → parse linha a linha, indexa por `id`, união (mantém a versão local
     em caso de id repetido), **ordena por `timestamp`**.
   - demais `.jsonl` (receipts/edits/deletes/reactions) → dedup por **linha inteira** (fatos
     imutáveis), preserva ordem de aparição.
4. **Escrita atômica:** grava em `<arquivo>.tmp` e `rename` (atômico no mesmo FS) — nunca
   deixa o arquivo num estado parcial pro coletor/MCP que estiver lendo.

Gatilhos:
- `package.json` raiz ganha `"sync": "tsx scripts/sync-pull.ts"`.
- `"dev"` passa a rodar o pull **antes** do `concurrently`: `npm run sync || true; concurrently …`
  (o `|| true` garante que nuvem inacessível não impede o `dev` de subir).

### C. Mídia sob demanda — `ensureLocalMedia` (`web/lib/cloud-media.ts`)

`ensureLocalMedia(relPath: string): Promise<string>`:
- Se `safeDataPath(relPath)` existe local → retorna o caminho absoluto.
- Senão e `WAC_CLOUD_URL` setado → `GET …/api/media?path=relPath`, salva em `safeDataPath(relPath)`
  (cria a pasta), retorna o caminho. Cacheia: baixa uma vez, fica local.
- Senão (sem cloud) → lança erro claro: "mídia só na nuvem; configure WAC_CLOUD_URL / conecte o acesso".

Pontos de uso (libs, pra painel **e** MCP herdarem o fallback):
- `web/lib/transcribe.ts` — trocar `safeDataPath(mediaPath)` por `await ensureLocalMedia(mediaPath)`.
- `web/lib/documents.ts` — idem antes de extrair texto.
- Onde imagem/vídeo são lidos (rota `web/app/api/media` e o `ver_imagem`/`ver_video` do MCP) —
  garantir que passam por `ensureLocalMedia` antes de ler o arquivo.

## Tratamento de erros & bordas

- **Nuvem inacessível** (Tailscale off / painel down): `sync-pull` loga aviso e sai 0 — o `dev`
  sobe normal. `ensureLocalMedia` lança erro explicativo (não trava o painel).
- **Sem `WAC_CLOUD_URL`**: sync e fallback desligados → comportamento idêntico ao de hoje.
- **Concorrência**: pull roda na janela segura (antes do coletor local); escrita atômica protege
  qualquer leitor. Merge por id é **idempotente** — rodar 2× não duplica.
- **Path traversal**: `safeDataPath()` nas 3 rotas; `/api/sync/file` ainda exige sufixo `.jsonl`.

## Testes

- **Merge** (unit, fixtures no scratchpad — nunca no `data/` real):
  - 2 `messages.jsonl` com overlap de `id` → união ordenada por timestamp, sem duplicata.
  - sidecar `.jsonl` com linhas repetidas → dedup por linha.
  - merge idempotente (rodar 2× = mesmo resultado).
- **Rotas**: `../etc/passwd` → recusado; sem credencial → 401; `.txt` em `/api/sync/file` → recusado.
- **`ensureLocalMedia`**: existe local → retorna sem rede; não existe → baixa (fetch mockado) e cacheia.

## Arquivos afetados

**Novos:** `web/app/api/sync/manifest/route.ts`, `web/app/api/sync/file/route.ts`,
`web/lib/cloud-media.ts`, `scripts/sync-pull.ts`, testes.
**Editados:** `web/lib/transcribe.ts`, `web/lib/documents.ts`, `web/app/api/media/route.ts`
(fallback), `package.json` raiz (scripts `sync` + `dev`), `src/config/env.ts`? **não** —
as envs novas são lidas só no `web`/script. **`.env.example`** se houver.

**Restrição operacional:** **zero edição em `src/`** (é o que o `tsx watch` reinicia → derrubaria
o `:4310` em uso). Nada de reiniciar o `npm run dev` em andamento. Testes de merge só em fixtures
isoladas. Edições em `web/` dão hot-reload inofensivo; o MCP em execução só pega o código novo
quando a sessão for recarregada.
