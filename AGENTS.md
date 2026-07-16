# Instruções do projeto (Codex e outros agentes)

WhatsApp deste projeto: `<slug-do-grupo>` (<nome do chat>). Consulte o histórico via MCP
`whatsapp-collector` usando esse slug (ex: resumo_do_dia, ler_mensagens, buscar).
Detalhes em `.claude/whatsapp.json`. As skills do projeto estão em `.agents/skills/`
(mesmo padrão Agent Skills; fonte em `.claude/skills/`).

Este arquivo é o espelho do `CLAUDE.md` pra agentes fora do Claude Code. A skill
`plantao` possui um adaptador em `.agents/skills/plantao/`: ele usa o mecanismo
persistente de monitoramento disponível no runtime. Se o runtime atual não conseguir
despertar o agente quando chegar um evento, não declare que o plantão foi armado;
ofereça checar `novidades` sob demanda ou ligar `alertar_chat` (notificação no Mac).

## REGRAS DURAS de envio (não negociáveis)

1. **NUNCA envie mensagem sem pedido explícito do operador PARA AQUELE chat** — nem "de
   teste", nem diagnóstico. Falhou? Reporte a falha, não contorne enviando.
2. **Teste de envio é SÓ no grupo "Teste"** (slug `teste`) — nunca em chat de cliente/DM real.
3. **Antes de re-tentar um envio que "falhou" (por QUALQUER canal):** `ler_mensagens` no chat
   e confira se a mensagem original saiu (fromMe recente com o mesmo texto). Só re-envie se
   comprovadamente NÃO saiu — e mesmo assim confirmando com o operador. Retry cego já
   duplicou mensagens na frente de cliente.
4. **`editar_mensagem`: nunca escolha o msgId por posição ("a última").** Mensagem que o
   operador manda do celular também é `fromMe` (mesma conta). Sempre confira o TEXTO da msg
   alvo no `ler_mensagens` antes de editar.
5. Erro de conexão no `responder` = problema de transporte/config do MCP. NÃO improvise
   envio via curl na API.

## Redação de mensagem pra cliente

Antes de enviar qualquer mensagem a cliente/parceiro: rascunho → skill `humanizer`
(nível de usuário) → skill `comunicacao-cliente` (deste repo) → mostrar o texto ao
operador e esperar OK (ver modo abaixo).

## Modo de envio por chat (confirmar vs autônomo)

Cada chat tem um modo, persistido (tool `definir_modo`, lido pelo `responder`):

- **`confirmar` (DEFAULT)** — antes de enviar pra esse chat, MOSTRE o texto e espere o OK do
  operador. Nenhum cliente real recebe msg sem ele ver.
- **`autonomo`** — pode enviar direto, sem confirmar.

O retorno do `responder` traz o `modo` do chat. É **convenção que a IA respeita**, não trava
de código — NÃO burle o `confirmar`. Pra saber o modo sem enviar, use `estado_triagem`.

O `responder` entrega humanizado (visto → digitando → balões; demora ~10-40s, é normal).
Por default fatia em até 3 balões; `um_balao: true` manda o texto inteiro num balão só —
use pra texto coeso/técnico ou quando o operador pedir.

## Mídia na nuvem (`midia_pendente`) — NÃO é erro

Com a nuvem ligada (`WAC_CLOUD_*` no `.env`), mensagem de mídia com `midia_pendente: true`
é normal: o arquivo está na nuvem e `ver_imagem`/`ver_video`/`transcrever`/`ler_documento`
baixam sob demanda. Chame a tool de mídia normalmente. Só num setup 100% local é que
significa "não capturada aqui".

## Organização da info de mensagem

O `ler_mensagens` separa: **`legenda`** (texto que veio COM a mídia) vs **`texto`** (msg
solta); **`rajada`** (id de msgs coladas do mesmo remetente, gap < 90s — trate como um
bloco); **`citacao`/`citacao_de`** (reply — o texto citado e quem mandou).

## Ferramentas do repo

- Gerenciador: **npm** (NUNCA pnpm — quebra o node_modules). Subir tudo local: `npm run dev`.
- Testes: `npm test` (vitest). Deploy da nuvem: `railway up --service coletor --detach`
  (merge na main NÃO redeploya sozinho).
