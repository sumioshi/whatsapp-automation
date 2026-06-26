<!-- wa-link:start -->
WhatsApp deste projeto: `teste` (Teste interno). Consulte o histórico via MCP `whatsapp-collector`
usando esse slug (ex: resumo_do_dia, ler_mensagens, buscar). Pra acompanhar ativamente (ser
acordado quando chega msg), arme um Monitor no `data/teste/messages.jsonl` — ver "Vocabulário de
acompanhamento" abaixo. Detalhes em `.claude/whatsapp.json`.
<!-- wa-link:end -->

## Vocabulário de acompanhamento (desambiguação)

"monitor" significava três coisas diferentes e isso já custou confusão. Mapa:

- **"monitor" / "fica de olho" / "me avisa quando chegar mensagem" / "modo autônomo"** → o operador
  quer ser AVISADO/o agente quer ser ACORDADO quando chega mensagem nova. Isso é a tool **Monitor**
  do harness, vigiando o arquivo de mensagens. **Não** é `alertar_chat`.
- **"alerta" / "notifica no Mac"** → notificação de tela pro humano (o operador) quando chega msg de
  cliente. Tool MCP **`alertar_chat`**. NÃO acorda o agente.
- **"a cada X min" / "puxa assunto sozinho" / "fica mandando mensagem"** → re-executar um prompt em
  intervalo. É o **`/loop`** (ou `CronCreate`).

### Recipe do Monitor de mensagem (sem zumbi)

Pra ser acordado quando chega msg nova num chat (modo monitor/autônomo), arme **UM** Monitor
persistente no `messages.jsonl`, filtrando o que é seu (`fromMe`):

```
Monitor(persistent: true, command:
  F="data/<slug>/messages.jsonl"; touch "$F"
  tail -n0 -F "$F" | while IFS= read -r line; do
    echo "$line" | python3 -c 'import sys,json;
m=json.loads(sys.stdin.read());
sys.exit(0) if m.get("fromMe") else print((m.get("senderName") or m.get("sender") or "?")+": "+((m.get("text") or "").strip() or "["+m.get("type","")+"]"), flush=True)'
  done)
```

**REGRA: antes de armar um Monitor novo pra um chat, mate o antigo** (TaskList → TaskStop). Armar
sem matar gera monitores zumbis que disparam o mesmo evento 2-3× (resposta em triplicata). Idem pros
crons do `/loop`: só um por chat.

## Modo de envio por chat (confirmar vs autônomo)

Cada chat tem um modo, persistido (tool `definir_modo`, lido pelo `responder`):

- **`confirmar` (DEFAULT)** — antes de enviar pra esse chat, MOSTRE o texto e espere o OK do operador
  (passando por humanizer + comunicacao-cliente). Nenhum cliente real recebe msg sem ele ver.
- **`autonomo`** — pode enviar direto, sem confirmar. Ligue com `definir_modo(grupo, autonomo: true)`.

O retorno do `responder` traz o `modo` do chat. É **convenção que a IA respeita**, não trava de
código — então NÃO burle o `confirmar`. Pra saber o modo de um chat sem enviar, use `estado_triagem`.

## Mídia na nuvem (`midia_pendente`) — NÃO é erro

Tem dois coletores: o do Mac (local) e o da nuvem (Railway, histórico 24/7). A nuvem é a fonte
completa; o Mac só tem o que capturou ligado. Quando uma mensagem de mídia vem com
`midia_pendente: true` (sem arquivo local), com a **nuvem ligada** (`WAC_CLOUD_*` no `.env`) isso é
**normal**: o arquivo está na nuvem e `ver_imagem`/`ver_video`/`transcrever`/`ler_documento` baixam
**sob demanda** (via `ensureLocalMedia`). Então **não se incomode com `midia_pendente`** — chame a
tool de mídia normalmente, ela busca da nuvem. Só num setup 100% local (sem `WAC_CLOUD_*`) é que
`midia_pendente` significa "essa mídia não foi capturada aqui".

## Organização da info de mensagem (pra não se perder)

O `ler_mensagens` separa coisas que antes confundiam a leitura:
- **`legenda`** (texto que veio COM a mídia, descreve aquele vídeo/imagem) vs **`texto`** (msg de
  texto solta). Vídeo escrito junto → `legenda`; vídeo e DEPOIS um texto → duas msgs, a 2ª com `texto`.
- **`rajada`** (id): msgs coladas do mesmo remetente (vídeo+texto+áudio numa tacada, gap < 90s)
  compartilham o mesmo `rajada` — trate como um bloco do mesmo assunto, não itens soltos.
- **`citacao`/`citacao_de`**: a msg responde (reply) outra — o texto citado e quem mandou.
