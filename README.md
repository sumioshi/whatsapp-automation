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

**Pela IA** (MCP): o server em `web/mcp/server.ts` é registrado pelo `.mcp.json` (escopo do projeto; aprove no primeiro uso no Claude Code). São 20 ferramentas, agrupadas assim:

| Categoria | Ferramentas |
|---|---|
| Ler | `listar_grupos`, `ler_mensagens`, `buscar`, `listar_contatos`, `ler_notas`, `estado_triagem` |
| Mídia | `transcrever`, `ver_imagem`, `ver_video`, `ler_documento`, `resumo_do_dia` |
| Responder | `responder`, `responder_midia`, `cancelar_envio`, `editar_perfil` |
| Triagem | `marcar_resolvido`, `silenciar_grupo`, `anotar`, `alertar_chat`, `definir_modo`, `novidades` |

Destaques: `buscar` acha texto **inclusive dentro das transcrições**; `ver_imagem`/`ver_video` devolvem a mídia pra IA *enxergar* (útil pra print de bug); `definir_modo` define por chat se a IA envia direto ou confirma antes; `responder` respeita esse modo. `editar_perfil` edita nome, recado/"sobre" e/ou foto do perfil — a IA pede confirmação antes (perfil é público); catálogo, localização e horário-oficial do business são read-only no WhatsApp. `responder` entrega como humano (visto → digitando → balões) e é **cancelável**: o Esc no cliente MCP ou `cancelar_envio` seguram o balão que ainda não saiu (há uma janela mínima de 5 s antes do primeiro). `ler_mensagens` traz `origem` nas mensagens da própria conta — `coletor` (a IA/painel mandou), `celular`/`web` (o operador respondeu na mão) ou `ia_meta` (IA da Meta) — pra IA saber quem escreveu cada "Você".

Para dirigir o MCP fora do Claude Code, use o driver da skill:

```bash
node .claude/skills/run-whatsapp-automation/driver.mjs            # lista as ferramentas
node .claude/skills/run-whatsapp-automation/driver.mjs call resumo_do_dia '{"grupo":"<slug>"}'
```

### Modo remoto (multi-tenant)

Por padrão o MCP é **local**: lê o disco da sua máquina (`data/`). Para usar um coletor que roda **na nuvem** (Railway), ative o modo remoto:

1. Configure no `.env` (ou `.claude/whatsapp.json`):
   ```bash
   WAC_MCP_REMOTE=1
   WAC_CLOUD_URL=https://seu-coletor-production-xxxx.up.railway.app
   WAC_CLOUD_USER=seu_usuario_do_painel
   WAC_CLOUD_PASS=sua_senha_do_painel
   ```

2. Copy `.mcp.json.remote.example` para `.mcp.json` (ou atualize seu `.mcp.json` existente com os `WAC_MCP_REMOTE`/`WAC_CLOUD_*` no `env`).

Cada pessoa aponta pro seu container — **os dois modos coexistem** (você pode ter um Mac local rodando ao mesmo tempo que um container na nuvem). O painel remoto (Railway) exige HTTPS + Basic Auth (`PANEL_USER`/`PANEL_PASS` do container). O control server (`:4310`) continua interno ao container — o acesso externo é só pelo painel autenticado.

## Recado automático de expediente

`npm run expediente` sobe um agendador que troca o recado/"sobre" do perfil conforme seu horário de trabalho. Configure em `data/expediente.json` (veja `docs/expediente.json.example` para um exemplo): defina os dias operacionais, as faixas horárias `["HH:MM","HH:MM"]`, o fuso horário e os textos `recado_dentro` (mensagem durante expediente) e `recado_fora` (mensagem fora do expediente). Fora do expediente o recado muda para o aviso de indisponível; dentro, volta ao normal. A troca acontece **só na transição** de cada faixa horária, não reescreve continuamente. Ative com `"ativo": true` no arquivo de configuração.

## Brain (memória espelhada)

`scripts/brain-sync-install.sh` instala no launchd um espelho, a cada 5 minutos, da memória
do Claude Code (`~/.claude/projects/*/memory/`) e das skills globais num repositório git
privado (`~/brain`, remoto `minha-org/brain`). Os workflows de triagem baixam esse
repositório ao lado do repo do cliente pra ler o mesmo contexto que o operador tem no Mac.
Uma via: o Mac escreve, a nuvem lê. Log em `~/Library/Logs/brain-sync.log`.

## Despacho: triagem dos grupos por agente + fila de decisões

Duas vezes por dia o workflow `.github/workflows/triagem.yml` (repo `whatsapp-automation`)
consulta `GET /api/v1/agente/fila`, e pra cada chat com agente ligado e mensagem nova roda o
Claude com o repo do cliente, o MCP `whatsapp-collector` em modo remoto e o brain ao lado.
Ele cria issues organizadas no repo do cliente e devolve itens de decisão; o coletor manda a
fila pro self-chat do operador, que responde `ok N`, `não N`, `edita N: texto` ou `ok todos`.

Ligar por chat: tela `/links` (seletor `agente: off | issue | pr`) ou `definir_modo({ grupo, agente })`
no MCP. `issue` cria a issue e espera o `ok`; `pr` já sai marcada pro executor (etapa 2).
Segredos do workflow: `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`), `AGENTE_GITHUB_TOKEN`,
`WAC_API_TOKEN` (`node scripts/api-token.mjs criar …` na nuvem), `WAC_CLOUD_*`, `OPENROUTER_API_KEY`.
No coletor, `AGENTE_GITHUB_TOKEN` habilita o `ok N` aplicar label e o `não N` fechar issue.

### Etapa 2: executor de PR

Issue com a label `claude` (aplicada pelo `ok N` do despacho, ou pela triagem em modo `pr`) dispara,
no repositório do cliente, o workflow reutilizável `minha-org/agentes/.github/workflows/agente-pr.yml`:
o Claude implementa só o que a issue pede, roda os testes do repositório e abre um PR draft com `Closes #n`.
Instalar num cliente: `scripts/agente-pr-instalar.sh owner/repo` (abre um PR com o chamador de 15 linhas).
Secret necessário em cada repositório: `printf '%s' "$TOKEN" | scripts/agente-secrets.sh CLAUDE_CODE_OAUTH_TOKEN`.

## Dashboard: contrato, entregas e sinais

`/dashboard` cruza a atividade dos últimos 30 dias com o **contrato** de cada cliente (estado, início, fim,
valor mensal — editável no painel lateral do chat ou via tool MCP `definir_contrato`) e com as **entregas**
registradas (`registrar_feature` via MCP, ou automático: o workflow `features.yml` registra todo PR mergeado
que fecha uma issue `whatsapp`). Sinais: contrato encerrado com cliente ativo, cliente ativo sem contrato,
pausado ativo, renovação em até 30 dias, ativo sem entrega em 30 dias. A tool MCP `dashboard` devolve o
mesmo modelo pra IA responder "quem está ativo demais pro contrato" sem abrir a tela.

A tabela lista os grupos monitorados; DMs entram no dashboard quando têm contrato ou entrega registrada.
Uma entrega com `ref` (URL do PR/issue) não duplica dentro do mesmo chat — a mesma `ref` em outro cliente
é outra entrega.

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
