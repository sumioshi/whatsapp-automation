# IDEAS-INNOVATION — rodada 2 (inovação + ceticismo)

Líder de produto **e cético do time**. O `IDEAS.md` já tem 24 ideias (badge, inbox, resolvido, mute, busca, tags, notas, digest, extração de tarefas, urgência, ⌘K, efeitos). **Esta rodada não repete nada disso** — vai pra onde o `IDEAS.md` não foi: **IA embutida no fluxo do painel** (não só via MCP chamado por fora), **análise de mídia mais profunda**, **board/SLA de quem-deve-resposta-a-quem**, **sentimento**, **timeline cross-grupo**, **integrações externas** (Notion/calendário).

Premissa que mando lembrar antes de cada ideia de IA: hoje a IA do projeto **só roda quando o operador (ou um Claude externo) chama o MCP** (`web/mcp/server.ts`, 12 ferramentas, stdio). Não existe loop de IA dentro do painel Next.js. Toda ideia que diz "o painel analisa em tempo real" implica **uma chamada de modelo nova a partir do servidor Next** (API key, custo, latência, cache) — isso é arquitetura nova, não "só painel". Vou ser honesto sobre isso em cada uma.

Convenções: **Esforço** P (≤ meio dia) / M (1–2 dias) / G (≥ 3 dias-arquitetura). **Onde** painel / coletor / MCP / **IA** (loop de modelo novo, dentro do Next). **Veredito** 🟢 fazer / 🟡 experimentar / 🔴 provavelmente não vale.

Regra de ouro herdada e que mata várias ideias abaixo: **nunca envia nada sem o humanizer + confirmação do operador** (`server.ts:367`, `:397`). Qualquer ideia de "responde sozinho" colide com isso e vira 🔴 ou 🟡-com-humano-no-loop.

---

## A. IA embutida no painel (o salto de arquitetura)

> O `IDEAS.md` 3.x trata IA como ferramenta MCP puxada de fora. Aqui a pergunta é: e se o **painel** tivesse um endpoint que fala com o modelo? Isso é o tema central do pedido do operador, e é onde mora o maior risco de over-engineering.

### A1. Copiloto de thread embutido (drawer "↪ IA" por grupo)
Um drawer lateral no grupo aberto, com 4 botões: **Resumir thread · Classificar urgência · Rascunhar resposta · Extrair pendências**. Cada um chama um endpoint Next (`/api/ai/...`) que monta o contexto com as libs que já existem (`readGroupMessages`, `buildContacts`, `resolveMentions` — as mesmas de `server.ts`) e manda pro modelo. O rascunho **abre no composer** (não envia) e passa pelo humanizer.

- **Caso de uso real**: o operador abre "Acme", vê 22 mensagens novas e 2 áudios. Em vez de abrir o Claude noutra janela e digitar "resume o grupo Acme via MCP", clica **Resumir** ali. 6 linhas. Clica **Rascunhar** → texto aparece no composer pra ele editar e mandar.
- **CÉTICO — vale mesmo?** Sim, *se* a fricção atual de "ir pro Claude e pedir via MCP" for real e diária. É. O risco não é a utilidade — é **duplicar o que o MCP já faz**. As ferramentas MCP (`resumo_do_dia`, `responder`) já entregam isso pra um Claude que o operador já tem aberto. A pergunta honesta: ele prefere um botão no painel ou prefere o chat livre do Claude? Botão é mais rápido pro caso-padrão; chat é mais flexível. **Não substitui o MCP, complementa** — e isso é o argumento mais forte: o painel vira self-service pra os 4 casos de 90% do tempo, e o MCP fica pro resto.
- **Esforço/onde**: G · **IA** + painel. Precisa: rota Next que chama a Anthropic API (key nova no `.env`), reuso das libs de contexto, UI do drawer, cache por (grupo, último-timestamp) pra não re-resumir o mesmo estado. Modelo recomendado: Haiku 4.5 pra urgência/resumo curto (barato/rápido), Opus/Sonnet pro rascunho.
- **Veredito**: 🟢 **fazer** — é literalmente o pedido central do operador e o ponto onde o produto passa de "visualizador + MCP" pra "instrumento com IA dentro". Começar só com **Resumir** e **Rascunhar** (os 2 de maior valor) antes de inflar pra 4 botões.

### A2. Resumo incremental fixado no topo da timeline (não um botão — um estado)
Diferente do A1 (sob demanda). Aqui o topo do grupo mostra **sempre** um resumo de 2-3 linhas do que mudou desde a última vez que o operador abriu, gerado em background quando ele abre o grupo (não a cada poll).

- **Caso de uso real**: abre o grupo já com "Desde ontem: cliente aprovou o orçamento, pediu o contrato em PDF, e mandou áudio reclamando do prazo." Sem clicar nada.
- **CÉTICO — vale mesmo?** Aqui eu travo. É bonito mas é **caro e arriscado**: gera chamada de modelo *toda vez que abre um grupo*, mesmo quando ele só queria ver a última msg. Vira custo silencioso e latência no gesto mais frequente do app (abrir grupo). E o resumo "incremental desde última visita" depende do `lastSeen` que ainda nem existe (é o 2.5 do `IDEAS.md`). Sobreposição grande com A1 + 3.1 digest do `IDEAS.md`. O ganho sobre "clicar Resumir" é pequeno; o custo recorrente é grande.
- **Esforço/onde**: G · IA + painel + dados (lastSeen).
- **Veredito**: 🔴 **provavelmente não vale** — é o A1 com gatilho automático que cobra IA a cada abertura. Se o A1 existir, o operador clica quando quer. Auto-resumir tudo é o caminho mais curto pra fatura de API alta e ruído. Deixa sob demanda.

### A3. "Pergunte aos seus grupos" — caixa de busca semântica em linguagem natural
Uma barra (no ⌘K ou na home) onde ele digita "o que o pessoal da Acme decidiu sobre o deploy?" e a IA responde citando as mensagens, cruzando grupos. RAG sobre o `messages.jsonl` + transcrições.

- **Caso de uso real**: "qual era a senha do staging que o João mandou?", "algum cliente reclamou de prazo essa semana?". Hoje isso é `buscar` (keyword) no MCP — exige saber a palavra exata. Linguagem natural acha por significado.
- **CÉTICO — vale mesmo?** O caso de uso é ótimo e recorrente. O ceticismo é **build vs. já-tenho**: o operador já pode abrir o Claude e perguntar isso usando as ferramentas `buscar`/`ler_mensagens`/`resumo_do_dia` do MCP — o Claude já faz esse RAG manualmente. Construir embeddings + índice vetorial + rota no painel é **reimplementar o que o agente externo já entrega**, só pra ter dentro do painel. Sem embeddings, é só passar muito texto pro modelo (caro/limite de contexto). Com embeddings, é infra de verdade (índice, reindex no coletor).
- **Esforço/onde**: G · IA + dados (índice) + coletor (reindex ao chegar msg).
- **Veredito**: 🟡 **experimentar — mas só a versão preguiçosa**: uma caixa que, sem embeddings, faz um pré-filtro com o `buscar` existente (keywords extraídas da pergunta) e joga só os trechos candidatos pro modelo responder. Embeddings/índice vetorial completo é 🔴 por ora — esforço de plataforma pra ganho que o MCP+Claude já cobre.

### A4. Auto-classificação de urgência **persistida** na captura (o motor da inbox)
A inbox do `IDEAS.md` (1.2) ordena por urgência, mas lá a urgência é heurística (menção + papel client). Aqui: quando uma mensagem **de cliente** chega, o coletor/worker dispara uma classificação barata (🔴/🟡/⚪) e **persiste** no dado. A inbox lê o campo pronto.

- **Caso de uso real**: "o ambiente caiu" chega às 14h; a inbox já mostra 🔴 sem o operador abrir nada. Urgência fica pré-computada, instantânea na UI.
- **CÉTICO — vale mesmo?** Aqui o ceticismo é sobre **classificar tudo vs. classificar barato sem IA**. Rodar modelo *em toda mensagem de cliente* o dia todo é custo recorrente real (mesma armadilha do A2). E 80% da urgência dá pra pegar com **palavra-chave** (3.4 do `IDEAS.md`: "caiu", "fora do ar", "urgente", "parou") — que é grátis e instantâneo. A IA só agrega valor no 20% ambíguo, e esse 20% não justifica classificar 100% com modelo.
- **Esforço/onde**: M (keyword) / G (IA) · coletor + dados (+ IA opcional).
- **Veredito**: 🟡 **fazer a versão keyword (sem IA)**, que já é metade do 3.4 do `IDEAS.md`. Classificação por **modelo em toda mensagem** é 🔴 — custo recorrente desproporcional; deixa a IA pra quando ele *clicar* "classificar" (A1).

---

## B. Análise de mídia mais profunda (já existe ver_imagem/ver_video — empurrar mais)

> Hoje `ver_imagem` e `ver_video` (frames via ffmpeg, `server.ts:202`/`:273`) só funcionam quando um Claude externo chama. A mídia chega e fica **cega** até alguém pedir pra ver.

### B1. OCR/descrição automática de imagem na chegada (texto pesquisável do print)
Quando chega imagem num grupo monitorado, gerar **uma linha** de descrição/OCR e anexar à mensagem: "print de erro 500 no checkout", "foto de boleto vencido", "captura de tela do Figma". Fica pesquisável e legível na timeline sem abrir a imagem.

- **Caso de uso real**: cliente manda print sem texto. Na timeline aparece "[imagem: erro 500 no /checkout]" em vez de só uma moldura. O `buscar` acha "checkout" mesmo sendo um print. A inbox mostra do que se trata sem o operador abrir.
- **CÉTICO — vale mesmo?** Esse é dos **mais genuinamente úteis** da lista, porque ataca um buraco real: imagem é conteúdo morto até alguém olhar, e print de bug é o caso nº1 de cliente dev. OCR local (Apple Vision via `shortcuts`/`vision` no Mac, ou Tesseract) é **grátis e offline** pra texto — o risco de custo some. Descrição semântica ("é um print de bug") aí sim precisa de modelo de visão. Risco real: ruído quando a imagem é meme/figurinha social (descrição inútil). Mitigar: só gerar pra grupos `client`, não pra sociais.
- **Esforço/onde**: M (OCR local Apple Vision) / G (descrição via modelo de visão) · coletor/worker + dados.
- **Veredito**: 🟢 **fazer o OCR local** (grátis, offline, resolve o caso "print com texto/erro/boleto"). Descrição semântica via modelo é 🟡 — fazer **sob demanda** (botão "o que é isso?" que chama o `ver_imagem` que já existe), não automático em toda imagem.

### B2. Resumo de vídeo (frames + áudio juntos numa frase)
Combinar o `ver_video` (frames) + `transcrever` (áudio) que já existem num único "resumo do vídeo": "cliente gravou a tela mostrando o bug do filtro que não aplica; fala que acontece só no Safari."

- **Caso de uso real**: cliente manda vídeo de 90s gravando a tela. Hoje o operador assiste. O resumo combina o que se vê + o que se fala.
- **CÉTICO — vale mesmo?** O caso existe mas é **raro** comparado a áudio/print. Vídeo de cliente é menos frequente, e quando vem, costuma ser importante o bastante pra justificar assistir. As peças (`ver_video` + `transcrever`) já existem e podem ser combinadas **sob demanda** quando precisar. Automatizar resumo de *todo* vídeo é gastar em algo raro.
- **Esforço/onde**: M · IA (combina 2 ferramentas existentes) + painel (botão).
- **Veredito**: 🟡 **só sob demanda** — um botão "resumir vídeo" que orquestra `ver_video`+`transcrever`. Automático é 🔴 (raridade não paga o custo).

### B3. "Isso é um print de bug?" → vira card de tarefa
Detector que, quando a imagem é classificada como print de erro/bug (via B1), oferece transformar em item no board/checklist (3.2 do `IDEAS.md`, extração de tarefas).

- **CÉTICO**: depende de B1 (descrição semântica) **e** do board de tarefas (que ainda não existe). É feature-em-cima-de-feature-em-cima-de-feature. Legal no papel, três dependências não-prontas no caminho.
- **Esforço/onde**: M · painel (em cima de B1 + tarefas).
- **Veredito**: 🔴 **não agora** — só faz sentido depois que B1-semântico e o board existirem. Anotar como "fase 3", não roadmap atual.

---

## C. Board / SLA — "quem está me devendo e a quem eu devo" (o que o IDEAS.md não tem)

> O `IDEAS.md` tem badge "precisa resposta" por grupo (1.1) e inbox (1.2), mas **não tem visão de relacionamento ao longo do tempo**: quem está esperando você há mais tempo, quem você prometeu e não entregou.

### C1. Board "bola comigo / bola com eles" (kanban de resposta pendente)
Uma tela com 2-3 colunas: **Você deve resposta** (última msg é de cliente, sem você depois) · **Esperando o cliente** (você perguntou, ele não voltou) · **Resolvido**. Cada card = um grupo, com **há quanto tempo** está parado ali.

- **Caso de uso real**: bate o fim do dia, o operador abre o board: "3 clientes esperando você há >4h, e 2 grupos onde você está esperando retorno deles desde ontem." É a foto de "estou devendo a quem".
- **CÉTICO — vale mesmo?** O dado de "de quem é a última mensagem" já existe (`fromMe`, `roleOf`) e é o mesmo do badge 1.1. A pergunta cética: **isso é um board ou é a inbox 1.2 girada 90°?** Em grande parte é a mesma informação reorganizada. O que o board adiciona de verdade é a **coluna "esperando o cliente"** — saber a quem *você* cobrou e não voltou, que a inbox (focada no que pede *sua* ação) não mostra. Esse ângulo ("eu cobrei e ele sumiu") é genuinamente novo e útil pra follow-up. Risco: virar mais uma view pra manter sincronizada com a inbox.
- **Esforço/onde**: M · painel (dados já existem; é UI + a heurística de "esperando cliente").
- **Veredito**: 🟢 **fazer — mas como uma *aba* da inbox, não tela separada**. O valor real é a coluna "esperando o cliente". Não construir um kanban com drag-and-drop (over-engineering pra 1 usuário) — duas listas bastam.

### C2. SLA / cronômetro de resposta com alerta de envelhecimento
Cada grupo "você deve resposta" ganha um relógio; passou de X horas (configurável, ou por horário comercial), acende 🔴 e sobe no topo.

- **Caso de uso real**: cliente perguntou 9h, são 13h, ninguém respondeu → vira urgente visualmente.
- **CÉTICO — vale mesmo?** Útil de leve, mas **cuidado com o teatro de SLA**. o operador é founder, usuário único, não um time de suporte com contrato de SLA. "Aging" automático ajuda a não esquecer; "SLA" com metas/cores/relatório é importar cerimônia corporativa que não cabe num dono triando os próprios clientes. O risco é gerar **culpa/ruído** ("você está atrasado!") por mensagens que não eram urgentes (um "bom dia" não tem SLA). Sem distinguir "msg que pede resposta" de "msg social", o relógio mente.
- **Esforço/onde**: P–M · painel (em cima do C1).
- **Veredito**: 🟡 **só o "aging" simples** (mostrar "há 4h" no card, ordenar por mais antigo). Cores de SLA/metas/relatório de cumprimento = 🔴, é cerimônia de call-center pra um usuário só.

### C3. Follow-up sugerido (cobrança automática redigida)
Pros grupos da coluna "esperando o cliente" parados há dias, a IA sugere um follow-up ("Oi, conseguiu ver aquilo do contrato?") pronto pra revisar e enviar.

- **Caso de uso real**: você pediu um arquivo ao cliente há 3 dias, ele sumiu; o app lembra e já oferece a cobrança redigida.
- **CÉTICO — vale mesmo?** O *lembrete* ("você está esperando o cliente X há 3 dias") é ouro e quase grátis (vem do C1). O *texto sugerido* é onde eu seguro: follow-up de cobrança é **sensível de relacionamento** — tom errado com cliente custa caro, e o operador provavelmente quer escrever ele mesmo essas 1-2 frases. Gerar texto de cobrança automática é resolver a parte fácil (redigir uma frase) e arriscar a parte cara (o tom com o cliente). Passa pelo humanizer + confirmação, claro, mas pra uma frase curta o esforço de revisar quase iguala o de escrever.
- **Esforço/onde**: M · IA + painel.
- **Veredito**: 🟢 **o lembrete** (detectar e mostrar "esperando há N dias") · 🟡 **o texto** (oferecer rascunho, sem prometer qualidade; humanizer+confirmação obrigatórios). Nunca enviar follow-up sozinho = 🔴 absoluto (colide com a regra do projeto).

---

## D. Inteligência de relacionamento

### D1. Detecção de cliente irritado / termômetro de tom
Sinalizar quando o tom de um cliente azeda (frustração, urgência hostil, "de novo isso?", "já é a terceira vez"). Um 🔴 discreto no grupo.

- **Caso de uso real**: cliente que sempre foi tranquilo manda 3 mensagens secas seguidas; o app sobe um sinal "atenção: tom mudou" antes do operador perceber tarde.
- **CÉTICO — vale mesmo?** Sedutora e **provavelmente superestimada**. Problemas: (1) análise de sentimento em pt-BR informal/gíria/ironia é **notoriamente ruim** — "kkk caiu de novo aff" pode ser leve ou grave, e o modelo erra muito; (2) pra um usuário único que **lê os grupos mesmo**, ele percebe o tom melhor que um classificador; (3) falso-positivo aqui é pior que ausência — sinalizar "cliente irritado" quando não está cria ansiedade injustificada; falso-negativo dá falsa segurança. Rodar isso em toda mensagem = custo recorrente do A2 de novo. O valor incremental sobre "ele lê os grupos" é baixo.
- **Esforço/onde**: G · IA + coletor/dados.
- **Veredito**: 🔴 **provavelmente não vale** — é o exemplo mais claro de **firula que parece IA-cool e entrega pouco** pra quem já lê as conversas. Sentimento informal pt-BR é frágil e o falso-positivo machuca. Se quiser algo, fica na detecção de palavra-chave dura ("absurdo", "cancelar", "terceira vez") — barata e auditável — não num classificador de humor.

### D2. Agrupar mensagens por assunto dentro do grupo (sub-threads)
Detectar que dentro de um grupo correm 3 assuntos paralelos (o deploy, o design, o financeiro) e deixar filtrar por assunto.

- **CÉTICO — vale mesmo?** WhatsApp não tem threads, então conversas se misturam mesmo — o problema é real. Mas clusterizar tópicos automaticamente é **caro e impreciso**, e o ganho real pra grupos de 1 cliente (que costumam ter 1-2 assuntos, não 8) é pequeno. A busca (que já existe) resolve 90%: "acha onde falaram de deploy". Threads automáticas é resolver com ML um problema que o filtro de busca já resolve.
- **Esforço/onde**: G · IA + painel.
- **Veredito**: 🔴 — over-engineering. Grupos de cliente não têm assuntos paralelos suficientes pra pagar clustering. Busca > threads automáticas aqui.

### D3. Timeline de projeto cruzando grupos (linha do tempo de um cliente)
Um cliente (Acme) tem 3 grupos (comercial/dev/suporte). Uma view que junta os marcos dos 3 numa linha do tempo: "orçamento aprovado (comercial, 02/06) → deploy combinado (dev, 10/06) → bug reportado (suporte, 18/06)".

- **Caso de uso real**: "onde está o projeto Acme no geral?" sem abrir 3 grupos. Reaproveita as **tags** (que já agrupam grupos por cliente, 1.5 do `IDEAS.md`).
- **CÉTICO — vale mesmo?** Conceito forte e **diferente de tudo no `IDEAS.md`** (que é sempre por-grupo ou inbox-do-dia; isto é por-cliente-ao-longo-do-tempo). O ceticismo: "marcos" precisam ser **extraídos por IA** (o que conta como marco?), e isso é difícil de fazer bem — vira ou ruído (todo mundo "marco") ou vazio (perde o que importa). Sem IA, é só concatenar 3 timelines por data, o que já dá pra fazer abrindo os grupos. O valor depende inteiramente da qualidade da extração de marcos, que é incerta.
- **Esforço/onde**: G · IA + painel (+ tags existentes).
- **Veredito**: 🟡 **experimentar a versão simples**: timeline concatenada dos grupos de uma tag, com **destaque automático só do que já é estruturado** (docs recebidos, áudios, primeira/última msg do dia) — sem tentar "extrair marcos" via IA. Se a versão estrutural provar valor, aí sim testar extração. Extração de marcos como feature principal = 🔴 por ora (incerta demais).

---

## E. Integrações externas (sair do painel)

### E1. Prazos ditos em áudio → evento no Google Calendar
Cliente fala num áudio "preciso disso até sexta". A transcrição (já existe) + extração de data → oferece criar evento/lembrete no calendário.

- **Caso de uso real**: o cliente combina prazos por voz; eles se perdem. Pescar a data do áudio e jogar na agenda fecha o loop "ouvi → anotei".
- **CÉTICO — vale mesmo?** O caso é real (prazo em áudio é clássico). Mas: (1) extração de data relativa em fala informal ("lá pro fim da semana", "depois do feriado") é **imprecisa**, e prazo errado na agenda é pior que prazo nenhum; (2) integração com Google Calendar é OAuth, escopo, tokens — **peso de integração** pra um ganho que um "copiar pro lembrete" manual quase iguala; (3) o operador usa Claude com acesso a Calendar (há tools de Calendar no ambiente) — ele pode pedir isso ao Claude pontualmente sem o painel integrar. Construir OAuth no painel pra isso é desproporcional.
- **Esforço/onde**: G · IA + integração externa (OAuth Calendar) + coletor (transcrição existe).
- **Veredito**: 🟡 **só a detecção, não a integração**: a IA marca "⏰ prazo mencionado: sexta" como sinal na timeline/inbox (barato, sem OAuth). Criar o evento, deixa pro operador (ou pro Claude com a tool de Calendar que já existe no ambiente). OAuth-Calendar-no-painel = 🔴, peso desproporcional.

### E2. Exportar resumo pro Obsidian/Notion (anotação do projeto)
Botão que joga o digest/resumo de um grupo (ou de um cliente) como nota no Obsidian dele (já tem a skill `anota` de Obsidian) ou no Notion.

- **Caso de uso real**: fim de semana com Acme; "manda o resumo da semana pra nota deles no Obsidian". Vira histórico do projeto fora do WhatsApp.
- **CÉTICO — vale mesmo?** Aqui tem um detalhe que muda o veredito: **a skill `anota` (Obsidian) já existe** e é o jeito que o operador registra trabalho. Então "exportar pro Obsidian" não precisa virar feature do painel — é **um Claude rodando a skill `anota` em cima do `resumo_do_dia` do MCP**. O encanamento já está todo lá. Construir um botão de export no painel duplicaria o que a skill+MCP já fazem juntos. Notion sim seria integração nova, mas o Obsidian (o que ele realmente usa) já está coberto pelo ecossistema atual.
- **Esforço/onde**: P (via skill `anota` + MCP, sem código novo) / M (botão no painel) / G (Notion OAuth).
- **Veredito**: 🟢 **fazer via o que já existe** (documentar o fluxo "Claude + skill anota + resumo_do_dia" — esforço ~zero, valor alto). Botão no painel = 🟡 (conveniência, duplica). Integração Notion = 🔴 (ele usa Obsidian, não Notion — resolver problema que ele não tem).

### E3. Notificação nativa do Mac pra alertas críticos
Quando dispara um alerta de palavra-chave (3.4 do `IDEAS.md`) ou um 🔴, mandar uma **notificação nativa do macOS** (fora da aba), porque o painel fica em background o dia todo.

- **Caso de uso real**: "ambiente caiu" às 15h enquanto o operador está em outra janela; a notificação do Mac chama, ele não depende de estar olhando o painel.
- **CÉTICO — vale mesmo?** Esse é **honestamente útil e específico ao uso real** dele (painel em background o dia todo — está no PRODUCT.md). É o que transforma o alerta de palavra-chave de "vejo quando abrir" pra "sou avisado na hora". O risco é virar spam de notificação e ele desligar tudo — então tem que ser **só pro crítico** (palavra-chave dura + 🔴), nunca pra mensagem comum. Tecnicamente: Notification API web (precisa permissão) ou `terminal-notifier`/osascript a partir do coletor que já roda 24/7 sob pm2 — o coletor é o lugar certo (não depende da aba aberta).
- **Esforço/onde**: P–M · coletor (dispara `osascript`/`terminal-notifier`) + dados (lista de termos).
- **Veredito**: 🟢 **fazer — disparado pelo coletor**, restrito a palavra-chave crítica. Reforça o "vivo/no-nonsense" da marca de um jeito que de fato muda o dia (ele não precisa vigiar o painel). É a peça que falta pro alerta de palavra-chave do `IDEAS.md` valer de verdade.

---

## F. Uma de "modo de uso" que não cabe nas anteriores

### F1. "Modo foco" — só o que precisa de você agora, tela cheia, um por vez
Um modo que esconde toda a UI e mostra **um item de cada vez** da fila "você deve resposta": o grupo, o resumo, o composer. Resolveu/respondeu → próximo. Tipo "triagem de email zero-inbox", mas pra grupos.

- **Caso de uso real**: 15 min entre reuniões. Entra no modo foco, despacha 5 grupos um a um sem se distrair com o resto, sai. É a materialização do "sessões rápidas" do PRODUCT.md.
- **CÉTICO — vale mesmo?** Gosto disso porque é **alinhado ao uso declarado** (foco dividido, sessões rápidas) e não é só mais uma view — é um *modo de operar*. O ceticismo: depende de a fila (C1/inbox) já existir e estar confiável; um "modo foco" sobre uma fila ruidosa amplifica o ruído. E tem risco de ser **construído antes da hora** (é polimento de fluxo, não fundação). É a cereja, não a base.
- **Esforço/onde**: M · painel (em cima da inbox/board).
- **Veredito**: 🟡 **fazer depois** que a inbox/board (C1) e a classificação de "pede resposta" estiverem sólidas. Sobre fundação boa, é excelente; sobre fundação fraca, vira gimmick. Bom como objetivo, errado como primeiro passo.

---

## As 5 que eu realmente faria

Sobreviveram ao ceticismo porque **resolvem dor real, com custo controlado, sem duplicar o que o MCP+Claude já entregam de graça**:

1. **A1 — Copiloto de thread embutido (só Resumir + Rascunhar primeiro)**. É o pedido central: tira o produto de "visualizador + MCP externo" pra "instrumento com IA dentro". Vale porque corta a fricção diária de "ir pro Claude e pedir via MCP" pros 2 casos de 90% do tempo. Começa pequeno (2 botões), com cache por estado do grupo pra não cobrar IA à toa. O resto do drawer só se esses 2 provarem uso.

2. **B1 — OCR local de imagem na chegada**. O maior ganho com **custo zero** (Apple Vision/Tesseract offline): imagem deixa de ser conteúdo cego, print de bug/boleto vira texto pesquisável e legível na timeline e na inbox. Específico ao caso nº1 de cliente dev (print de erro). Não depende de modelo pago. Restringir a grupos `client` mata o ruído de meme/figurinha.

3. **E3 — Notificação nativa do Mac pra alerta crítico (via coletor)**. Específico ao uso real (painel em background o dia todo, coletor 24/7 sob pm2). É o que faz o alerta de palavra-chave do `IDEAS.md` sair de "vejo quando abrir" pra "sou avisado na hora". Barato, e o coletor é o lugar certo (independe da aba). Restrito ao crítico pra não virar spam.

4. **C1 — "Bola comigo / bola com eles" como aba da inbox**. O ângulo novo que o `IDEAS.md` não tem: a coluna **"esperando o cliente"** (a quem *você* cobrou e sumiu) — base pro follow-up. Dados já existem (`fromMe`/`roleOf`), é UI + uma heurística. Duas listas, sem kanban drag-and-drop (que seria over-engineering pra 1 usuário).

5. **E2 — Export de resumo pro Obsidian via o que já existe (skill `anota` + `resumo_do_dia`)**. Esforço quase-zero, valor alto: fecha o loop "WhatsApp → histórico do projeto" usando a skill `anota` e o MCP que já existem, sem código novo. Vale justamente porque **não** é construir nada — é documentar/operacionalizar um fluxo já possível.

---

## As que parecem legais mas provavelmente não valem (anti-hype)

- **D1 — Detecção de cliente irritado / sentimento**. O exemplo-mor de IA-cool-que-entrega-pouco. Sentimento em pt-BR informal (ironia/gíria) é frágil, o falso-positivo cria ansiedade injustificada, e **para um usuário único que lê os grupos, ele percebe o tom melhor que o classificador**. Custo recorrente alto, valor incremental baixo. Se algo, palavra-chave dura — não classificador de humor.

- **A2 — Resumo automático no topo a cada abertura de grupo**. Cobra uma chamada de IA no gesto **mais frequente** do app (abrir grupo), inclusive quando ele só queria ver a última msg. Caminho mais curto pra fatura de API silenciosa. Se o A1 existir, ele clica "Resumir" quando quer — o ganho do automático não paga o custo recorrente.

- **D2 — Threads/assuntos automáticos por clustering**. Resolve com ML um problema que o **filtro de busca já resolve**. Grupos de 1 cliente não têm assuntos paralelos suficientes pra justificar clusterização. Over-engineering.

- **A4 (versão IA) — Classificar urgência de toda mensagem com modelo**. 80% da urgência sai de **palavra-chave grátis**; rodar modelo em 100% das mensagens de cliente o dia todo é custo desproporcional pelos 20% ambíguos. Fazer a versão keyword; deixar a IA pro clique sob demanda.

- **E1 (versão integração) — OAuth Google Calendar no painel pra prazo de áudio**. Extração de data relativa em fala informal é imprecisa (prazo errado > prazo nenhum), e o peso de OAuth/tokens é desproporcional — ainda mais que **o Claude no ambiente já tem tool de Calendar**. Fazer só a *detecção* do prazo como sinal; deixar a criação do evento fora do painel.

- **B3 — "print de bug vira card de tarefa"**. Feature sobre feature sobre feature (depende de descrição semântica de imagem **e** de um board de tarefas, nenhum dos dois pronto). Boa ideia de fase 3, não de roadmap atual.

---

### Fio condutor do ceticismo desta rodada
Três armadilhas se repetem e separam o útil do hype neste projeto:

1. **"O painel analisa em tempo real" quase sempre significa "rode um modelo a cada evento frequente"** — e isso é custo recorrente silencioso. As ideias que sobreviveram ou **não usam IA** (B1 OCR local, E3 notificação, C1 board) ou usam **sob demanda com cache** (A1). As que morreram cobram IA automaticamente em alta frequência (A2, A4-IA, D1).

2. **Muita "feature de IA no painel" duplica o que o MCP + Claude já entregam de graça** (A3 RAG, E2 export). Antes de construir, perguntar: o Claude que ele já tem aberto, com as 12 ferramentas do `server.ts`, já não faz isso? Se faz, o valor é só conveniência — e conveniência raramente justifica G de esforço.

3. **Cerimônia corporativa não cabe num founder usuário-único** (SLA com metas, sentimento, kanban drag-and-drop). O o operador não é um time de suporte; é um dono lendo seus próprios clientes. "Aging simples" sim, "SLA" não.
