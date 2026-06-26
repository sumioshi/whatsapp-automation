# IDEAS — funcionalidades e melhorias

Relatório de ideias para a central de triagem (Next.js 16 + coletor Baileys + MCP).
Usuário único, técnico (o operador), Mac, o dia todo em paralelo ao trabalho. O problema real é **triar muitos grupos de cliente sem garimpar**, e fazer isso de mãos dadas com a IA (Claude via MCP).

Convenções:
- **Esforço**: P (≤ meio dia), M (1–2 dias), G (≥ 3 dias / arquitetura).
- **Onde**: `painel` (só Next.js), `coletor` (precisa mexer no Baileys / control server), `MCP` (nova ferramenta), `dados` (formato de persistência novo).
- Já em andamento (não detalho): botão de descer pro fim, confirmação de leitura/visualizado, foto do grupo.

Estado que **já existe** hoje (pra não reinventar): tags por grupo, watch/monitorar, papéis me/team/client, busca por grupo na sidebar, busca por nome+tag na config, reações exibidas, menções resolvidas (`@você` em ember), reply citado exibido, transcrição sob demanda + lote, leitura de PDF/docx, poll de 3s, scroll-near-bottom, e 12 ferramentas MCP.

---

## 1. Organização / triagem — o problema central

> Esta é a frente de maior impacto. Hoje a triagem é "abrir grupo por grupo e ler". Tudo aqui ataca isso.

### 1.1 Badge "precisa resposta" / "você foi mencionado" na sidebar
Marcador por grupo na sidebar: dot ember se há `@você` não respondido, ou se a **última** mensagem do grupo é de um cliente (papel `client`) e não houve resposta sua depois.
- **Por quê**: é a pergunta nº1 do operador ("o que preciso responder?"). Hoje ele tem que abrir cada grupo pra descobrir. Os dados já existem (`fromMe`, `roleOf`, menções `@\d{6,}` resolvíveis com `ownIds`).
- **Esforço/onde**: M · `painel`. Lógica derivável do `messages.jsonl` que já é lido; só falta um endpoint que retorne, por grupo, `{ mentionsYou, awaitingReply, lastFromRole }`.
- **Pegadinhas**: "aguardando resposta" precisa de heurística — última mensagem `client` sem `me` depois dela. Áudio/figurinha contam como mensagem. Cuidar de grupos onde só o time conversa.

### 1.2 "Caixa de entrada" unificada do dia (cross-group)
Uma tela `/` (ou `/inbox`) que cruza **todos** os grupos monitorados e lista, em ordem cronológica, o que chegou hoje que pede atenção: menções a você, perguntas de cliente, mídias novas. Cada item linka pro ponto exato na timeline do grupo.
- **Por quê**: inverte o modelo. Em vez de "escolher um grupo e ler", o operador vê **um feed só** do que importa hoje cruzando 6+ grupos. É o maior ganho de tempo possível e encaixa no uso de "sessões rápidas".
- **Esforço/onde**: G · `painel` (+ talvez `MCP` espelhando como ferramenta `caixa_de_entrada`). Hoje a home é só um empty state decorativo — há espaço.
- **Pegadinhas**: performance — varrer N `messages.jsonl` a cada poll. Mitigar lendo só a cauda (tail) de cada arquivo por timestamp. Definir bem "pede atenção" pra não virar ruído (começar com: menção + última msg de cliente).

### 1.3 Marcar grupo/mensagem como "resolvido" (limpar da fila)
Um toggle "resolvido" por grupo (ou por thread/mensagem) que tira o badge de 1.1 e some da inbox de 1.2 até chegar mensagem nova.
- **Por quê**: triagem sem "marcar como feito" vira lista infinita. O o operador precisa de uma forma de dizer "já tratei isso" e zerar o sinal. É o que transforma a inbox em algo que dá pra **esvaziar**.
- **Esforço/onde**: P–M · `painel` + `dados` (um `resolved.json` no estilo do `tags.json`/`team.json` já existente — padrão `writeJsonAtomic` pronto). Guardar `{ groupId: lastResolvedTimestamp }`: tudo até ali está resolvido.
- **Pegadinhas**: granularidade. Começar por grupo (mais simples e suficiente), não por mensagem.

### 1.4 Filtro por tipo de mídia dentro do grupo
Pílulas no topo da timeline (`tudo · áudio · imagem · doc · vídeo · 🔗 links`) que filtram a conversa. Bônus: um modo "só mídia" em grade (galeria) pra varrer prints rápido.
- **Por quê**: muito do conteúdo de cliente é "ó o print do bug", "segue o áudio", "manda o PDF". Poder pular direto pros docs ou pras imagens de um grupo acelera achar o anexo certo.
- **Esforço/onde**: P · `painel`. `m.type` já está em cada mensagem; é filtro client-side puro.
- **Pegadinhas**: nenhuma séria. Links exigem extrair URL do texto (regex simples).

### 1.5 Agrupar grupos por cliente/projeto na sidebar
Usar as **tags já existentes** como cabeçalhos colapsáveis na sidebar (ex.: agrupar todos os grupos com tag `#acme` sob um header "Acme"). Hoje as tags só servem de filtro na config.
- **Por quê**: um cliente costuma ter vários grupos (comercial, dev, suporte). Ver "Acme (3) — 2 precisam resposta" é a visão de portfólio que falta. Reaproveita 100% do que já existe (`readGroupsWithTags`).
- **Esforço/onde**: M · `painel`. Dados prontos; é trabalho de UI (agrupar + colapsar + contadores).
- **Pegadinhas**: grupo sem tag vai pra um "sem cliente". Grupo com 2 tags aparece em 2 lugares — decidir se duplica ou usa "tag primária".

### 1.6 Notas por cliente / por grupo (mini-CRM)
Um painel lateral (ou aba) com um campo de **notas livres** por grupo: "stack deles é Next+Supabase", "PM é o João", "contrato vence em agosto", links úteis. Persistente, editável, visível ao abrir o grupo.
- **Por quê**: o operador carrega esse contexto na cabeça hoje. Externalizar reduz carga mental ao trocar de cliente o dia todo — e a **IA pode ler essas notas via MCP** pra responder com contexto ("eles usam X").
- **Esforço/onde**: M · `painel` + `dados` (`notes.json`, mesmo padrão) + 1 ferramenta `MCP` (`ler_notas`/`anotar`).
- **Pegadinhas**: nenhuma técnica. O valor real só aparece quando a IA também consome.

### 1.7 Saved searches / buscas fixadas
Salvar buscas recorrentes ("orçamento", "deploy", "bug", "@você esta semana") como chips clicáveis. A busca já existe no MCP (`buscar`); falta no painel e falta persistir as favoritas.
- **Por quê**: triagem tem termos recorrentes. Um clique pra "tudo que mencionou deploy nos últimos 7 dias" é rápido e poderoso.
- **Esforço/onde**: M · `painel` (busca cross-group ainda não existe na UI, só no MCP) + `dados` pequeno.
- **Pegadinhas**: depende de existir busca no painel (ver 2.1).

---

## 2. Paridade com WhatsApp — o que falta e ajudaria aqui

### 2.1 Buscar dentro da conversa (e cross-group) no painel
Campo de busca na timeline que destaca e navega entre ocorrências (n/N), incluindo dentro de **transcrições**. Versão global cruza todos os grupos.
- **Por quê**: o MCP já tem `buscar` (texto + transcrição), mas no painel não dá pra buscar dentro de um grupo. "Onde ele falou da senha do servidor?" é caso diário. Buscar na transcrição é um superpoder que o WhatsApp não tem.
- **Esforço/onde**: M · `painel`. Reaproveita a lógica do `buscar` do MCP (`server.ts:111`).
- **Pegadinhas**: highlight dentro de mensagem com menções renderizadas exige cuidado no split de tokens.

### 2.2 Responder citando (quote/reply) a partir do painel
Hoje a timeline **exibe** citação (`quotedText`/`quotedSender`), mas o composer não deixa **criar** uma. Adicionar "responder a esta mensagem" → envia com a citação real no WhatsApp.
- **Por quê**: em grupo cheio, responder sem citar gera confusão. É a forma natural de dar contexto pro cliente.
- **Esforço/onde**: M · `painel` + `coletor`. O `gateway.sendText` (control server `/send`) precisaria aceitar `quoted` (key + mensagem original); Baileys suporta via `{ quoted }`. Precisa guardar a `key` original (hoje só guardamos `id`, não o objeto `key` completo).
- **Pegadinhas**: **a maior do documento** — Baileys precisa do `WAMessageKey`/proto da mensagem citada pra montar o reply; hoje o `messages.jsonl` não persiste isso. Ou se guarda a key no momento da captura (`coletor`/`dados`), ou se reconstrói (frágil). Avaliar custo antes.

### 2.3 "Info da mensagem" / âncora permanente + copiar
Clicar numa bolha abre detalhes: timestamp exato, remetente (número real + papel), reações com quem reagiu, e **link/âncora** pra aquela mensagem (`#msg-<id>`) — útil pra inbox (1.2) linkar pro ponto certo.
- **Por quê**: a inbox e a busca precisam **levar o operador até a mensagem**. Sem âncora estável, "ver no grupo" não tem pra onde apontar.
- **Esforço/onde**: P–M · `painel`. `id` já é único e estável; só falta `id={m.id}` na bolha + scroll-into-view + highlight.
- **Pegadinhas**: a mensagem-alvo pode não estar no DOM se a timeline virar virtualizada no futuro.

### 2.4 Encaminhar / reenviar mídia entre grupos
Botão "encaminhar" numa mensagem → escolhe grupo destino → reusa o arquivo. O MCP já reenvia mídia por `mediaPath` (`responder_midia` aceita mediaPath relativo); falta no painel.
- **Por quê**: "o cliente A mandou um doc que serve pro cliente B", ou reenviar um print pro time. Capacidade já existe no backend, só não está exposta na UI.
- **Esforço/onde**: P–M · `painel`. Aproveita `send-media` com mediaPath.
- **Pegadinhas**: confirmar destino (não mandar pro grupo errado) — reaproveitar o padrão "confirmar antes de enviar".

### 2.5 Pular para a primeira não-lida + divisor "não lidas"
Linha "▸ mensagens novas" no ponto onde o operador parou, com scroll automático pra ela ao abrir (em vez de sempre ir pro fim).
- **Por quê**: ao abrir um grupo com 40 mensagens novas, ele quer começar de onde parou, não no fim nem no topo. Clássico do WhatsApp/Slack que reduz releitura.
- **Esforço/onde**: M · `painel` + `dados` (precisa de "última mensagem vista por grupo" — casa com o `resolved.json` de 1.3, pode ser o mesmo arquivo `lastSeen`).
- **Pegadinhas**: definir o que conta como "visto" (abrir o grupo? rolar até o fim?). Começar com "abriu = marcou visto até o fim".

### 2.6 Silenciar grupo (mute) na triagem
Marcar grupos como "ruído" (mute): continuam coletando, mas não geram badge (1.1) nem entram na inbox (1.2).
- **Por quê**: nem todo grupo monitorado merece atenção ativa (ex.: grupo social, avisos). Sem mute, o sinal de "precisa resposta" perde valor.
- **Esforço/onde**: P · `painel` + `dados` (flag no config do grupo, ao lado de `watch`).
- **Pegadinhas**: diferente de `watch=false` (que para de coletar) — mute coleta mas não alerta. Deixar a distinção clara na UI.

> **NOTA sobre read receipts de terceiros**: "visto pelo cliente" (saber se o cliente leu o que você mandou) é **limitado/instável no Baileys em grupo** e some quando o cliente desliga confirmação. A confirmação que já está em andamento provavelmente é a sua leitura (marcar como lido / `readMessages`). Não prometer "visualizado pelo cliente" como feature confiável.

---

## 3. Alavancar a IA / MCP — onde está a vantagem injusta

> Este produto tem algo que WhatsApp não tem: Whisper local + Claude no loop. Subexplorar isso é desperdício.

### 3.1 Digest diário automático (resumo por grupo, em background)
Job que, 1×/dia (ou sob demanda), roda `resumo_do_dia` em cada grupo monitorado, gera um resumo curto via IA e mostra no topo da inbox: "Acme: cliente pediu ajuste no checkout, mandou print; aguarda sua resposta."
- **Por quê**: é a forma mais alta de "não garimpar". O o operador abre o painel e **lê 6 linhas** em vez de 6 conversas. `resumo_do_dia` já existe no MCP (`server.ts:160`) e até **transcreve os áudios pendentes** sozinho — a matéria-prima está pronta.
- **Esforço/onde**: G · `MCP`/`painel` + orquestração (chamar a IA). Decidir quem dispara o resumo (skill/cron via Claude, ou um worker).
- **Pegadinhas**: custo/loop de IA — não resumir grupo sem novidade. Cachear resumo por dia. O resumo precisa de uma chamada de modelo, então não é "só painel".

### 3.2 Extração de tarefas/pendências dos áudios
Sobre as transcrições, a IA extrai itens acionáveis ("preciso que vc suba o ambiente até sexta", "falta o logo em SVG") e mostra como checklist por grupo.
- **Por quê**: clientes pedem coisas **por áudio**. Hoje o operador ouve/lê e segura na cabeça. Virar checklist extraído é matar a dor de "esqueci o que o cliente pediu no áudio de 3min".
- **Esforço/onde**: M–G · `MCP` (nova ferramenta `extrair_tarefas`) + `painel` pra exibir. Transcrição já existe.
- **Pegadinhas**: qualidade da extração depende do modelo; deixar editável (não tratar como verdade absoluta). Persistir as tarefas (`dados`).

### 3.3 Classificação de urgência / sugestão de resposta
Por mensagem ou por grupo do dia, a IA classifica urgência (🔴 cliente bloqueado / 🟡 pergunta / ⚪ social) e, opcionalmente, **rascunha** uma resposta (que passa pelo humanizer e é confirmada antes de enviar — regra já estabelecida).
- **Por quê**: urgência ordena a fila da inbox (1.2). E rascunho de resposta encurta o caminho até responder — que é metade do propósito do produto. O fluxo de envio com confirmação já existe (`responder`/`responder_midia`).
- **Esforço/onde**: M · `MCP` + `painel`. Reaproveita `resumo_do_dia` como entrada.
- **Pegadinhas**: **nunca enviar sem confirmação** (regra do projeto, `server.ts:367`). Urgência é heurística falível — mostrar como sugestão.

### 3.4 Alertas por palavra-chave
Lista de termos-gatilho ("urgente", "caiu", "fora do ar", "boleto", "cancelar", o nome de um projeto) que, ao aparecerem em mensagem **ou transcrição**, acendem um alerta no painel.
- **Por quê**: "o ambiente caiu" não pode esperar a próxima sessão de triagem. Como o coletor já roda 24/7 (pm2), dá pra vigiar termos críticos em tempo quase real. Busca em transcrição já é suportada.
- **Esforço/onde**: M · `coletor` (avaliar no momento da captura, mais barato) ou `painel` (no poll) + `dados` (lista de termos).
- **Pegadinhas**: notificação real (fora da aba) precisa de Notification API / som — e o Mac precisa dar permissão. Começar com sinal visual dentro do painel.

### 3.5 Transcrição automática em background dos grupos monitorados
Hoje a transcrição é sob demanda (botão) ou em lote ao resumir. Um worker que transcreve áudios novos dos grupos monitorados assim que chegam deixa tudo pesquisável **antes** de o operador abrir.
- **Por quê**: remove a espera. A busca em transcrição (2.1/1.7), a inbox (1.2) e o digest (3.1) ficam instantâneos porque o texto já está pronto. A infra (`transcribeBatch`, modelo "morno") já existe.
- **Esforço/onde**: M · `coletor`/worker. Cuidado pra não competir com transcrição sob demanda (fila).
- **Pegadinhas**: custo de CPU/GPU local rodando o dia todo no Mac de trabalho. Tornar opcional por grupo (só os "quentes"). Respeitar ordem: demanda do usuário tem prioridade sobre background.

---

## 4. Interação / efeitos / delight — elevar sem virar slop

> Identidade "Signal Room": terminal, ember como sinal, equalizer reativo, mono nos rótulos. Os efeitos abaixo são escolhidos pra **reforçar** isso, não decorar. Cada um cita o produto de referência e por que encaixa.

### 4.1 Command palette (⌘K) — de **Linear / Raycast**
Paleta central pra navegar entre grupos, buscar, pular pra inbox, "marcar resolvido", "transcrever tudo". Tudo via teclado.
- **Por quê encaixa**: usuário único, técnico, mãos no teclado o dia todo em paralelo a outro trabalho — o caso de uso *é* o de quem vive de ⌘K. É o efeito mais "command-center" possível e o que mais economiza tempo. A estética da paleta (fundo escuro, mono, sem cor) já é a identidade.
- **Esforço/onde**: M · `painel`.
- **Pegadinhas**: precisa de uma fonte de comandos/itens unificada; cresce com o resto do app.

### 4.2 Equalizer reativo que "vaza" pra sidebar — evolução da assinatura
A assinatura (equalizer de áudio) já reage ao playback. Levar um eco discreto disso pra **sidebar**: o grupo que tem áudio tocando agora mostra um micro-equalizer ember no item. E, ao chegar áudio novo num grupo, um pulso de 1 barra.
- **Por quê encaixa**: amarra a assinatura ("o produto é voz") ao momento de triagem (a sidebar). Reforça "vivo" sem decorar — o movimento sempre reflete estado real (tocando / chegou). Inspiração no jeito que o **Vapi** trata o sinal de áudio como protagonista.
- **Esforço/onde**: P–M · `painel`. Reusa `LiveAudio`/keyframe `eq` já existentes.
- **Pegadinhas**: respeitar `prefers-reduced-motion` (já tratado no CSS) — cai pra estático.

### 4.3 Otimismo + reconciliação no envio — de **Linear / Things**
Ao enviar, a bolha aparece **imediatamente** com estado "enviando" (leve dim + barra de progresso fina ember) e reconcilia quando o coletor confirma. Hoje o composer espera ~1s e dá refetch.
- **Por quê encaixa**: o "responder rápido" é metade do propósito. A sensação de instantâneo (Linear é a referência canônica de UI otimista) faz o painel parecer um instrumento responsivo, não um formulário. Combina com `msg-in` que já existe.
- **Esforço/onde**: M · `painel`. Hoje há `setTimeout(onSent, 1000)` — trocar por inserção otimista + poll de reconciliação.
- **Pegadinhas**: tratar falha de envio (reverter a bolha, mostrar retry). Dedup com a mensagem real que o poll trará.

### 4.4 Spotlight/scroll-to-message com realce ember — de **Notion / Arc** (peek)
Ao clicar num resultado de busca ou item da inbox, rolar até a mensagem e dar um **flash ember** que decai (highlight temporário), em vez de só posicionar.
- **Por quê encaixa**: ember = "olhe aqui" já é a regra de cor do projeto. Usar o acento como holofote temporário é exatamente "acento é sinal". Notion faz isso ao linkar pra um bloco; ajuda a não perder o alvo numa timeline densa.
- **Esforço/onde**: P · `painel`. Um keyframe novo (estilo `reveal`) + classe temporária. Depende de âncora (2.3).
- **Pegadinhas**: nenhuma; respeitar reduced-motion (vira highlight estático que some por timeout).

### 4.5 Number tickers / contadores que animam — de **Vercel / Cron (Notion Calendar)**
Contadores ("3 precisam resposta", "12 mensagens hoje") com tween curto ao mudar (count-up), e `tnum` (já no `.mono`) pra não dançar largura.
- **Por quê encaixa**: a inbox/sidebar vivem de contadores. Um count-up sutil sinaliza "algo mudou" sem toast. Vercel/Cron usam isso com sobriedade. O `.mono` com `tnum` já existe — meio caminho andado.
- **Esforço/onde**: P · `painel`.
- **Pegadinhas**: manter curtíssimo (≤200ms, dentro da régua 120–260ms do DESIGN). Reduced-motion → troca seca.

### 4.6 Skeleton "scan-line" terminal em vez de spinner — de **Warp / Linear**
Enquanto transcreve/lê documento/carrega inbox, em vez de spinner, mostrar um shimmer com cara de **varredura de terminal** (linha que percorre, mono placeholder).
- **Por quê encaixa**: o sistema é "grau-terminal" (Warp é referência declarada no DESIGN). Um shimmer terminal é mais coerente que um spinner genérico e comunica "processando sinal". A transcrição local demora — esse é o momento certo.
- **Esforço/onde**: P · `painel`. Há `Spinner` hoje; adicionar um `ScanShimmer`.
- **Pegadinhas**: não exagerar no número de linhas animadas (custo de paint). Reduced-motion → barra estática.

### 4.7 Densidade alternável (compacto/confortável) — de **Height / Superlist**
Toggle global de densidade da timeline e sidebar. "Compacto" para varrer muito; "confortável" para ler com calma.
- **Por quê encaixa**: o DESIGN lista "densidade legível" como princípio nº1, e o uso varia (varrer rápido vs ler um áudio longo). Height/Superlist tratam densidade como cidadão de primeira classe em ferramentas de produtividade.
- **Esforço/onde**: P–M · `painel` (variável de espaçamento + persistência local).
- **Pegadinhas**: não quebrar a legibilidade mínima (contraste/leading do DESIGN) no modo compacto.

### 4.8 "Connection heartbeat" vivo — refinamento do ConnectionDot
O dot de conexão (verde = OK) ganha um **pulso lento** quando `open` e um shimmer quando `connecting`, reforçando "vivo" — e um toast discreto se cair a conexão (reconnect).
- **Por quê encaixa**: "vivo" e "no-nonsense" são valores de marca; saber que o coletor está de pé importa porque ele roda 24/7 e o operador depende dele. Verde só pra status (regra de cor respeitada).
- **Esforço/onde**: P · `painel`. `ConnectionDot` e `/api/status` já existem.
- **Pegadinhas**: pulso muito chamativo viraria decoração — manter lento e discreto. Reduced-motion → dot estático.

---

## Top 5 que eu faria primeiro (custo/benefício)

1. **Badge "precisa resposta" / mencionado na sidebar (1.1)** — M, só painel. Responde direto a pergunta nº1 do operador com dados que já existem. Maior impacto por esforço de todo o documento.
2. **Filtro por tipo de mídia + busca dentro da conversa (1.4 + 2.1)** — P+M, só painel. Acelera achar "o print/o doc/onde ele falou X" sem garimpar; reaproveita o `buscar` do MCP.
3. **Marcar resolvido + mute (1.3 + 2.6)** — P–M, painel + `dados` (padrão `writeJsonAtomic` pronto). É o que faz o badge/inbox virarem uma fila **esvaziável** em vez de ruído infinito.
4. **Caixa de entrada unificada do dia (1.2)** — G, painel. Inverte o modelo de "abrir grupo por grupo" pra "um feed do que importa hoje". Depende de 1.1/1.3 prontos; vira o novo `/`.
5. **Command palette ⌘K (4.1)** — M, painel. Para um dev que vive no teclado em paralelo a outro trabalho, é o delight que também é produtividade pura — e é a cara da identidade terminal.

> Sequência sugerida: 1.1 → 1.3/2.6 → 1.4/2.1 → 1.2 (que consome tudo acima) → 4.1. Depois, a camada de IA (3.1 digest, 3.2 tarefas) que multiplica o valor da inbox.

---

## Tabela de priorização

| # | Ideia | Impacto | Esforço | Onde | Depende de |
|---|---|---|---|---|---|
| 1.1 | Badge precisa-resposta/mencionado | Alto | M | painel | — |
| 1.2 | Inbox unificada do dia | Muito alto | G | painel(+MCP) | 1.1, 1.3, 2.3 |
| 1.3 | Marcar resolvido | Alto | P–M | painel+dados | — |
| 1.4 | Filtro por tipo de mídia | Médio-alto | P | painel | — |
| 1.5 | Agrupar por cliente (tags) | Médio | M | painel | — |
| 1.6 | Notas por cliente (mini-CRM) | Médio-alto | M | painel+dados+MCP | — |
| 1.7 | Saved searches | Médio | M | painel+dados | 2.1 |
| 2.1 | Busca na conversa/cross-group | Alto | M | painel | — |
| 2.2 | Responder citando (reply) | Médio-alto | M | painel+coletor | persistir key (dados) |
| 2.3 | Info da msg / âncora | Médio | P–M | painel | — |
| 2.4 | Encaminhar mídia | Médio | P–M | painel | — |
| 2.5 | Pular pra não-lida | Médio | M | painel+dados | lastSeen |
| 2.6 | Silenciar grupo (mute) | Médio-alto | P | painel+dados | — |
| 3.1 | Digest diário automático | Muito alto | G | MCP+painel | resumo_do_dia (existe) |
| 3.2 | Extração de tarefas dos áudios | Alto | M–G | MCP+painel | transcrição (existe) |
| 3.3 | Urgência + rascunho de resposta | Alto | M | MCP+painel | confirmação (existe) |
| 3.4 | Alertas por palavra-chave | Médio-alto | M | coletor/painel+dados | — |
| 3.5 | Transcrição automática em bg | Médio-alto | M | coletor/worker | transcribeBatch (existe) |
| 4.1 | Command palette ⌘K | Alto | M | painel | — |
| 4.2 | Equalizer na sidebar | Baixo-médio | P–M | painel | — |
| 4.3 | Envio otimista | Médio | M | painel | — |
| 4.4 | Spotlight/flash na msg | Baixo-médio | P | painel | 2.3 |
| 4.5 | Contadores animados | Baixo | P | painel | — |
| 4.6 | Skeleton scan-line | Baixo | P | painel | — |
| 4.7 | Densidade alternável | Médio | P–M | painel | — |
| 4.8 | Heartbeat de conexão | Baixo | P | painel | — |

---

### Honestidades / riscos a checar antes
- **2.2 (reply citado)** é a única ideia com risco técnico real: o `messages.jsonl` **não guarda a `WAMessageKey`/proto** necessária pro Baileys montar a citação. Sem persistir isso na captura, vira gambiarra. Avaliar custo antes de prometer.
- **Read receipt do cliente** ("visualizado por ele") é frágil no Baileys em grupo — não vender como feature confiável.
- Toda camada de IA (3.x) implica **chamadas de modelo** e custo/latência: não são "só painel" e precisam de cache pra não rodar à toa.
- **3.5 / transcrição 24/7** disputa CPU/GPU com o trabalho do operador no mesmo Mac — manter opt-in por grupo.
