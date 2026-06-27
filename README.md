# WhatsApp Group Collector

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-43853d.svg)](https://nodejs.org)
[![Built with Baileys](https://img.shields.io/badge/built%20with-Baileys-25D366.svg)](https://github.com/WhiskeySockets/Baileys)

Se você atende clientes por grupos de WhatsApp, sabe a dor: dezenas de grupos, áudios que ninguém transcreve, prints perdidos no scroll, e a sensação de que algo importante passou batido enquanto você estava noutro grupo.

Esta ferramenta coleta tudo que chega nos grupos que você escolhe (áudio, vídeo, imagem, documento, texto), organiza por grupo, transcreve os áudios localmente, e entrega o conteúdo pra uma IA via [MCP](https://modelcontextprotocol.io). Em vez de garimpar mensagem por mensagem, você pergunta: "o que rolou no grupo do cliente X hoje?".

Roda na sua máquina, com [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web multi-device, sem navegador). O conteúdo fica em `data/`, na sua máquina.

> **Captura daqui pra frente, não pra trás.** O protocolo do WhatsApp não deixa reconstruir histórico antigo de forma confiável. Deixe rodando e ele vai juntando tudo que chega.

<!-- TODO: adicionar um screenshot do painel aqui. Ex.: ![Painel](docs/painel.png) -->

## O que faz

- **Coleta contínua** dos grupos marcados, organizada em `data/<grupo>/`.
- **Painel web** estilo WhatsApp (`localhost:3000`): timeline por grupo, players de áudio, imagens, documentos, busca, e responder mensagens.
- **Transcrição local** (Whisper `large-v3` via MLX) sob demanda. O serviço carrega o modelo no primeiro uso e libera a RAM quando fica ocioso, então não pesa o dia todo.
- **MCP server** com ferramentas pra uma IA (ex.: Claude Code) ler, buscar, transcrever, ver imagens e vídeos, ler documentos, resumir e responder, sem você abrir o app.
- **Contexto que a IA entende:** menções resolvidas (`@id` vira `@nome`), o autor e o texto do reply citado, reações, legenda separada do texto solto, e quem é do seu time vs cliente.

## Como funciona

Quatro processos, uma fonte de verdade (a pasta `data/`):

```
                          ┌──────────────────────┐
  WhatsApp ─► coletor ─►  │   data/<grupo>/      │ ◄─► painel web (localhost:3000)
  (Baileys)   (daemon)    │   .jsonl + mídia +   │
                          │   transcrições       │ ◄─► MCP server (sua IA)
                          └──────────┬───────────┘
                            transcriber (MLX, :4320)
```

```
src/            Coletor: daemon Baileys (Ports & Adapters, Baileys isolado em src/whatsapp)
web/            Painel Next.js 16 + libs compartilhadas (web/lib) + MCP (web/mcp/server.ts)
transcriber/    Serviço de transcrição morno (Python/MLX)
data/           Conteúdo coletado (gitignored)
auth/           Sessão do WhatsApp (gitignored)
```

## Requisitos

- **macOS Apple Silicon** para a transcrição. O `mlx_whisper` só roda em Apple Silicon. O coletor e o painel rodam em qualquer sistema; em Linux, troque a transcrição por whisper.cpp.
- **Node.js 20 ou maior** (testado no v24).
- `ffmpeg` e o `mlx_whisper` (via `uv tool`).
- Uma conta de WhatsApp pra parear (QR).

```bash
brew install ffmpeg
uv tool install mlx-whisper
```

## Começar

```bash
# 1. instalar dependências (coletor e painel)
npm install
cd web && npm install && cd ..

# 2. copiar os exemplos de config
cp .mcp.json.example .mcp.json
cp .claude/whatsapp.json.example .claude/whatsapp.json

# 3. subir tudo (coletor + painel + transcriber + notifier)
npm run dev
```

Depois de subir, abra `http://localhost:3000/config` e escaneie o QR (no celular: **WhatsApp › Aparelhos conectados › Conectar um aparelho**). Ainda em `/config`, marque os grupos que quer monitorar, defina seu time, e escolha modelo e idioma. A sessão fica salva em `auth/` e reconecta sozinha.

Para rodar 24/7 em background existe um `ecosystem.config.cjs` (pm2). O `npm run dev` é o jeito padrão pra desenvolvimento e uso local no Mac.

## Usar

**No painel** (`localhost:3000`): navegue por grupo, ouça áudios, clique em **Transcrever**, responda, ou comece uma conversa nova mesmo sem histórico. A tela atualiza sozinha.

**Pela IA** (MCP): o server em `web/mcp/server.ts` é registrado pelo `.mcp.json` (escopo do projeto; aprove no primeiro uso no Claude Code). São 19 ferramentas, agrupadas assim:

| Categoria | Ferramentas |
|---|---|
| Ler | `listar_grupos`, `ler_mensagens`, `buscar`, `listar_contatos`, `ler_notas`, `estado_triagem` |
| Mídia | `transcrever`, `ver_imagem`, `ver_video`, `ler_documento`, `resumo_do_dia` |
| Responder | `responder`, `responder_midia`, `editar_perfil` |
| Triagem | `marcar_resolvido`, `silenciar_grupo`, `anotar`, `alertar_chat`, `definir_modo`, `novidades` |

Destaques: `buscar` acha texto **inclusive dentro das transcrições**; `ver_imagem`/`ver_video` devolvem a mídia pra IA *enxergar* (útil pra print de bug); `definir_modo` define por chat se a IA envia direto ou confirma antes; `responder` respeita esse modo. `editar_perfil` edita nome, recado/"sobre" e/ou foto do perfil — a IA pede confirmação antes (perfil é público); catálogo, localização e horário-oficial do business são read-only no WhatsApp.

Para dirigir o MCP fora do Claude Code, use o driver da skill:

```bash
node .claude/skills/run-whatsapp-automation/driver.mjs            # lista as ferramentas
node .claude/skills/run-whatsapp-automation/driver.mjs call resumo_do_dia '{"grupo":"<slug>"}'
```

## Recado automático de expediente

`npm run expediente` sobe um agendador que troca o recado/"sobre" do perfil conforme seu horário de trabalho. Configure em `data/expediente.json` (veja `docs/expediente.json.example` para um exemplo): defina os dias operacionais, as faixas horárias `["HH:MM","HH:MM"]`, o fuso horário e os textos `recado_dentro` (mensagem durante expediente) e `recado_fora` (mensagem fora do expediente). Fora do expediente o recado muda para o aviso de indisponível; dentro, volta ao normal. A troca acontece **só na transição** de cada faixa horária, não reescreve continuamente. Ative com `"ativo": true` no arquivo de configuração.

## O que sai (`data/<grupo>/`)

```
audio/ video/ image/ document/   # mídia, nome = data_hora_remetente_tipo_id.ext
transcripts/                     # um .txt por mídia transcrita
messages.jsonl                   # uma linha por mensagem (o "banco" da IA)
reactions.jsonl                  # reações (emoji) por mensagem
log.md                           # a mesma conversa, cronológica e legível
```

Cada linha do `messages.jsonl`:

```json
{ "id": "...", "timestamp": "...", "group": "...", "groupJid": "...",
  "sender": "...", "senderName": "...", "fromMe": false, "type": "text",
  "text": "...", "quotedText": null, "quotedSender": null, "mediaPath": null }
```

A camada que a IA consome (via MCP) enriquece isso com a hora local já convertida, a legenda da mídia separada do texto, o agrupamento de rajadas, e o papel de cada contato.

## Configuração (variáveis de ambiente, todas opcionais)

**Coletor:** `AUTH_DIR` (`auth`), `DATA_DIR` (`data`), `GROUPS_CONFIG` (`groups.config.json`), `LOG_LEVEL` (`info`), `BAILEYS_LOG_LEVEL` (`warn`), `CONTROL_PORT` (`4310`).

**Painel / MCP / transcriber:** `WAC_DATA_DIR`, `WAC_GROUPS_CONFIG`, `WAC_WHISPER_MODEL` (`mlx-community/whisper-large-v3-mlx`), `WAC_WHISPER_LANG` (`pt`), `WAC_TRANSCRIBE_PORT` (`4320`), `WAC_TRANSCRIBE_IDLE` (`180`s).

## Avisos importantes

- **Não é a API oficial do WhatsApp.** Use com bom senso, sem disparo em massa, pra não tomar bloqueio no número.
- **Sem histórico antigo.** Captura só do pareamento em diante.
- **O envio é real.** A API de controle (`:4310`) e o painel mandam mensagem como você, então ficam presas em `127.0.0.1`. Não exponha na internet sem auth (use algo como Tailscale se for hospedar).
- `data/`, `auth/`, `.env` e `groups.config.json` são **gitignored** (conteúdo e sessão). Nunca versione.

## Contribuindo

Issues e PRs são bem-vindos. Se for mexer no código:

```bash
npm test                 # roda a suíte (Vitest)
npx tsc --noEmit         # typecheck
```

O Baileys fica isolado em `src/whatsapp/` (Ports & Adapters), então adicionar/trocar adaptadores não vaza pro resto. As libs compartilhadas entre painel e MCP estão em `web/lib/`.

## Roadmap

- Transcrição automática em background nos grupos prioritários.
- Análise de vídeo frame a frame.
- Suporte oficial a whisper.cpp pra rodar em Linux/VPS.

## Licença

[Apache 2.0](./LICENSE) © Rodrigo Sumioshi. Veja [NOTICE](./NOTICE) para os termos de atribuição.
