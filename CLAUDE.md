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

Pra ser acordado quando chega msg nova num chat (modo monitor/autônomo), arme **UM** Monitor,
filtrando o que é seu (`fromMe`). O Monitor do harness expira em no máximo 30 min
(`timeout_ms: 1800000`; não existe mais `persistent`): na notificação de expiração, rearme com o
mesmo command. São duas receitas conforme a fonte:

**Receita PADRÃO (nuvem, SSE — funciona com o Mac "limpo", sem coletor local):** use a skill
global **`/plantao`** (`.claude/skills/plantao/`), que faz o fluxo completo — resolve slug, checa
e liga o `watch` do grupo (pegadinha: grupo novo nasce com captura desligada), mata zumbi e arma:

```
Monitor(timeout_ms: 1800000, command: scripts/plantao-stream.sh <slug> [<slug2> ...])
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
Monitor(timeout_ms: 1800000, command:
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
  (texto já passado pela skill de voz do operador e pela `comunicacao-cliente`, nesta ordem).
  Nenhum cliente real recebe msg sem ele ver.
- **`autonomo`** — pode enviar direto, sem confirmar. Ligue com `definir_modo(grupo, autonomo: true)`.

O retorno do `responder` traz o `modo` do chat. É **convenção que a IA respeita**, não trava de
código — então NÃO burle o `confirmar`. Pra saber o modo de um chat sem enviar, use `estado_triagem`.

## Revisão de texto antes do envio (código, não convenção)

`responder`, `responder_midia` (legenda) e `editar_mensagem` passam o texto por uma revisão
determinística ANTES de enviar (`web/lib/estilo/`), no molde da trava do "tu": bloqueio
(tratamento errado, confissão de culpa tipo "culpa minha/foi mal") nunca passa; o resto soma
num score contra as últimas 5 mensagens da conta no chat e contra o baseline medido do
operador (dois-pontos de introdução, travessão, ponto final, abertura repetida, mesma palavra,
paráfrase, saudação com menos de 1 h, "acabei/sem querer", drama, minimizador,
desculpa repetida). Score ≥ 4 ou hit grave = recusa com `hits` e `sugestoes`; reescreva e chame
de novo, nada foi enviado. Calibrado no histórico real dele: 5,8% das mensagens dele seriam
recusadas (orçamento de 6%).

- **Antes de redigir:** `preparar_resposta(grupo)` devolve o estilo recente e o que o cliente
  deixou em aberto, com `instrucoes` numéricas. Escreva variando de propósito.
- **Candidatos:** mande 2-3 versões em `candidatos` e o código envia a que menos destoa.
  `revisar_texto` revisa sem enviar (útil no modo `confirmar`).
- **`revisao: 'ignorar'`** pula só o score, nunca bloqueios, e só quando o operador aprovou o
  texto exatamente assim.
- Baseline: `npm run estilo-baseline` recalcula de `.private/voz/` para `data/.estilo-baseline.json`;
  chat com ≥ 100 mensagens do próprio operador usa baseline próprio. Registro em
  `data/.revisoes.jsonl` (score, hits, enviado) para recalibrar.

### Entrega por ticket (latência humana) e cancelamento

`responder` NÃO envia na hora: devolve um `ticket` e a mensagem sai depois, com latência humana
(conversa ativa: mediana ~30 s; conversa fria: minutos a horas, teto 4 h; hora do dia, expediente
e ritmo do cliente entram na conta). O visto sai antes do "digitando", na hora certa, e a
digitação anda na velocidade medida do operador. Se o cliente escrever antes do 1º balão, o
ticket é interrompido e o plantão imprime `Entrega interrompida (mensagem nova, 0/3 saiu)` —
releia o chat e responda de novo. Se o operador responder na mão (celular/web), idem. Novo
`responder` no mesmo chat substitui o ticket anterior. `urgencia: 'agora'` = só a janela de 5 s
(cliente esperando um ok); `'calma'` = update sem pressa. `status_envio(grupo|ticket)` consulta;
`cancelar_envio(grupo|ticket)` cancela agendado ou em andamento — se ele disser **"cancela"**,
chame **na hora, sem confirmar**. `aguardar: true` segura a chamada como antes (Esc aborta).
**Depois de qualquer cancelamento ou interrupção, `ler_mensagens` no chat antes de reenviar**:
parte pode ter saído. `citar: <id>` responde uma mensagem específica (reply). Typos ligados: a
correção sai como balão `*palavra`, nunca edição. Teto por chat: `definir_modo(grupo,
latencia_maxima_s)`. Config em `data/expediente.json`: `segurarEnvios` (represa até a próxima
abertura em vez de só atrasar) e `presencaCoerente` (online ao ler/digitar, offline depois).

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
- **DM por número**: se você JÁ TEM o telefone, a DM é `dm-<55DDDnúmero>` (só dígitos) em
  `ler_mensagens`/`responder`. Telefone e LID da mesma pessoa são fundidos na leitura (o retorno
  avisa em `nota_fusao`). Não use `listar_contatos` pra "achar" um número que você já tem.
- **`listar_contatos`**: SEMPRE com `busca` (nome ou número, com ou sem o nono dígito). Sem filtro a
  conta pode ter milhares de contatos e só vêm os 100 primeiros. O retorno traz `slug` da DM.

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
