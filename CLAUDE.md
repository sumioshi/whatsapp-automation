<!-- wa-link:start -->
WhatsApp deste projeto: `<slug-do-grupo>` (<nome do chat>). Consulte o histórico via MCP
`whatsapp-collector` usando esse slug (ex: resumo_do_dia, ler_mensagens, buscar). Pra acompanhar
ativamente (ser acordado quando chega msg), arme um Monitor no `data/<slug-do-grupo>/messages.jsonl`
— ver "Vocabulário de acompanhamento" abaixo. Detalhes em `.claude/whatsapp.json`.
(Bloco gerado pelo `/link-whatsapp`; copie `.claude/whatsapp.json.example` pra começar.)
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
persistente, filtrando o que é seu (`fromMe`). São duas receitas conforme a fonte:

**Receita PADRÃO (nuvem, SSE — funciona com o Mac "limpo", sem coletor local):** use a skill
global **`/plantao`** (`.claude/skills/plantao/`), que faz o fluxo completo — resolve slug, checa
e liga o `watch` do grupo (pegadinha: grupo novo nasce com captura desligada), mata zumbi e arma:

```
Monitor(persistent: true, command: scripts/plantao-stream.sh <slug> [<slug2> ...])
```

O script (`scripts/plantao-stream.sh`) encapsula o SSE de `GET /api/events?slug=a,b` + reconexão
COM retomada (`Last-Event-ID`, nada se perde no buraco) + lock por conjunto de chats (segunda
instância sai com código 3) + filtro: imprime `Fulano: texto` (recebida), `Você (celular)`/`Você
(web)` (o operador respondeu na mão → contexto, não responda por cima) e `IA da Meta (sua conta)`;
o que o próprio MCP/painel mandou (`origem: coletor`) não desce. `--alertar` acompanha todos os
chats com alerta ligado. Requer `WAC_CLOUD_*` no `.env` da raiz (ele mesmo carrega). Use path
absoluto se a sessão estiver fora do repo.

**Coletor PESSOAL:** o 2º container (WhatsApp pessoal do operador) tem MCP próprio,
`whatsapp-pessoal` (mesmas tools, outro trio de acesso — contas e slugs diferentes). Plantão nele:
`PLANTAO_CLOUD=pessoal scripts/plantao-stream.sh <slug>` (trio `WAC_PESSOAL_*` no arquivo de ambiente).

**Receita LOCAL (coletor local ligado via `npm run dev`):** vigia o arquivo direto — latência
zero, mas só atualiza com o coletor local rodando:

```
Monitor(persistent: true, command:
  F="data/<slug>/messages.jsonl"; touch "$F"
  tail -n0 -F "$F" | while IFS= read -r line; do
    echo "$line" | python3 -c 'import sys,json;
m=json.loads(sys.stdin.read()); t=(m.get("text") or "").strip() or "["+m.get("type","")+"]"
o=m.get("origem")
if m.get("fromMe"): print("Você ("+o+"): "+t, flush=True) if o in ("celular","web") else None
else: print((m.get("senderName") or m.get("sender") or "?")+": "+t, flush=True)'
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

### Cancelar um envio em andamento (Esc / "cancela")

A entrega humanizada garante ≥ 5 s de visto/digitando antes do 1º balão — é a janela pra cancelar.
O **Esc** do operador durante `responder`/`responder_midia` viaja até o coletor e segura o próximo
balão (o que já saiu fica). Se ele disser **"cancela"** no meio de um envio, chame
`cancelar_envio(grupo)` **na hora, sem confirmar** — é o caminho manual quando o Esc não propaga.
O `responder` devolve `cancelado: true` + `enviados`; **depois de qualquer cancelamento,
`ler_mensagens` no chat antes de reenviar**: parte pode ter saído.

## Despacho (fila de decisões)

Itens numerados chegam no self-chat do operador depois de cada passada da triagem. Ele responde
`ok N` / `não N` / `edita N: texto` / `ok todos` ali mesmo; o coletor executa. O agente de triagem
por chat liga em `/links` ou via `definir_modo({ grupo, agente: "issue" })`. Detalhes na spec
`docs/superpowers/specs/2026-09-04-despacho-agente-github-design.md`. A label `claude` numa issue
dispara o executor de PR (`minha-org/agentes`), que abre um PR draft no repositório do cliente.

## Entregas e contrato

Ao concluir uma funcionalidade pra um cliente, chame `registrar_feature(grupo, nome, ref)` — é o que alimenta
o contador de entregas do dashboard. Estado comercial do chat: `definir_contrato`. Pra saber quem está ativo
demais pro contrato ou perto de renovar: tool `dashboard` (ou a tela `/dashboard`).

## Mídia na nuvem (`midia_pendente`) — NÃO é erro

Tem dois coletores: o do Mac (local) e o da nuvem (Railway, histórico 24/7). A nuvem é a fonte
completa; o Mac só tem o que capturou ligado. Quando uma mensagem de mídia vem com
`midia_pendente: true` (sem arquivo local), com a **nuvem ligada** (`WAC_CLOUD_*` no `.env`) isso é
**normal**: o arquivo está na nuvem e `ver_imagem`/`ver_video`/`transcrever`/`ler_documento` baixam
**sob demanda** (via `ensureLocalMedia`). Então **não se incomode com `midia_pendente`** — chame a
tool de mídia normalmente, ela busca da nuvem. Só num setup 100% local (sem `WAC_CLOUD_*`) é que
`midia_pendente` significa "essa mídia não foi capturada aqui".

## Grupo renomeado ≠ chat morto (slug é estável)

O slug é **estável por jid** (persistido no `groups.config.json` no primeiro contato); renomear
o grupo muda só o nome exibido, o diretório/slug fica. `listar_grupos` traz `renomeados` quando
nome atual ≠ slug; `ler_mensagens`/`responder` aceitam o nome novo e traduzem pro slug estável.
Chat que "parou de receber" enquanto os outros seguem vivos → suspeite de rename antes de achar
que o sync quebrou. Split legado (rename anterior à feature): `npm run migrar-slug -- <canonico> <duplicado>`.

## Organização da info de mensagem (pra não se perder)

O `ler_mensagens` separa coisas que antes confundiam a leitura:
- **`legenda`** (texto que veio COM a mídia, descreve aquele vídeo/imagem) vs **`texto`** (msg de
  texto solta). Vídeo escrito junto → `legenda`; vídeo e DEPOIS um texto → duas msgs, a 2ª com `texto`.
- **`rajada`** (id): msgs coladas do mesmo remetente (vídeo+texto+áudio numa tacada, gap < 90s)
  compartilham o mesmo `rajada` — trate como um bloco do mesmo assunto, não itens soltos.
- **`citacao`/`citacao_de`**: a msg responde (reply) outra — o texto citado e quem mandou.
- **`origem`** (só em msg da própria conta): `coletor` = este agente/MCP/painel mandou; `celular`/
  `web` = o operador respondeu na mão; `ia_meta` = IA da Meta em nome da conta (aí `de` vira
  "IA da Meta"). Ausente = recebida ou anterior à feature. Diz quem de fato escreveu um "Você".

Contratos de tool que já confundiram agentes (leia o retorno, não chute parâmetro):
- **`transcrever`**: uma mídia específica é `mediaPath` (campo `midia`) OU `id` (campo `id`); sem
  os dois = lote de até 8 NOVOS pendentes (o que já tem transcrição vem em `em_cache`, não gasta
  vaga, e o lote avança a cada chamada). A transcrição feita no Mac é publicada na nuvem, então
  `ler_mensagens` passa a trazer `transcricao`.
- **`responder`**: quando você já decidiu a quebra em N balões, passe `baloes: [...]` (até 8) numa
  chamada só. NUNCA chame `responder` N vezes pra simular balões — cada chamada é uma entrega
  separada, com visto/digitando e janela de cancelamento.

## Baileys: dependência, não fork (como ficar atualizado)

O coletor **usa** o Baileys como lib npm (`baileys`, canal `7.0.0-rc*`), com um patch local em
`patches/` reaplicado pelo `patch-package` no `postinstall`. Não é fork: atualizar é bump de versão.
Três camadas mantêm o projeto em dia:
- **Dependabot** (`.github/dependabot.yml`): só pro `baileys`, semanal, abre PR quando sai versão.
- **Bump manual:** `npm install baileys@<versão>`; se o patch não bater, reaplique o hunk de
  `process-message.js` e regenere com `npx patch-package baileys` (apague o `.patch` antigo).
- **Vigia no radar do coletor:** uma vez por dia checa a `master` do Baileys e o dist-tag do npm e
  manda resumo no self-chat do operador. Config em `radar.config.json`: `upstreamAtivo`
  (default true) e `upstreamIntervaloH` (default 24). Estado em `.radar-status.json` → `upstream`.
