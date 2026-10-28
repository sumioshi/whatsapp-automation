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

## Memória do projeto (leia antes de começar)

Decisões, incidentes e preferências do operador que não estão no código ficam em `.memoria/`
(link local para a memória do Claude Code; fora do git porque tem dado de cliente). Se o link
existir, leia `.memoria/MEMORY.md` no início: cada linha é um fato com um gancho, e o arquivo
apontado tem o detalhe. Abra só os que tocam a tarefa. O que estiver lá vale como contexto, mas
confira no código antes de afirmar que uma função, flag ou arquivo citado ainda existe.

Pra registrar algo novo (correção do operador, decisão de projeto, incidente), crie um arquivo
por fato no mesmo formato dos que já estão lá (frontmatter com `name`, `description` e
`metadata.type`; corpo com o fato, **Why:** e **How to apply:**), antes confira se já não existe
um sobre o assunto, e acrescente uma linha em `MEMORY.md`. Não grave o que o git ou o código já
contam.

## Config por runtime

Cada agente lê a sua pasta, mas o comportamento esperado é o mesmo nos três:

| Runtime | MCP | Hooks | Skills de projeto | Contexto |
|---|---|---|---|---|
| Claude Code | `.mcp.json` (raiz) ou escopo de usuário | `.claude/settings.json` + `.claude/hooks/` | `.claude/skills/` | `CLAUDE.md` |
| Codex | idem | `.codex/hooks.json` + `.codex/hooks/` | `.agents/skills/` | `AGENTS.md` |
| Qwen Code | `.mcp.json` (raiz) ou `.qwen/settings.json` | `.qwen/settings.json` + `.qwen/hooks/` | `.agents/skills/` | `AGENTS.md` |

- **`.mcp.json` é gitignored** (pode carregar segredo): parta de `.mcp.json.example` (modo local)
  ou `.mcp.json.remote.example` (modo remoto). Segredo bom vive no `.env` da raiz — o server MCP
  carrega esse arquivo no boot, então o registro não precisa repetir o trio da nuvem.
- **Qwen Code** lê o `.mcp.json` da raiz nativamente, mas servidor declarado por arquivo do
  workspace nasce *gated*: aprove uma vez com `qwen mcp approve <nome>` (ou pelo `/mcp`).
  A aprovação é chaveada pelo hash da config — editar o `.mcp.json` pede aprovação de novo.
  `qwen mcp list` mostra o estado de cada um.
- **Trava de voz** (nos três): `responder`/`responder_midia`/`editar_mensagem` são negadas quando
  a skill de voz do operador não foi carregada na sessão. O script `exigir-voz.sh` vive na pasta de
  hooks de cada runtime e `WAC_SKILLS_VOZ` lista os nomes que contam. Falha aberta se nenhuma skill
  de voz estiver instalada, se não houver transcript legível, e depois de 2 avisos na mesma sessão —
  é lembrete, não parede. Ao receber a negativa, carregue a skill e reescreva; não contorne.

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

## Grupo renomeado ≠ chat morto (slug é estável)

O slug é estável por jid (persistido no `groups.config.json`); renomear o grupo muda só o nome
exibido. `listar_grupos` traz `renomeados` quando nome atual ≠ slug, e `ler_mensagens`/`responder`
traduzem o nome novo pro slug estável. Chat "mudo" com os outros vivos → suspeite de rename.
Split legado: `npm run migrar-slug -- <canonico> <duplicado>`.

## Organização da info de mensagem

O `ler_mensagens` separa: **`legenda`** (texto que veio COM a mídia) vs **`texto`** (msg
solta); **`rajada`** (id de msgs coladas do mesmo remetente, gap < 90s — trate como um
bloco); **`citacao`/`citacao_de`** (reply — o texto citado e quem mandou).

## Ferramentas do repo

- Gerenciador: **npm** (NUNCA pnpm — quebra o node_modules). Subir tudo local: `npm run dev`.
- Testes: `npm test` (vitest). Deploy da nuvem: `railway up --service coletor --detach`
  (merge na main NÃO redeploya sozinho).
