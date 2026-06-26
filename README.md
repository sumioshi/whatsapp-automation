# WhatsApp Group Collector

Coleta automaticamente **áudio, vídeo, imagem, documento e texto** dos grupos de
WhatsApp que você escolher, organiza por grupo, transcreve áudios/vídeos (Whisper
local) e expõe tudo para uma IA via **MCP** — para parar de garimpar conteúdo de
cliente mensagem por mensagem.

Usa [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web
multi-device, sem navegador). Roda local; nada do conteúdo sai da sua máquina.

> ⚠️ Captura **em tempo real, daqui pra frente** — não reconstrói histórico antigo
> (limitação do protocolo). Deixe rodando e ele coleta tudo que chega.

---

## O que faz

- **Coleta 24/7** o conteúdo dos grupos marcados, organizado em `data/<grupo>/`.
- **Painel web** estilo WhatsApp (`localhost:3000`): timeline por grupo, players,
  imagens, documentos, busca, e **enviar/responder** mensagens.
- **Transcrição local** (MLX Whisper `large-v3`) sob demanda, com serviço "morno"
  que carrega o modelo no 1º uso e libera a RAM quando ocioso.
- **MCP server** que dá a uma IA (ex.: Claude Code) ferramentas para consultar,
  buscar, transcrever, **ver imagens**, resumir e responder — sem você abrir o app.
- Contexto rico: **menções resolvidas** (`@id`→`@nome`), **autor do reply**,
  **reações**, e classificação **time vs cliente**.

## Arquitetura

Quatro peças, uma fonte de verdade (a pasta `data/`):

```
                         ┌──────────────────────┐
  WhatsApp ─► coletor ─► │   data/<grupo>/      │ ◄─► painel web (localhost:3000)
  (Baileys)   (daemon)   │   .jsonl + mídia +   │
                         │   transcrições       │ ◄─► MCP server (Claude)
                         └──────────┬───────────┘
                            transcriber (MLX, :4320)
```

```
src/            Coletor — daemon Baileys (Ports & Adapters; Baileys isolado em src/whatsapp)
web/            Painel Next.js 16 + libs compartilhadas (web/lib) + MCP (web/mcp/server.ts)
transcriber/    Serviço de transcrição morno (Python/MLX)
ecosystem.config.cjs   Config do pm2 (coletor + painel + transcriber)
data/           Conteúdo coletado (gitignored)
auth/           Sessão do WhatsApp (gitignored)
```

## Requisitos

- **macOS Apple Silicon** para a transcrição — `mlx_whisper` (MLX) só roda em
  Apple Silicon. Coletor e painel rodam em qualquer OS; em Linux, troque a
  transcrição por whisper.cpp.
- **Node.js ≥ 20** (testado no v24).
- `ffmpeg`, `pm2` e o `mlx_whisper` (via `uv tool`).
- Uma conta de WhatsApp para parear (QR).

```bash
brew install ffmpeg
npm install -g pm2
uv tool install mlx-whisper
```

## Começar

```bash
# 1. instalar e buildar
npm install && npm run build                 # coletor
cd web && npm install && npm run build && cd ..   # painel + MCP

# 2. subir tudo (coletor + painel + transcriber)
pm2 start ecosystem.config.cjs && pm2 save

# 3. parear: abra http://localhost:3000/config, escaneie o QR
#    (WhatsApp › Aparelhos conectados › Conectar um aparelho)
```

Depois de parear, em **`/config`** marque os grupos a monitorar (busca + tags +
ação em lote), defina seu time, e escolha o modelo/idioma. A sessão fica em
`auth/` e reconecta sozinha.

> Para desenvolver: `npm run dev` (coletor, QR no terminal) e `cd web && npm run dev`
> (painel). Em produção, use o pm2.

## Usar

**Painel** (`localhost:3000`): navegue por grupo, ouça áudios, clique **Transcrever**,
responda, ou inicie uma **Nova conversa** (mesmo sem histórico). Atualiza sozinho.

**MCP** (`web/mcp/server.ts`): registrado em `.mcp.json` (escopo do projeto; aprove
no 1º uso no Claude Code). Ferramentas:

| Ferramenta | O que faz |
|---|---|
| `listar_grupos` / `ler_mensagens` | navegar conteúdo |
| `buscar` | acha texto **inclusive dentro de transcrições** |
| `transcrever` | Whisper local sob demanda (com `mediaPath` = 1; sem = todos pendentes do grupo) |
| `resumo_do_dia` | transcreve o pendente do dia e devolve para resumir |
| `ver_imagem` | devolve a imagem para a IA **enxergar** (prints de bug) |
| `listar_contatos` | quem é `me` / `team` / `client` |
| `responder` | envia mensagem ao grupo (sob confirmação) |

Dirija o MCP fora do Claude Code com o driver da skill:

```bash
node .claude/skills/run-whatsapp-automation/driver.mjs            # lista ferramentas
node .claude/skills/run-whatsapp-automation/driver.mjs call resumo_do_dia '{"grupo":"<slug>"}'
```

## Saída (`data/<grupo>/`)

```
audio/ video/ image/ document/   # mídia, nome = data_hora_remetente_tipo_id.ext
transcripts/                     # sidecar .txt por mídia transcrita
messages.jsonl                   # 1 linha/mensagem (o "banco" da IA)
reactions.jsonl                  # reações (emoji) por mensagem
log.md                           # versão cronológica legível
```

Cada linha do `messages.jsonl`:
`{ id, timestamp, group, groupJid, sender, senderName, fromMe, type, text, quotedText, quotedSender, mediaPath }`.

## Configuração (variáveis de ambiente, todas opcionais)

**Coletor:** `AUTH_DIR` (`auth`), `DATA_DIR` (`data`), `GROUPS_CONFIG`
(`groups.config.json`), `LOG_LEVEL` (`info`), `BAILEYS_LOG_LEVEL` (`warn`),
`CONTROL_PORT` (`4310`).
**Painel/MCP/transcriber:** `WAC_DATA_DIR`, `WAC_GROUPS_CONFIG`, `WAC_WHISPER_MODEL`
(`mlx-community/whisper-large-v3-mlx`), `WAC_WHISPER_LANG` (`pt`),
`WAC_TRANSCRIBE_PORT` (`4320`), `WAC_TRANSCRIBE_IDLE` (`180`s).

## Limitações e avisos

- **Não é API oficial do WhatsApp.** Use com bom senso (sem spam/disparo em massa)
  para evitar bloqueio do número.
- **Sem histórico antigo** — captura só do pareamento em diante.
- **Transcrição é Apple-Silicon** (MLX). Em servidor Linux, use whisper.cpp.
- **Envio é real e local.** As APIs de controle (`:4310`) e o painel mandam
  mensagem como você — ficam em `127.0.0.1`. **Não exponha na internet** (use
  Tailscale/auth se for hospedar).
- `data/`, `auth/`, `.env` e `groups.config.json` são **gitignored** (conteúdo +
  sessão). Nunca versione.

## Rodar / dirigir (skill)

Há uma skill em `.claude/skills/run-whatsapp-automation/` (SKILL.md + `driver.mjs`)
com o passo a passo verificado de build, run e como dirigir o MCP. No Claude Code,
peça *"roda o whatsapp-automation"*.

## Roadmap

- Transcrição automática em background nos grupos prioritários.
- Análise de vídeo frame a frame.
- Migração para servidor 24/7 (Railway/VPS) com whisper.cpp + Tailscale.
