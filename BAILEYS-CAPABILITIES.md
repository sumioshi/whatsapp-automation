# Baileys — Capacidades não aproveitadas

Mapa do que a versão instalada do Baileys expõe e que o **whatsapp-automation** (coletor 24/7 + painel Next.js + MCP, ferramenta **local** de triagem de conversas) ainda **não usa**. Serve de backlog de ideias.

- **Versão instalada:** `baileys@7.0.0-rc13` (pacote `baileys`, não `@whiskeysockets/baileys`). Fonte: `package.json` (`"baileys": "^7.0.0-rc13"`) e `node_modules/baileys/package.json` (`"version": "7.0.0-rc13"`).
- **Tipos consultados:** `lib/Types/Events.d.ts` (BaileysEventMap), `lib/Socket/*.d.ts` (métodos do socket: `chats`, `messages-send`, `messages-recv`, `groups`, `communities`, `newsletter`, `business`), `lib/Types/{Chat,Message,Call,Label,GroupMetadata}.d.ts`, `lib/Utils/messages.d.ts`.
- **O que o projeto já cobre** (fonte: `src/whatsapp/gateway.ts`, `mapper.ts`, `media.ts`, `src/control/server.ts`):
  - Receber mensagens em grupo e DM (`messages.upsert` type `notify`); mapeia `conversation`, `extendedTextMessage`, `image/video/gif/audio/document/sticker`; baixa mídia; extrai citação (`quotedMessage`).
  - Enviar texto (`sendMessage {text}`), mídia (`image/document/audio/video/gif`), reação (`sendMessage {react}`), menção (`mentions`).
  - Receipts: `messages.update` (status numérico) + `message-receipt.update` (lida por participante, inclusive quem leu).
  - Contatos/identidade: `contacts.upsert/update`, `lid-mapping.update`, `messaging-history.set` (só para extrair contatos e mapeamento LID↔PN — **não** indexa o histórico de mensagens), `groupFetchAllParticipating` (nome dos grupos + participantes), `profilePictureUrl` (avatar).
  - Conexão/QR/reconexão com backoff.

> **Tudo abaixo é API REAL desta versão** — cada item cita o método/evento exato presente nos `.d.ts` instalados. Itens marcados ⚠️ **enviam ou alteram** algo na conta do WhatsApp do operador e exigem confirmação humana explícita antes de disparar.

---

## TOP 5 de maior valor para triagem de clientes

1. **Indexar o histórico que já chega de graça (`messaging-history.set` → `messages`)** — o coletor já recebe esse evento mas **descarta as `messages`**, usando só os contatos. No primeiro pareamento o WhatsApp despeja meses de conversa. Para uma software house que quer triar clientes, isso é o acervo inteiro de cada cliente disponível sem custo. Complementa com `fetchMessageHistory` (on-demand) para puxar mais para trás. **Maior alavanca de valor do projeto.**
2. **Presença "digitando/gravando/online" (`presence.update` + `presenceSubscribe`)** — saber em tempo real que um cliente está digitando/online é sinal direto de urgência e engajamento para a fila de triagem. Custo de implementação baixíssimo (um listener + um subscribe).
3. **Enquetes — criar e ler votos (`sendMessage {poll}` + `getAggregateVotesInPollMessage`)** ⚠️ — qualificação de lead e coleta de decisão estruturada ("Qual plano?", "Quer reunião esta semana?") direto no chat, com apuração automática dos votos. Resposta vira dado estruturado, não texto livre.
4. **Eventos de chamada (`call` event)** — hoje uma ligação de cliente é invisível ao painel. Capturar `offer/accept/reject/timeout/missed` permite registrar "cliente ligou e ninguém atendeu" — um dos sinais de triagem mais valiosos e fáceis de perder.
5. **Editar/apagar a própria mensagem enviada (`sendMessage {edit}` / `{delete}`)** ⚠️ — operacionalmente indispensável quando o atendimento manda algo errado pelo painel. Corrige sem trocar de app. Baixo esforço, alto uso diário.

---

## Mensagens — receber / interpretar (eventos)

| Capacidade (evento/método) | Status | O que habilita na triagem | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **History sync de mensagens** (`messaging-history.set` campo `messages`, `isLatest`, `progress`, `syncType`) | **Parcial** — evento já escutado, mas só lê `contacts`/`lidPnMappings`; ignora `messages` e `chats` | Acervo retroativo de cada cliente sem novo custo; abre busca/resumo sobre o passado | Indexar as `messages` do history nos mesmos `.jsonl` por conversa; barra de progresso de sync no painel | M | Baixo (só leitura). Volume pode ser grande → paginar/escrever em lote |
| **Histórico on-demand** (`fetchMessageHistory(count, oldestMsgKey, oldestMsgTimestamp)`; chega via `messages.upsert` com `requestId`) | **Não usado** | Puxar conversas antigas além do que o sync inicial trouxe (rolar para trás num cliente específico) | Botão "carregar mais antigas" por conversa no painel | M | Baixo |
| **`messaging-history.status`** (fase do sync: `complete`/`paused`) | **Não usado** | Saber quando o acervo terminou de baixar | Indicador "sincronizando / pronto" | S | Baixo |
| **Edição de mensagem recebida** (`messages.update` com `update.message` / `editedMessage`) | **Não usado** — `messages.update` só lê `status` | Cliente edita o que disse; hoje some no painel | Detectar edição e marcar o balão "(editada)" com histórico | S | Baixo |
| **Exclusão/revogação ("apagada para todos")** (`messages.update` stub `REVOKE` / `protocolMessage` type REVOKE; também `messages.delete`) | **Não usado** | Cliente apaga mensagem → sinal relevante (desistência, erro) | Marcar balão como "apagada", preservando o que foi capturado antes | S | Baixo |
| **Poll vote recebido** (`messages.update` com `pollUpdates`; apurar com `getAggregateVotesInPollMessage({message, pollUpdates}, meId)`) | **Não usado** — `mapMessage` retorna `null` p/ poll | Ler como cada cliente votou numa enquete enviada | Painel de resultados de enquete por grupo | M | Baixo (leitura). Precisa do `messageSecret` original |
| **Mensagem efêmera recebida** (`ephemeralMessage` wrapper; `disappearingMessagesInChat`) | **Não usado** — wrapper não desembrulhado | Conversas em modo temporário hoje podem cair no `default: return null` | Desembrulhar `ephemeralMessage` no `mapMessage` para não perder conteúdo | S | Baixo |
| **View-once recebido** (`viewOnceMessage` / `isViewOnce`) | **Não usado** | Mídia "ver uma vez" de cliente | Capturar e arquivar antes de expirar | S | Médio — sensível; arquivar mídia view-once pode ser indesejado eticamente |
| **Localização / live location** (`locationMessage`, `liveLocationMessage`) | **Não usado** — cai no `default` | Cliente manda endereço/localização (entrega, visita técnica) | Mapear como tipo `location`, mostrar lat/long/preview no painel | S | Baixo |
| **vCard / contato compartilhado** (`contactMessage`, `contactsArrayMessage`) | **Não usado** | Cliente encaminha contato de um terceiro (indicação, responsável) | Mapear `contacts`, extrair nome/telefone para o CRM de triagem | S | Baixo |
| **Mensagem citada/thread** (`contextInfo.quotedMessage`) | **Parcial** — extrai texto e `participant`, mas só p/ poucos tipos de quoted | Reconstruir o fio da conversa | Extrair também `stanzaId` (link ao balão original) e mais tipos de quoted (doc, audio, sticker) | S | Baixo |
| **Convite de grupo recebido** (`groupInviteMessage`) | **Não usado** | Cliente manda link/convite de grupo | Mapear, mostrar nome do grupo convidado | S | Baixo |
| **Event message recebido** (`eventMessage`: nome, datas, local, call) | **Não usado** | Cliente propõe reunião/evento agendado | Capturar e exibir como card de evento | S | Baixo |

## Mensagens — enviar / alterar (ações ⚠️)

| Capacidade (método) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **Editar mensagem enviada** (`sendMessage(jid, {text, edit: key})`) | **Não usado** | Corrigir o que o atendimento mandou errado pelo painel | Botão "editar" no balão "Você" | S | ⚠️ Altera mensagem real — confirmar |
| **Apagar/revogar mensagem** (`sendMessage(jid, {delete: key})`) | **Não usado** | Tirar mensagem errada da conversa do cliente | Botão "apagar para todos" | S | ⚠️ Confirmar; irreversível |
| **Responder/citar** (`sendMessage(jid, content, {quoted: WAMessage})`) | **Não usado** — envia sem citação | Responder fio específico do cliente, deixa claro a que ponto se refere | "Responder" no balão → envia com `quoted` | S | ⚠️ Confirmar (já é envio) |
| **Encaminhar** (`sendMessage(jid, {forward: WAMessage})`) | **Não usado** | Repassar mensagem de cliente para outro grupo/colega | "Encaminhar para…" no painel | S | ⚠️ Confirmar |
| **Fixar mensagem no chat** (`sendMessage(jid, {pin: key, type, time: 86400\|604800\|2592000})`) | **Não usado** | Fixar o pedido/briefing chave da conversa | "Fixar" com duração 1d/7d/30d | S | ⚠️ Confirmar |
| **Criar enquete** (`sendMessage(jid, {poll: {name, values, selectableCount, messageSecret}})`) | **Não usado** | Qualificar lead com opções estruturadas | Compositor de enquete no painel + leitura de votos (ver acima) | M | ⚠️ Confirmar |
| **Localização** (`sendMessage(jid, {location})`) | **Não usado** | Mandar endereço do escritório/ponto de encontro | Enviar localização | S | ⚠️ Confirmar |
| **Compartilhar contato (vCard)** (`sendMessage(jid, {contacts})`) | **Não usado** | Passar contato de um responsável ao cliente | Enviar vCard | S | ⚠️ Confirmar |
| **Álbum** (`sendMessage(jid, {album})` + `albumParentKey`) | **Não usado** | Mandar várias fotos como álbum (portfólio, mockups) | Envio de álbum | M | ⚠️ Confirmar |
| **Event message** (`sendMessage(jid, {event: {name, startDate, location, call}})`) | **Não usado** | Propor reunião com data/hora estruturada | Agendar evento no chat | M | ⚠️ Confirmar |
| **Mensagens efêmeras no chat** (`sendMessage(jid, {disappearingMessagesInChat: n})` ou `groupToggleEphemeral`) | **Não usado** | Definir conversas temporárias quando o cliente pede sigilo | Toggle "mensagens temporárias" por conversa | S | ⚠️ Altera config do chat — confirmar |
| **Botão/lista de resposta** (`buttonReply`, `listReply` em `AnyRegularMessageContent`) | **Não usado** | Respostas rápidas estruturadas | Menus de resposta rápida | M | ⚠️ Confirmar; suporte do lado do cliente é instável |
| **Marcar mídia view-once ao enviar** (`{... , viewOnce: true}`) | **Não usado** | Enviar proposta/preço como "ver uma vez" | Flag view-once no envio | S | ⚠️ Confirmar |

## Presença & "lido"

| Capacidade (método/evento) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **Receber presença** (`presence.update` event; `presenceSubscribe(jid)`) | **Não usado** | Ver "digitando/gravando/online/visto por último" do cliente | Indicador ao vivo na conversa; subscribe nas conversas abertas | S | Baixo (subscribe é discreto) |
| **Publicar a própria presença** (`sendPresenceUpdate('composing'\|'recording'\|'available'\|'paused', jid)`) | **Não usado** — `markOnlineOnConnect:false` | Mostrar "digitando…" ao cliente enquanto se redige a resposta (humaniza) | Disparar `composing` ao começar a digitar no painel | S | ⚠️ Expõe atividade online — opcional |
| **Marcar como lido / não-lido** (`readMessages(keys)`; `chatModify({markRead}, jid)`) | **Não usado** | Controlar os "✓✓ azuis" deliberadamente; deixar conversa não-lida para revisitar | Botão "marcar lida/não-lida" na fila de triagem | S | ⚠️ Marcar lido manda receipt ao cliente — confirmar |
| **Receipts de DM** (lógica atual filtra só `@g.us`) | **Parcial** — em `gateway.ts` os handlers de receipt ignoram não-grupo | Hoje só vê "lida por N" em grupo; DM (a maior parte do atendimento) fica de fora | Estender `onMessageReceiptUpdate`/`onMessagesUpdate` para DMs | S | Baixo |

## Chats — organização da fila de triagem (`chatModify`)

| Capacidade (`chatModify(mod, jid)`) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **Arquivar** (`{archive, lastMessages}`) | **Não usado** | Tirar cliente já atendido da fila ativa | "Arquivar conversa" | S | ⚠️ Altera estado no app |
| **Fixar chat** (`{pin}`) | **Não usado** | Subir cliente prioritário no topo | "Fixar conversa" | S | ⚠️ Idem |
| **Silenciar** (`{mute: ms\|null}`) | **Não usado** | Calar grupos ruidosos sem perder coleta | "Silenciar" | S | ⚠️ Idem |
| **Marcar lido/não-lido** (`{markRead}`) | **Não usado** | Ver acima | — | S | ⚠️ |
| **Limpar / apagar conversa** (`{clear}` / `{delete}`) | **Não usado** | — | (pouco útil p/ triagem; risco alto) | S | ⚠️ Destrutivo |
| **Favoritar/estrelar mensagem** (`star(jid, messages, star)` ou `chatModify({star})`) | **Não usado** | Marcar mensagens-chave de um cliente (briefing, valor fechado) | "Estrelar" no balão; filtro "estreladas" | S | ⚠️ |
| **Eventos de chat** (`chats.upsert/update/delete`, `chats.lock`, `presence`…) | **Não usado** — listeners não registrados | Lista de conversas com unreadCount, pin, mute, archived direto do WhatsApp | Construir a sidebar de conversas a partir desses eventos | M | Baixo (leitura) |

## Grupos — gestão (`groups`)

| Capacidade (método) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **Metadata completa** (`groupMetadata(jid)`: `desc`, `owner`, `creation`, `announce`, `restrict`, `size`, `ephemeralDuration`, `joinApprovalMode`…) | **Parcial** — `groupFetchAllParticipating` usado só p/ `subject` + participantes | Mostrar descrição/dono/regras do grupo do cliente | Painel de detalhes do grupo | S | Baixo |
| **Eventos de participantes** (`group-participants.update`: add/remove/promote/demote; `groups.update`) | **Não usado** — listeners não registrados | Saber em tempo real quando alguém entra/sai/vira admin no grupo do cliente | Timeline "fulano entrou/saiu" | S | Baixo |
| **Pedidos de entrada** (`group.join-request` event; `groupRequestParticipantsList`, `groupRequestParticipantsUpdate(approve\|reject)`) | **Não usado** | Aprovar/recusar entrada em grupo gerido | Fila de aprovação no painel | M | ⚠️ aprovar/recusar altera o grupo |
| **Criar grupo** (`groupCreate(subject, participants)`) | **Não usado** | Abrir grupo dedicado por projeto/cliente | "Novo grupo de projeto" | S | ⚠️ Confirmar |
| **Add/remover/promover/rebaixar** (`groupParticipantsUpdate(jid, jids, 'add'\|'remove'\|'promote'\|'demote')`) | **Não usado** | Gerir quem participa do grupo do cliente | Gestão de membros | S | ⚠️ Confirmar |
| **Assunto / descrição** (`groupUpdateSubject`, `groupUpdateDescription`) | **Não usado** | Renomear grupo, atualizar briefing na descrição | Editar nome/descrição | S | ⚠️ Confirmar |
| **Link de convite** (`groupInviteCode`, `groupRevokeInvite`, `groupAcceptInvite`, `groupGetInviteInfo`) | **Não usado** | Gerar/revogar link para o cliente entrar | "Gerar link de convite" | S | ⚠️ Revogar/entrar altera estado |
| **Configurações** (`groupSettingUpdate('announcement'/'locked'/…)`, `groupMemberAddMode`, `groupJoinApprovalMode`, `groupToggleEphemeral`) | **Não usado** | Travar quem fala/edita; exigir aprovação de entrada | Painel de config do grupo | S | ⚠️ Confirmar |
| **Sair do grupo** (`groupLeave(id)`) | **Não usado** | Encerrar acompanhamento | "Sair do grupo" | S | ⚠️ Confirmar |

## Perfil & contatos

| Capacidade (método) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **Foto de perfil de contato/grupo** (`profilePictureUrl(jid, 'image'\|'preview')`) | **Parcial** — usa `'image'` para avatar; `'preview'` (thumb leve) não | Avatares no painel | Usar `'preview'` para lista (mais leve), `'image'` no detalhe | S | Baixo |
| **Status/recado de texto do contato** (`fetchStatus(...jids)`) | **Não usado** | "Sobre"/recado do cliente (às vezes traz info útil) | Mostrar status no perfil do contato | S | Baixo |
| **Verificar se número tem WhatsApp** (`onWhatsApp(...phones)` → `{jid, exists}`) | **Não usado** | Validar telefone antes de iniciar conversa | "Esse número tem WhatsApp?" antes de mandar DM | S | Baixo |
| **Perfil business de contato** (`getBusinessProfile(jid)`) | **Não usado** | Saber se o contato é empresa, categoria, descrição, e-mail, site | Enriquecer ficha do cliente | S | Baixo |
| **Duração de mensagens efêmeras do contato** (`fetchDisappearingDuration(...jids)`) | **Não usado** | Saber se a conversa do cliente está em modo temporário | Indicador "temporária" | S | Baixo |
| **Alterar o próprio perfil** (`updateProfileName`, `updateProfileStatus`, `updateProfilePicture`, `removeProfilePicture`) | **Não usado** | — | (operacional, baixo valor p/ triagem) | S | ⚠️ Altera conta |
| **Privacidade da própria conta** (`updateLastSeenPrivacy`, `updateOnlinePrivacy`, `updateReadReceiptsPrivacy`, `updateGroupsAddPrivacy`, `fetchPrivacySettings`…) | **Não usado** | Controlar exposição da conta de atendimento | Tela de privacidade | S | ⚠️ Altera conta |

## Blocklist

| Capacidade (método/evento) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **Bloquear/desbloquear** (`updateBlockStatus(jid, 'block'\|'unblock')`) | **Não usado** | Bloquear spammer/ex-cliente abusivo | Botão "bloquear" | S | ⚠️ Confirmar |
| **Ler blocklist** (`fetchBlocklist()`; `blocklist.set`/`blocklist.update` events) | **Não usado** | Saber quem está bloqueado | Lista de bloqueados; sinalizar no painel | S | Baixo |

## Labels (business)

| Capacidade (método/evento) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **Criar/editar label** (`addLabel(jid, LabelActionBody)`; `labels.edit` event) | **Não usado** | Etiquetar conversas (Novo lead, Em proposta, Fechado) — encaixa perfeito na triagem | Sistema de labels coloridas (20 cores) | M | ⚠️ Conta business; altera estado |
| **Atribuir label a chat/mensagem** (`addChatLabel`/`removeChatLabel`, `addMessageLabel`/`removeMessageLabel`; `labels.association` event) | **Não usado** | Mover cliente entre estágios do funil | Drag-and-drop de etiquetas; filtro por label | M | ⚠️ Idem |
| **Quick replies** (`addOrEditQuickReply`, `removeQuickReply`) | **Não usado** | Respostas-padrão da software house | Biblioteca de respostas rápidas | S | ⚠️ Conta business |

## Status / Stories

| Capacidade (método) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **Ver status de contatos** (mensagens com `remoteJid = 'status@broadcast'`; hoje filtradas fora em `onMessagesUpsert`) | **Não usado** | Ver o que clientes postam no status (lançamentos, novidades) | Aba "status dos contatos" | M | Médio — volume; privacidade |
| **Postar status** (`sendMessage('status@broadcast', content, {statusJidList})`) | **Não usado** | Divulgar novidades da software house | Compositor de status | M | ⚠️ Confirmar; broadcast |

## Chamadas (call)

| Capacidade (evento/método) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **Eventos de chamada** (`call` event: `offer/ringing/accept/reject/timeout/terminate`, `isVideo`, `from`, `date`) | **Não usado** — listener não registrado | Registrar "cliente ligou", "chamada perdida", áudio vs vídeo | Log de chamadas na timeline; alerta de chamada perdida | S | Baixo (leitura) |
| **Rejeitar chamada** (`rejectCall(callId, callFrom)`) | **Não usado** | Recusar chamadas automaticamente fora do horário | Auto-rejeição com mensagem | S | ⚠️ Ação automática — cuidado |
| **Criar link de chamada** (`createCallLink('audio'\|'video', {startTime})`) | **Não usado** | Mandar link de call agendada ao cliente | "Gerar link de reunião" | S | ⚠️ Confirmar |

## Comunidades & Canais (newsletter)

| Capacidade (método) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **Comunidades** (`communityMetadata`, `communityCreate`, `communityLinkGroup`/`communityUnlinkGroup`, `communityFetchLinkedGroups`, `communityParticipantsUpdate`…) | **Não usado** | Estruturar grupos de clientes sob uma comunidade | Visão de comunidade + grupos vinculados | M | ⚠️ Várias ações alteram estado |
| **Canais / Newsletter** (`newsletterMetadata`, `newsletterCreate`, `newsletterFetchMessages`, `subscribeNewsletterUpdates`, `newsletterReactMessage`…; events `newsletter.reaction/view`, `newsletter-participants.update`) | **Não usado** | Ler/postar em canal da software house; métricas de view/reação | Coletar e exibir posts de canal | M | ⚠️ Criação/post altera estado |

## Catálogo / Pedidos (business)

| Capacidade (método) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **Catálogo** (`getCatalog({jid, limit, cursor})`, `getCollections`) | **Não usado** | Ver catálogo de produtos de cliente business | Listar produtos do contato | M | Baixo (leitura) |
| **Detalhe de pedido** (`getOrderDetails(orderId, tokenBase64)`; `orderMessage` recebido) | **Não usado** | Cliente manda pedido pelo catálogo → ler itens/valores | Mapear `orderMessage`, mostrar pedido estruturado | M | Baixo |
| **Gerir produtos próprios** (`productCreate`, `productUpdate`, `productDelete`, `updateBussinesProfile`, `updateCoverPhoto`) | **Não usado** | — | (gestão de loja; fora do escopo de triagem) | M | ⚠️ Conta business |

## Settings & sincronização (eventos)

| Capacidade (evento) | Status | O que habilita | Ideia de feature | Esforço | Risco |
|---|---|---|---|---|---|
| **`settings.update`** (locale, statusPrivacy, timeFormat, disableLinkPreviews…) | **Não usado** | Espelhar config da conta | (baixo valor) | S | Baixo |
| **`message-capping.update`** (`NewChatMessageCapInfo`; `fetchNewChatMessageCap`) | **Não usado** | Saber limite anti-spam de mensagens para chats novos | Avisar antes de bater o limite ao prospectar | S | Baixo |
| **`group.member-tag.update`** | **Não usado** | Tag de membro em grupo | (nicho) | S | Baixo |

---

### Notas técnicas

- **Poll secret:** `getAggregateVotesInPollMessage` precisa do `messageSecret` da enquete original (gerado no `{poll}` enviado). Para apurar votos é preciso guardar esse secret ao criar a enquete.
- **`messaging-history.set` já está sendo escutado** em `gateway.ts:268` apenas para `contacts`/`lidPnMappings` — habilitar a indexação de `messages` é a mudança de menor atrito e maior retorno.
- **Filtros atuais que descartam conteúdo:** `onMessagesUpsert` ignora `type !== 'notify'` (some todo o histórico) e qualquer `remoteJid` que não seja `@g.us`/`@s.whatsapp.net`/`@lid` (some `status@broadcast`). `mapMessage` faz `default: return null` para location/contact/poll/event/efêmeras — esses tipos são silenciosamente perdidos hoje.
- **Receipts só em grupo:** os handlers de receipt em `gateway.ts` filtram `jid.endsWith('@g.us')`, então o "lido" de DM (o grosso do atendimento 1:1) não é capturado.
- Todas as **ações de envio/alteração** (⚠️) devem passar pela regra já existente do projeto: humanizar o rascunho e confirmar o texto/efeito exato com o operador antes de disparar.
