---
name: run-whatsapp-automation
description: Build, run, and drive the WhatsApp group collector — the Baileys collector daemon, the Next.js panel, the MLX transcriber service, and the MCP server. Use to run/start/build/screenshot the project or to call its MCP tools (listar_grupos, ler_mensagens, buscar, resumo_do_dia, ver_imagem, ver_video, ler_documento, transcrever, listar_contatos, preparar_resposta, revisar_texto, responder, responder_midia, cancelar_envio, alertar_chat, novidades). ALSO use whenever asked to send, reply, or draft a message in a WhatsApp group: the rule is to run the draft through preparar_resposta and the operator's voice skill, review it with revisar_texto, then confirm the exact text with the user before sending.
---

# Run: WhatsApp Automation

Coleta conteúdo de grupos de WhatsApp (áudio/vídeo/imagem/documento/texto) e expõe
tudo pra IA. São **5 processos**: `wa-collector` (daemon Baileys), `wa-panel`
(Next.js em :3000), `wa-transcriber` (serviço MLX em :4320), `wa-notifier`
(notificação de mensagens de cliente, ver seção abaixo) e o **MCP server**
(stdio, sob demanda). O MCP é dirigido pelo **driver** abaixo. Tools de escrita
`preparar_resposta` (contexto antes de redigir) e `revisar_texto` (revisa sem
enviar) entram no pipeline de envio — ver seção "Regra: enviar mensagem no
grupo" abaixo.

> **Como os 3 primeiros rodam:** em **dev local** (o caso atual) é `npm run dev` na
> raiz, que sobe os três via `concurrently` — **não pm2**. Em **produção** é pm2
> (`ecosystem.config.cjs`). Os dois caminhos existem; veja "Run" abaixo. `pm2 ls`
> vazio NÃO significa serviços fora — confirme sempre pelos smoke `curl`
> (:3000 / :4310 / :4320), não pelo pm2.

> **Plataforma: macOS Apple Silicon.** A transcrição usa `mlx_whisper` (MLX), que
> **só roda em Apple Silicon** — em Linux o coletor e o painel sobem, mas o
> transcriber não. Paths neste arquivo são relativos à raiz do repo.

## Dois coletores, dois servidores MCP

- **`whatsapp-collector`** = coletor PRINCIPAL (número business, clientes). É o default.
- **`whatsapp-pessoal`** = coletor PESSOAL (2º container na Railway, WhatsApp pessoal do operador).
  Mesmas tools, mesmo código, outro trio de acesso. Use quando o operador disser "no pessoal",
  "meu WhatsApp pessoal", ou o chat não existir no principal. Contas diferentes → slugs diferentes;
  `listar_grupos` em cada um. Plantão no pessoal: `PLANTAO_CLOUD=pessoal` no `plantao-stream.sh`.

## ⚠️ Regra: enviar mensagem no grupo → humanizar SEMPRE

Sempre que o usuário pedir para **enviar, responder ou redigir uma mensagem** num
grupo (via `responder`, `responder_midia` com legenda, pelo painel, ou pela API de controle `:4310`):

Pipeline de envio: `preparar_resposta(grupo)` → redigir com a skill de voz do operador e
`comunicacao-cliente` (humanizer só em texto longo) → no modo `confirmar`, `revisar_texto` e
mostrar ao operador o texto já revisado → `responder` com `candidatos` (2-3 versões) ou
`baloes`. Se a revisão recusar, reescreva seguindo `sugestoes`; não use `revisao: 'ignorar'`
sem OK explícito do operador.

1. **Antes de redigir**, chame `preparar_resposta(grupo)` — devolve o estilo recente do chat
   e o que o cliente deixou em aberto, com `instrucoes` numéricas.
2. **Rascunhe** a mensagem com a skill de voz do operador (`voz-do-operador`).
3. **Se for mensagem pra cliente/parceiro**, aplique também a skill
   **`comunicacao-cliente`** — cuida do tom de relacionamento (Carnegie + Voss) e corta os
   tells que o cliente percebe (dois-pontos de introdução, "Gente/Pessoal", formatação,
   dramatizar). Reserve a skill `humanizer` pra texto LONGO (proposta, changelog em
   parágrafos) — num balão de conversa não agrega, a voz do operador já cobre os tells.
4. **Confirme antes de enviar** (mostre texto + grupo), EXCETO quando o usuário já
   liberou envio direto pra aquele contexto (ex: suporte técnico onde ele autorizou
   responder o cliente na hora). No modo `confirmar`, rode `revisar_texto` primeiro e
   mostre ao operador o texto já revisado (fica mais fácil aprovar sabendo que passou).
5. Só então envie: `responder` aceita `candidatos` (2-3 versões — o código envia a que
   menos destoa do chat) ou `baloes` (já decidida a quebra). A revisão de estilo (`web/lib/estilo/`)
   roda dentro do `responder`/`responder_midia`/`editar_mensagem` antes do envio de verdade;
   se recusar, ela devolve `hits`/`sugestoes` — reescreva e chame de novo, nada foi enviado.
   `revisao: 'ignorar'` pula só o score (nunca os bloqueios) e só com OK explícito do operador
   pro texto exatamente como está.
6. **Cancelamento:** a entrega humanizada dá ≥ 5 s de "digitando" antes do 1º balão. Se o
   operador apertar Esc, o coletor segura o próximo balão; se ele disser "cancela" no meio
   de um envio, chame `cancelar_envio(grupo)` NA HORA, sem confirmar. Depois de qualquer
   cancelamento, `ler_mensagens` no chat antes de reenviar — parte pode ter saído.

Isso vale para qualquer envio a grupo — é uma regra fixa, não opcional.

## 🚨 Regras duras de envio

O caso clássico: um envio "falha" no transporte, o agente contorna re-enviando por outro canal —
e o destinatário recebe a mensagem em dobro (a original TINHA saído), mais um "teste" solto no
meio. Pra isso nunca acontecer:

1. **Nunca envie mensagem sem pedido explícito do operador PARA AQUELE chat** — nem "teste",
   nem diagnóstico, nem "confirmar que o canal voltou". Envio falhou? Reporte a falha e pare;
   não contorne enviando por outro canal.
2. **Mensagem de teste é só em chat de teste** (um grupo dedicado a isso) — jamais em chat real.
3. **Antes de re-tentar um envio que "falhou":** rode `ler_mensagens` no chat e confira se a
   mensagem original saiu (`fromMe` recente com o mesmo texto). Erro de transporte NÃO significa
   que a mensagem não chegou. Só re-envie se comprovadamente não saiu.
4. **`Erro: fetch failed` no `responder`** normalmente é o MCP da sessão desatualizado (config
   carregada no boot) ou o coletor local desligado. O fix é reconectar o MCP (`/mcp` → reconnect)
   ou reiniciar a sessão — não é improvisar um canal alternativo de envio.

> Instale a skill `humanizer` uma vez (global):
> `git clone https://github.com/blader/humanizer.git ~/.claude/skills/humanizer`

## Prerequisites

```bash
# Node 20+ (testado v24), pm2, ffmpeg, e o mlx_whisper via uv tool
brew install ffmpeg
npm install -g pm2
uv tool install mlx-whisper        # instala em ~/.local/share/uv/tools/mlx-whisper
```

Precisa de uma **conta de WhatsApp** pra parear (QR na 1ª execução).

## Build

```bash
npm install                  # deps do coletor (raiz)
npm run build                # coletor -> dist/
cd web && npm install && npm run build && cd ..   # painel + MCP (Next.js)
```

## Run

**Dev local (o caso atual):** um comando na raiz sobe os três processos via `concurrently`.

```bash
npm run dev                   # roda `npm run sync` e sobe collector + panel + transcriber
```

**Produção (24/7):** pm2.

```bash
pm2 start ecosystem.config.cjs && pm2 save
pm2 ls                        # wa-collector / wa-panel / wa-transcriber = online
```

> Não confie no `pm2 ls` pra saber se está no ar — em dev ele vem **vazio** mesmo com
> tudo rodando. Use os smoke `curl` abaixo.

**1ª vez — parear:** abra `http://localhost:3000/config` (o QR aparece ali). Escaneie no
WhatsApp › Aparelhos conectados. A sessão fica em `auth/` e reconecta sozinha depois.
Marque os grupos a monitorar em `/config`.

Smoke dos serviços (todos devem responder):

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/   # 200
curl -s http://127.0.0.1:4310/health                              # {"ok":true}  (controle/envio)
curl -s http://127.0.0.1:4320/health                              # {"ok":true,...} (transcriber)
```

## Drive the MCP (agent path) — primary

O driver sobe o MCP server, faz o handshake stdio e lista/chama ferramentas:

```bash
# lista as ferramentas
node .claude/skills/run-whatsapp-automation/driver.mjs

# chamar uma ferramenta (args em JSON)
node .claude/skills/run-whatsapp-automation/driver.mjs call listar_grupos
node .claude/skills/run-whatsapp-automation/driver.mjs call buscar '{"texto":"MCP"}'
node .claude/skills/run-whatsapp-automation/driver.mjs call resumo_do_dia '{"grupo":"meu-grupo"}'
node .claude/skills/run-whatsapp-automation/driver.mjs call ver_imagem '{"grupo":"meu-grupo","mediaPath":"meu-grupo/image/<arquivo>.jpg"}'
node .claude/skills/run-whatsapp-automation/driver.mjs call ler_documento '{"grupo":"meu-grupo","mediaPath":"meu-grupo/document/<arquivo>.pdf"}'
node .claude/skills/run-whatsapp-automation/driver.mjs call ver_video '{"grupo":"meu-grupo","mediaPath":"meu-grupo/gif/<arquivo>.mp4","frames":3}'  # GIF/vídeo: amostra frames (precisa de ffmpeg)
# responder_midia ENVIA de verdade — só após confirmar com o usuário (legenda passa pelo humanizer):
node .claude/skills/run-whatsapp-automation/driver.mjs call responder_midia '{"grupo":"Acme Corp","kind":"document","path":"/abs/contrato.pdf","fileName":"contrato.pdf","caption":"segue o contrato"}'
# alertar_chat liga/desliga a notificação no Mac de um chat; novidades puxa o que chegou (ver seção abaixo):
node .claude/skills/run-whatsapp-automation/driver.mjs call alertar_chat '{"grupo":"dm-<id>","ativar":true}'
node .claude/skills/run-whatsapp-automation/driver.mjs call novidades '{}'
```

O driver resolve a raiz do repo sozinho e injeta `WAC_DATA_DIR`/`WAC_GROUPS_CONFIG`
absolutos. Saída de texto vai pro stdout; imagens viram `[imagem image/jpeg, N bytes]`.

**No Claude Code** o MCP já está registrado em `.mcp.json` (escopo do projeto) —
aprove no 1º uso; ferramentas novas exigem reload da sessão.

## Drive the panel (web)

Web app em `http://localhost:3000`. Telas: `/` (grupos), `/g/<slug>` (timeline),
`/config` (conexão/QR, grupos, time, modelo), `/novo` (nova conversa), `/links`
(linkar projeto↔conversa, ver seção abaixo). Verificado por navegador (screenshot)
e pelos `curl` acima.

## Monitorar / acompanhar (grupos e DMs)

Três coisas distintas — não confunda (é onde os agentes mais se perdem):

- **Coleta** (`watch`): a flag `watch` em `groups.config.json` (ou no painel `/config`)
  liga/desliga a captura — e **só vale pra grupo**. **DM é coletado SEMPRE,
  automaticamente**, desde a 1ª mensagem; não há (nem precisa) flag pra ligar. O slug
  de um DM é `dm-<id>` (ex: `dm-<id>`).
- **Copiloto do painel** (`copilot` no `.triage.json`): liga sugestões de resposta
  **dentro da interface web** (não envia nada). É uma IA embutida no painel, **opt-in
  por conversa, ligada só pelo painel**. NÃO é o agente que consome este MCP — se você
  é o Claude/Codex usando o MCP, o copiloto do painel não te diz respeito.
- **Alerta / wake-on-message** (`alertar` no `.triage.json`): opt-in por conversa pra **ser
  avisado quando chega mensagem de cliente**. Liga com `alertar_chat {grupo, ativar}` (ou no
  painel). Um processo `wa-notifier` (separado) observa os chats marcados e dispara uma
  **notificação no Mac** quando o cliente escreve. Ao ser avisado, chame `novidades` pra puxar
  o que chegou desde a última vez (avança um checkpoint próprio; `marcar:false` só espia).
- **Triagem**: `marcar_resolvido` / `silenciar_grupo` / `anotar` / `ler_notas` /
  `estado_triagem` — tudo por slug, vale pra DM também.

> Pedido típico: "acompanhar/monitorar o contato do fulano". O DM **já está coletado**
> (procure a pasta `dm-<id>` em `data/`, use `listar_grupos`/`ler_mensagens`). **Não saia
> procurando uma flag de watch pra DM — ela não existe.** Pra "ser avisado quando ele
> escrever", ligue `alertar_chat`; o `wa-notifier` te notifica e você puxa com `novidades`.
> (Lembrete técnico: não há push que acorde uma sessão Claude ociosa — a notificação é pro
> humano, que então te aciona; daí você chama `novidades`.)

## Linkar um projeto a uma conversa

Amarra um repositório de cliente a um grupo/DM, pra qualquer Claude aberto naquele repo
já saber qual conversa consultar. Dois lados:

- **No repo do cliente:** `.claude/whatsapp.json` (`{ grupo, cliente, tipo, notas }`,
  `grupo` = slug) + uma linha entre `<!-- wa-link:start -->` / `<!-- wa-link:end -->` no
  `CLAUDE.md` (é ela que faz o Claude descobrir o link sozinho no boot). Versionar é a
  critério do dono do repo.
- **Aqui:** `data/links.json` (índice central slug→repo que o painel usa). Gitignored.

**Criar** (não improvise outro caminho): o slash command `/link-whatsapp` rodado dentro
do repo do cliente, **ou** a tela `/links` do painel. Os dois escrevem os dois lados.

**Consumir** (Claude no repo do cliente): leia `.claude/whatsapp.json`, pegue o `grupo`,
e use esse slug nas chamadas do MCP `whatsapp-collector` (`resumo_do_dia`, `ler_mensagens`,
`buscar`, etc.). Se central e repo divergirem (ex: repo movido), **re-rode o link** em vez
de caçar o caminho certo.

## Human path

`cd web && npm run dev` sobe só o painel em :3000 (útil pra mexer no front sem o coletor).
O `npm run dev` da raiz sobe os três juntos (ver "Run").

## Sync nuvem→Mac (opcional)

Quando o coletor roda 24/7 na nuvem (captura mesmo com o Mac desligado), o Mac puxa
o que perdeu no período off via `WAC_CLOUD_URL`/`WAC_CLOUD_USER`/`WAC_CLOUD_PASS` no
`.env` (URL do painel na nuvem + Basic Auth). Com isso:
- `npm run dev` roda `npm run sync` **antes** de subir o coletor local (janela
  segura) — merge por `id` do `messages.jsonl` (+ sidecars) da nuvem no `data/`
  local, sem perder o que o coletor local já gravou. `npm run sync` roda o pull à mão.
- **Mídia sob demanda:** ao transcrever/ver uma mídia que só chegou na nuvem durante
  o off (`ensureLocalMedia`), o Mac baixa o arquivo e cacheia. Sem `WAC_CLOUD_URL`,
  tudo se comporta como antes (sync e fallback desligados).
- O coletor local segue rodando (redundância); a nuvem é o backup que preenche gaps.
- **Escopo** (`WAC_SYNC_SCOPE`): `local` (default) só sincroniza grupos que o Mac já tem; `all` traz tudo (a nuvem tem ~373 grupos/DMs da history sync vs ~37 acompanhados). Paralelismo via `WAC_SYNC_CONCURRENCY` (default 8). O texto vai **gzipado** (o `tailscale serve` userspace trava com payloads >~1.5MB).

## Gotchas (cicatrizes)

- **MLX é Apple-Silicon only.** `mlx_whisper` não importa no python padrão (instalado via `uv tool`); o `ecosystem.config.cjs` aponta o `interpreter` pra `~/.local/share/uv/tools/mlx-whisper/bin/python`. Em Linux, troque por whisper.cpp.
- **Transcriber é preguiçoso/morno:** ~2.4MB parado, carrega o modelo no 1º uso (~3.8s), reusa quente (~1.3s), e **libera a RAM após 180s ocioso**. Se o serviço estiver fora, o Node cai pro CLI `mlx_whisper` (mais lento).
- **Mensagens próprias enviadas pela API vêm como `type:'append'`** no Baileys (não `'notify'`) — por isso o `gateway.sendText` mapeia e emite a própria mensagem; senão o balão "Você" não aparece. As enviadas do celular em tempo real são `'notify'`.
- **MCP via tsx:** o `tsx` está em `web/node_modules` (não na raiz). O driver usa `web/node_modules/.bin/tsx`. `web` não é `type:module` → o server usa `main()` (top-level await quebraria em CJS).
- **Envio é real e local:** controle (:4310) e painel mandam mensagem como você — só em `127.0.0.1`, nunca expor. Boot do pm2 exige `pm2 startup` (sudo, 1x).
- **`data/`, `auth/`, `groups.config.json`** são gitignored (conteúdo + sessão). Não versionar.
- **Grupo renomeado NÃO muda o slug.** O slug é estável por jid (persistido no
  `groups.config.json` na primeira vez que o grupo é visto); renomear só troca o `name`.
  `listar_grupos` traz um bloco `renomeados` quando nome atual ≠ slug, e
  `ler_mensagens`/`responder` aceitam o nome novo e traduzem pro slug estável sozinhos.
  Se um chat parecer "mudo"/congelado, suspeite de rename ANTES de achar que o sync quebrou.
  Diretório duplicado de rename antigo (anterior à feature): fundir com
  `npm run migrar-slug -- <slug-canonico> <slug-duplicado>` (na nuvem: via `railway ssh`,
  `cd /app && npx tsx scripts/migrar-slug.ts ...`).

## Troubleshooting

| Sintoma | Fix |
|---|---|
| `ModuleNotFoundError: mlx_whisper` | Use o python do uv tool (o ecosystem já seta `interpreter`). |
| driver: `spawn .../tsx ENOENT` | `cd web && npm install -D tsx` |
| `Top-level await ... cjs` no MCP | server precisa do wrapper `main()` (já aplicado). |
| Balão "Você" não aparece após enviar | coletor precisa do `gateway.sendText` que auto-emite (rebuild `npm run build` + `pm2 restart wa-collector`). |
| `connection: qr` não some | pareie o QR em `/config`; sessão deslogada → apague `auth/` e pareie de novo. |
| Chat "parou de receber" mas outros chats seguem vivos | Provável rename do grupo: confira `renomeados` no `listar_grupos` e siga usando o slug estável; split antigo → `npm run migrar-slug`. |
