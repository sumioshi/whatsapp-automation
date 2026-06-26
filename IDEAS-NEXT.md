# IDEAS-NEXT — Signal Room

Ideias priorizadas pra levar o painel ao nível "uau profissional". Ferramenta **local, 1 usuário** (o operador) pra triar conversas de clientes via WhatsApp. Nada de feature genérica de SaaS multi-tenant — tudo aqui é pra deixar a triagem mais rápida, mais inteligente e mais gostosa de usar.

Referências fundantes (pesquisa Refero, screens reais):
- **Fernand** (getfernand.com) — "the fast, calm customer support platform". Inbox dark, ordenação por prioridade, abas "Inbox / Waiting for answer / All", barra flutuante de ações em lote com **badge de atalho em cada botão** (Assign · Mark Done · Snooze · Tag), status pills, split-inboxes reordenáveis. É o norte da triagem.
- **Raycast / Arc command palette** — palette de duas colunas: lista à esquerda, **rail de ações contextuais à direita** pro item em foco; navegação 100% teclado, entrada fade+scale 0.98→1.
- **Linear** — status agrupado com dot colorido + contagem, densidade alta sem ruído.
- **Jace AI / Missive** — inbox com painel de IA contextual, palette que cria draft/task.

O painel já tem: ⌘K (busca grupo/ação), inbox de pendências (cliente-aguardando + menção), timeline rica, copiloto por grupo, /config, receipts, reações, filtro de mídia segmentado, tokens ember sólidos, microinterações (pop-in, msg-in, reveal, pressable, eq-bar). As ideias abaixo **não repetem** o que existe — extendem.

---

## As 3 apostas (fazer primeiro)

1. **#1 Navegação só-teclado tipo Superhuman (j/k/e/r + "próximo não-respondido")** — maior salto de velocidade de triagem por menor esforço. Transforma o inbox numa esteira.
2. **#4 Inbox como esteira com "ações em foco" (resolver/silenciar/abrir sem mouse) + barra de ação contextual** — fecha o loop da aposta 1; dá ao inbox o poder do Fernand.
3. **#6 SLA / "há quanto tempo esperando" + ordenação por urgência real** — a inteligência que falta: hoje o inbox lista, mas não te diz *o que dói mais*. Baixo esforço, alto impacto diário.

Essas três, juntas, entregam a fantasia "abro o painel, processo tudo que importa em 90 segundos sem tocar no mouse".

---

## Eixo: Triagem rápida (teclado-first)

### 1. Navegação só-teclado estilo Superhuman
- **Problema/oportunidade:** hoje tudo de rápido é o ⌘K. Dentro de um grupo ou do inbox, é tudo mouse. Triar 15 grupos vira 15 idas ao trackpad.
- **Como funcionaria:** atalhos single-key sem modificador quando o foco não está num input. No **inbox**: `j`/`k` move a seleção (linha realça com a borda ember), `Enter`/`o` abre o grupo, `e` resolve (marca "resolvido até aqui"), `m` silencia, `u` = pular pro **próximo não-respondido** (ver #6). No **grupo**: `r` foca o composer, `t` transcreve o último áudio, `g i` volta pro inbox, `g g` topo, `Shift+G` fim. Um overlay de cheat-sheet abre com `?` (estilo Linear/Superhuman). Tudo respeitando `prefers-reduced-motion` já existente.
- **Referência:** Superhuman (j/k/e + "go to next"), Linear (`?` cheat-sheet, single-key commands), Fernand (atalhos badge nos botões).
- **Esforço:** M
- **Impacto:** Alto

### 2. ⌘K mais poderoso — palette de 2 colunas com ações contextuais
- **Problema/oportunidade:** o ⌘K atual só **navega** (vai pro grupo / abre página). Ele não **age**. Num command-center de verdade, a palette executa.
- **Como funcionaria:** adotar o layout Raycast/Arc — lista à esquerda, **rail de ações à direita** pro item em foco. Ao focar um grupo na lista, o rail oferece: "Abrir", "Resumir conversa" (dispara copiloto), "Marcar resolvido", "Silenciar", "Ir pra última pendência". Comandos globais novos: "Transcrever último áudio do grupo X", "Copiar link do grupo", "Próximo não-respondido". `Tab` salta pro rail; `→` também. Mantém o frost/atmosphere-ember que já existe.
- **Referência:** Raycast Arc extension palette (split list + right action rail, footer "Open · Actions ⌘K"), Missive (palette cria draft/task).
- **Esforço:** M
- **Impacto:** Alto

### 3. Busca global de conteúdo (não só nome de grupo)
- **Problema/oportunidade:** ⌘K e a busca da sidebar filtram só **nome de grupo**. Quando o operador lembra "o cliente falou de prazo de homologação" mas não de qual grupo, não tem como achar.
- **Como funcionaria:** uma aba/escopo de busca que varre **texto e transcrições** de mensagens (o MCP `buscar` já faz isso server-side). Resultados agrupados por grupo, com o trecho destacado (componente `Highlight` já existe) e o horário. `Enter` abre o grupo já rolado até aquela mensagem (ancora por id). Acessível tanto no ⌘K (escopo "Mensagens") quanto como página /buscar.
- **Referência:** Jace AI search results (lista de trechos com timestamp), Missive command search.
- **Esforço:** M
- **Impacto:** Médio

---

## Eixo: Inteligência (priorização, SLA, agrupamento)

### 4. Inbox como esteira de trabalho (ação em foco + barra contextual)
- **Problema/oportunidade:** o inbox lista pendências mas é um beco — clicou, foi pro grupo, perdeu o contexto da fila. Não dá pra "processar a fila".
- **Como funcionaria:** a linha selecionada (via #1) ganha uma **barra de ação flutuante** no rodapé, estilo Fernand: `Resolver (e)` · `Silenciar (m)` · `Abrir (↵)` · `Adiar até amanhã (h)`. Resolver **não tira você do inbox** — anima a saída da linha (slide+fade, reaproveita `reveal`/`msg-in`) e auto-seleciona a próxima. Assim dá pra "limpar a caixa" inteira sem sair da página. Contador no header faz a contagem regressiva ("3 → 2 → tudo em dia") com o `NumberTicker` que já existe.
- **Referência:** Fernand floating bulk-action bar ("2 selected · Assign · Mark Done · Snooze" com badges de atalho), Superhuman "Inbox Zero" com auto-advance.
- **Esforço:** M
- **Impacto:** Alto

### 5. Agrupar por cliente/projeto (não só por grupo solto)
- **Problema/oportunidade:** uma software house fala com o mesmo cliente em vários grupos (comercial, suporte, projeto X). A sidebar lista grupos chapados, sem dizer que três deles são "Acme".
- **Como funcionaria:** um campo opcional `client` na config do grupo (ou inferido pelo nome). A sidebar passa a ter **seções colapsáveis por cliente** com dot colorido + contagem de não-lidas agregada (padrão Linear: header de grupo, count à direita, colapsa). Quando não há cliente atribuído, cai num grupo "Sem cliente". O inbox também pode agrupar: "Acme — 2 pendências".
- **Referência:** Linear (status groups colapsáveis com dot + count), Fernand split-inboxes.
- **Esforço:** M
- **Impacto:** Médio

### 6. "Há quanto tempo esperando" + ordenação por urgência
- **Problema/oportunidade:** o inbox ordena por **timestamp do gatilho** (mais recente primeiro). Mas o que mais dói é o cliente que está esperando **há mais tempo** — esse afunda no fim da lista. A urgência está invertida.
- **Como funcionaria:** cada item de pendência mostra um **selo de idade relativa** ("aguardando há 3h", "há 2 dias") com cor que esquenta com o tempo (fg-faint → accent-2 → accent → danger). Toggle de ordenação no header do inbox: "Mais antigo primeiro" (urgência) vs "Mais recente". O comando `u` (#1) sempre salta pro **mais velho não-respondido**. Heurística honesta, sem NLP — só `now - timestamp`, mas muda completamente a priorização visual.
- **Referência:** Fernand `order=priority` na URL + status dots; convenção de SLA-aging de help-desks (Zendesk/Intercom).
- **Esforço:** S
- **Impacto:** Alto

### 7. Detecção de pergunta vs. fechamento (refinar "cliente aguardando")
- **Problema/oportunidade:** a própria `inbox.ts` admite a limitação: um "valeu!" do cliente conta como "aguardando". Falsos positivos corroem a confiança no radar.
- **Como funcionaria:** um classificador leve **sem chamar IA** primeiro: heurística de "isto pede resposta?" — termina com `?`, contém termos de pedido ("consegue", "quando", "pode", "fica pra", "e aí"), tem mídia (áudio/doc quase sempre pede ação) → marca como **pergunta**. "ok", "valeu", "👍", "obrigado", reação-only → marca como **provavelmente fechado** e rebaixa (ou some). Mostra um micro-rótulo no item ("pergunta" / "ack"). Opcionalmente, pro grupo com copiloto ligado, um botão "classificar com IA" reordena com mais precisão — mas o default é grátis e instantâneo.
- **Referência:** Fernand "Waiting for answer" como aba dedicada; o eixo de inteligência do Jace.
- **Esforço:** M
- **Impacto:** Médio

### 8. Aba "Aguardando resposta SUA" vs "Aguardando o cliente"
- **Problema/oportunidade:** existe um estado invisível hoje: você respondeu e **está esperando o cliente**. Some do radar — mas é justamente o que precisa de follow-up se o cliente sumiu.
- **Como funcionaria:** segmentação no inbox (reusa o `SegmentedFilter` da Timeline): **"Sua vez"** (default, = lógica atual) · **"Vez do cliente"** (sua última msg foi há >X e ninguém respondeu — candidato a cobrança) · **"Tudo"**. Em "Vez do cliente", a ação em foco vira "Cobrar" (foca composer com contexto). Dá visibilidade ao follow-up sem virar CRM pesado.
- **Referência:** Fernand abas "Inbox / Waiting for answer / All", padrão de "snoozed/waiting" de inboxes modernos.
- **Esforço:** M
- **Impacto:** Médio

---

## Eixo: Momentos memoráveis (tasteful)

### 9. Transição de view com shared-element no avatar do grupo
- **Problema/oportunidade:** trocar de grupo é um corte seco. Falta a sensação de "continuidade" que faz o Arc/Linear parecerem caros.
- **Como funcionaria:** o quadradinho de iniciais do grupo (existe na sidebar, no inbox e no header da Timeline) faz um **morph de posição** ao navegar (View Transitions API do Next/browser, com fallback gracioso e `prefers-reduced-motion`). O header da conversa "cresce" a partir da linha clicada. Sutil, 200ms, com o `--ease-out-quint` que já é o padrão da casa. Um único movimento memorável, não confete.
- **Referência:** Arc (transições de espaço), Linear (peek/expand), a própria disciplina de motion do projeto.
- **Esforço:** M
- **Impacto:** Médio

### 10. "Foco" — modo leitura de um áudio/transcrição/doc em destaque
- **Problema/oportunidade:** transcrição e conteúdo de doc abrem inline e podem ficar gigantes no balão, quebrando o ritmo da timeline.
- **Como funcionaria:** ao transcrever um áudio longo ou ler um doc, um botão "abrir em foco" leva pra um **overlay frost** (o `.frost`/`atmosphere-ember` já existe) com a transcrição em largura de leitura confortável, o player no topo com o equalizer reativo, e `Esc` pra fechar. Dá pra copiar trechos, e um botão "→ rascunhar resposta sobre isto" liga no copiloto. Momento de calma no meio do fluxo.
- **Referência:** Superhuman read-pane focado, Raycast detail view; o spotlight ember do próprio projeto.
- **Esforço:** S
- **Impacto:** Médio

### 11. Indicador "ao vivo" honesto na sidebar (pulso de atividade)
- **Problema/oportunidade:** o `ConnectionDot` diz só "conectado". Mas qual grupo **acabou de receber** algo? O olho não tem pra onde ir. O poll de 3s já traz o dado — falta dramatizar de leve.
- **Como funcionaria:** quando uma mensagem nova chega num grupo (delta detectado no poll que a Timeline já faz), a linha daquele grupo na sidebar dá um **pulso ember único** (glow que aparece e some em ~1.2s, reusa `accent-glow`) e sobe pro topo da sua seção. Nada de badge piscando eterno — um flash que diz "olha aqui" e descansa. Respeita reduced-motion virando um simples realce estático.
- **Referência:** Vapi soundwave/pulse, padrão de "live activity" calmo (não notificação agressiva).
- **Esforço:** S
- **Impacto:** Médio

---

## Eixo: Densidade, legibilidade e estados de classe alta

### 12. Estados empty/loading/error com personalidade terminal
- **Problema/oportunidade:** os estados existem mas são desiguais. O inbox vazio tem um `✓` simpático; já um grupo carregando ou o coletor offline mostram texto cru ("coletor/painel pode estar reiniciando" some no silêncio). Estado é onde a "classe" aparece ou some.
- **Como funcionaria:** kit coeso de estados na linguagem Signal Room:
  - **Coletor offline** (status != conectado): um banner discreto no topo, mono, com o eq-bar parado em cinza e "coletor fora do ar · tentando reconectar" — em vez de polls falhando em silêncio.
  - **Loading de grupo:** skeleton de balões (reusa `ScanShimmer`) em vez de tela em branco antes da primeira mensagem.
  - **Inbox "tudo em dia":** elevar o atual — o eq-bar da home animando devagar + "fila limpa · {n} grupos no radar", virando um momento de recompensa, não um vazio.
  - **Erro de IA/transcrição:** já tem inline; padronizar o tom (mono, danger, com "tentar de novo" sempre presente — hoje só alguns têm).
- **Referência:** Linear/Raycast empty states com micro-cópia de marca; o próprio eq-bar e ScanShimmer do projeto.
- **Esforço:** M
- **Impacto:** Médio

---

## Fora de escopo aqui (já planejado em separado)
- **Sugestões inline do copiloto** no composer — tratado em doc próprio. As ideias acima só *encostam* no copiloto (palette dispara resumo, foco linka pra rascunho), sem detalhar a sugestão inline.

## Nota de gosto
Manter a regra de ouro do projeto: **acento ember é raro**, mono pra rótulos técnicos, bordas hairline, motion com `--ease-out-quint` e sempre com fallback `prefers-reduced-motion`. Nenhuma ideia acima introduz cor nova, segundo acento, ou decoração sem função. O objetivo é um command-center calmo e veloz — não um dashboard enfeitado.
