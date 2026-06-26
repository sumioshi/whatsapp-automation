# Plano de implementação — Baileys no whatsapp-automation

Plano acionável derivado de [`BAILEYS-CAPABILITIES.md`](./BAILEYS-CAPABILITIES.md). Transforma o backlog em ondas priorizadas, mapeando cada capacidade ao trabalho real na arquitetura do projeto. **Só planejamento — nenhuma linha de código aqui.**

## Como a arquitetura condiciona o plano

O projeto tem uma fronteira limpa (hexagonal). Quase toda capacidade nova percorre a mesma trilha de 5 camadas:

1. **`src/whatsapp/gateway.ts`** — único arquivo que conhece o Baileys. Registra listener de evento ou chama método do socket.
2. **`src/whatsapp/mapper.ts`** — traduz o tipo do Baileys → tipo de domínio (`InboundMessage`, etc.).
3. **`src/core/message.ts` + `src/core/ports.ts`** — define o tipo de domínio e o método na porta `WhatsAppGateway` / `MessageStore`.
4. **`src/storage/*`** — persiste em `.jsonl`/arquivo por conversa (e leitor correspondente).
5. **`src/control/server.ts`** (envio/ação) **+ MCP + painel Next.js** — expõe ao usuário.

**Regra de ouro do projeto:** toda ação que **envia ou altera** (⚠️) passa pelo skill `humanizer` e confirmação explícita do operador antes de disparar. O plano embute isso como gate em cada item ⚠️.

**Convenções de esforço:** S = ~1 sessão · M = ~2-3 sessões · L = ~1 semana. Riscos de conta (ban) marcados onde existem.

---

## Onda 0 — Fundações de leitura (pré-requisito, baixo risco)

Habilita várias features de uma vez e não envia nada. Fazer primeiro.

### 0.1 — Registrar os listeners que hoje não existem
**Esforço S · risco baixo (só leitura).**
Em `gateway.ts:connect()` hoje só há 9 listeners. Adicionar (sem ainda processar a fundo, só rotear para o emitter de domínio):
- `call` → novo `onCall`
- `group-participants.update`, `groups.update`, `group.join-request` → novo `onGroupEvent`
- `chats.upsert/update/delete` → novo `onChat`
- `presence.update` → novo `onPresence`
- `blocklist.set/update` → novo `onBlocklist`

> **Cuidado de reconexão:** cada novo listener registrado em `connect()` precisa do par `removeAllListeners` no bloco de teardown (gateway.ts:222-238), senão vaza listener a cada reconexão. Checklist obrigatório por listener adicionado.

### 0.2 — Não descartar tipos de mensagem no `mapMessage`
**Esforço M · risco baixo.**
Hoje `mapMessage` faz `default: return null` e perde location, vCard, poll, event, efêmeras e view-once. Plano:
- Desembrulhar `ephemeralMessage` e `viewOnceMessage` no topo (como já faz com `documentWithCaptionMessage`).
- Adicionar ao `MessageType` (em `core/message.ts`): `location`, `contact`, `poll`, `event`.
- Estender o `switch` com os casos novos, cada um preenchendo campos no `InboundMessage`.
- Definir como cada um serializa no `MessageRecord` (`storage/fileStore.ts`).

Entregável: nenhuma mensagem de cliente é mais silenciosamente perdida.

### 0.3 — Receipts em DM
**Esforço S · risco baixo.**
`onMessageReceiptUpdate` e `onMessagesUpdate` filtram `jid.endsWith('@g.us')`, então o "lido" de DM (grosso do atendimento 1:1) some. Plano: trocar o filtro por `@g.us || isDirectJid(jid)` e ajustar a lógica de agregação (em DM não há "lido por N", é booleano).

---

## Onda 1 — TOP 5 de valor para triagem

### 1.1 — History sync de mensagens *(TOP #1)*
**Esforço M · risco baixo · maior alavanca do projeto.**

`messaging-history.set` já é escutado (gateway.ts:268) mas só lê `contacts`/`lidPnMappings`. Plano:
- No mesmo handler, iterar `messages` e `chats`.
- Reusar `mapMessage` para cada `WAMessage` do histórico (cuidado: history não tem `download` ativo do mesmo jeito do tempo real — validar `buildMediaDescriptor` com mensagem de history; se mídia não baixar, gravar metadado sem arquivo).
- Persistir nos mesmos `.jsonl` por conversa, com **dedup por `id`** (o leitor já precisa tolerar reprocessamento).
- Emitir progresso (`progress`, `isLatest`, `syncType`) para um novo status no painel.
- **Complemento on-demand:** porta nova `fetchHistory(jid, count)` → `sock.fetchMessageHistory(...)`; resposta chega via `messages.upsert` com `requestId` (rotear esse caso, hoje ignorado por `type !== 'notify'`).

Subtarefas:
- [ ] Iterar e mapear `messages` do history sync
- [ ] Dedup por `id` no fileStore + tolerância no leitor
- [ ] Tratar mídia de history (download best-effort)
- [ ] Status de progresso de sync (gateway → painel)
- [ ] `fetchHistory` on-demand + roteamento do `requestId` no upsert
- [ ] Botão "carregar mais antigas" no painel

### 1.2 — Presença "digitando / online" *(TOP #2)*
**Esforço S · risco baixo.**

- Listener `presence.update` → novo `InboundPresence` de domínio (jid, participante, estado `composing/recording/available/unavailable`, lastSeen).
- `presenceSubscribe(jid)` ao abrir uma conversa no painel (porta nova `subscribePresence(jid)`).
- Indicador ao vivo na conversa (estado transiente, **não** persistir em `.jsonl`).
- Opcional ⚠️: `sendPresenceUpdate('composing')` para mostrar "digitando…" ao cliente enquanto se redige — expõe atividade online, deixar atrás de flag desligada por padrão.

### 1.3 — Enquetes: criar + ler votos *(TOP #3)* ⚠️
**Esforço M · risco baixo (leitura) / ⚠️ (envio).**

- **Criar:** porta `sendPoll(jid, name, options, selectableCount)` → `sendMessage(jid, {poll})`. **Guardar o `messageSecret`** gerado, indexado por `id` da enquete — é obrigatório para apurar votos depois.
- **Ler votos:** votos chegam em `messages.update` com `pollUpdates`. Apurar com `getAggregateVotesInPollMessage({message, pollUpdates}, meId)` usando o secret guardado.
- Persistir enquete + agregação de votos por conversa; painel de resultados.
- Gate: criação passa por humanizer + confirmação.

Subtarefas:
- [ ] `sendPoll` na porta + control server + MCP
- [ ] Persistir `messageSecret` por enquete
- [ ] Capturar `pollUpdates` e agregar votos
- [ ] Painel de resultados de enquete

### 1.4 — Eventos de chamada *(TOP #4)*
**Esforço S · risco baixo.**

- Listener `call` → `InboundCall` de domínio (from, isVideo, status `offer/accept/reject/timeout/terminate`, date, isGroup).
- Derivar "chamada perdida" (offer sem accept dentro de janela) — sinal de triagem valioso.
- Persistir como evento na timeline da conversa (`calls.jsonl` ou linha no messages com `type:'call'`).
- Alerta no painel para chamada perdida de cliente.
- (Fase 2, opcional) `rejectCall` automático fora de horário — ⚠️ ação automática, atrás de flag.

### 1.5 — Editar / apagar mensagem própria *(TOP #5)* ⚠️
**Esforço S · ⚠️ altera mensagem real.**

- `editMessage(jid, key, newText)` → `sendMessage(jid, {text, edit: key})`.
- `deleteMessage(jid, key)` → `sendMessage(jid, {delete: key})`.
- No painel: botões "editar"/"apagar" só no balão "Você".
- Gate: confirmação obrigatória; apagar é irreversível → dupla confirmação.
- **Lado recepção** (já planejado em 0.2 indireto): detectar edição/revogação de mensagem **recebida** via `messages.update`/stub REVOKE e marcar o balão "(editada)"/"(apagada)".

---

## Onda 2 — Organização da fila de triagem

### 2.1 — `chatModify`: arquivar / fixar / silenciar / estrelar ⚠️
**Esforço S por ação · ⚠️ altera estado no app.**
Porta única `modifyChat(jid, mod)` cobrindo:
- `{archive}` — tirar cliente atendido da fila
- `{pin}` — subir cliente prioritário
- `{mute: ms|null}` — calar grupo ruidoso sem parar a coleta
- `{markRead}` / não-lido — controlar ✓✓ azul (⚠️ marcar lido manda receipt)
- `star(...)` — estrelar mensagem-chave (briefing, valor fechado) + filtro "estreladas" no painel

Cada `chatModify` precisa de `lastMessages` (a última mensagem do chat) — o gateway já tem isso no fluxo de upsert; cachear por jid.

### 2.2 — Sidebar de conversas a partir dos eventos de chat
**Esforço M · risco baixo.**
Com os listeners de `chats.*` da Onda 0.1, construir a lista de conversas com `unreadCount`, `pin`, `mute`, `archived` vindos do próprio WhatsApp — em vez de derivar só dos arquivos. Alimenta a UX de triagem.

### 2.3 — Responder/citar, encaminhar, fixar mensagem ⚠️
**Esforço S · ⚠️ envio.**
- `quoted` em `sendText`/`sendMedia` (porta já existe, falta passar `options.quoted`) → "Responder" no balão.
- `forward` → "Encaminhar para…".
- `pin` de mensagem (`{pin: key, type, time}`) → fixar briefing-chave 1d/7d/30d.
- Todos com gate de confirmação.

---

## Onda 3 — Grupos, contatos, enriquecimento

### 3.1 — Eventos e metadata de grupo (leitura)
**Esforço S · risco baixo.**
- `group-participants.update` → timeline "entrou/saiu/virou admin".
- `groupMetadata` completo (desc, owner, regras, size, ephemeral) no painel de detalhes do grupo.

### 3.2 — Gestão de grupo (ações) ⚠️
**Esforço S-M · ⚠️ altera grupo.**
`groupCreate`, `groupParticipantsUpdate (add/remove/promote/demote)`, `groupUpdateSubject/Description`, `groupInviteCode/Revoke`, `groupSettingUpdate`, `groupLeave`, fila de `group.join-request` (`groupRequestParticipantsUpdate`). Cada um atrás de confirmação. Priorizar "grupo dedicado por projeto" + "link de convite" (mais úteis para software house).

### 3.3 — Enriquecimento de contato (leitura)
**Esforço S · risco baixo.**
- `onWhatsApp(phone)` — validar número antes de iniciar DM.
- `getBusinessProfile(jid)` — é empresa? categoria, site, e-mail.
- `fetchStatus(jid)` — recado/sobre do cliente.
- `profilePictureUrl(jid, 'preview')` para a lista (mais leve) e `'image'` no detalhe.
Tudo entra na ficha do contato no painel.

---

## Onda 4 — Business & avançado (sob demanda)

Fazer só se aparecer caso de uso concreto:
- **Labels (business)** ⚠️ — `addLabel`/`addChatLabel` como funil (Novo lead → Em proposta → Fechado), 20 cores. Encaixa muito bem na triagem **se** a conta for business. Esforço M.
- **Catálogo/pedidos** — `getCatalog`, `getOrderDetails`, mapear `orderMessage` recebido. Esforço M.
- **Status/Stories** — ver `status@broadcast` (hoje filtrado fora); ⚠️ postar status. Esforço M, atenção a volume/privacidade.
- **Comunidades / Canais (newsletter)** — estruturar grupos sob comunidade; ler/postar canal. Esforço M, várias ações ⚠️.
- **Bloquear/desbloquear** ⚠️ + ler blocklist. Esforço S.
- **Quick replies** (business) — biblioteca de respostas-padrão. Esforço S.
- **Eventos / álbum / localização / vCard no envio** ⚠️ — completar o compositor de envio. Esforço S cada.

---

## Mapa rápido capacidade → arquivo

| Camada | Arquivo | O que muda |
|---|---|---|
| Listeners + chamadas Baileys | `src/whatsapp/gateway.ts` | novos `sock.ev.on(...)` (+ teardown!) e novos métodos de envio/ação |
| Tradução tipo Baileys → domínio | `src/whatsapp/mapper.ts` | novos casos no `switch`, desembrulho de wrappers |
| Tipos de domínio | `src/core/message.ts` | novos `MessageType`, `Inbound*`, `Outbound*` |
| Contratos | `src/core/ports.ts` | novos métodos em `WhatsAppGateway` / `MessageStore` |
| Persistência | `src/storage/*` | novos `.jsonl`/leitores, dedup por `id` |
| Envio/ação local | `src/control/server.ts` | novas rotas POST (com gate de confirmação) |
| Exposição | MCP + painel Next.js | novas ferramentas/telas |

## Sequência recomendada

```
Onda 0 (fundações leitura)  →  Onda 1 (TOP 5)  →  Onda 2 (fila)  →  Onda 3 (grupos/contatos)  →  Onda 4 (sob demanda)
```

Começar por **0.1 → 0.2 → 0.3 → 1.1**: zero risco de envio, desbloqueia o maior valor (history sync) e prepara o terreno para todo o resto.

## Riscos transversais

- **Teardown de listeners** na reconexão (gateway.ts:222) — todo listener novo precisa do par `removeAllListeners`.
- **Volume do history sync** — escrever em lote, dedup por `id`, paginar.
- **Ações ⚠️** — sempre humanizer + confirmação; nunca disparar automático sem flag explícita.
- **Conta única** — toda ação altera a conta real de atendimento; evitar automações que pareçam bot (risco de ban do WhatsApp).
