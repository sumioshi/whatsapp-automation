# Pesquisa: Claude Remote Control para Notificações de Mensagens WhatsApp

**Data:** 2026-06-22  
**Objetivo:** Entender como aproveitatar o Claude Remote Control para notificar o usuário (o operador) quando o coletor de WhatsApp detecta mensagens em grupos, integrando sinal em tempo real com notificações push mobile.

---

## 1. O que é Claude Remote Control

Claude Remote Control é um recurso que **conecta sessões locais do Claude Code** (rodando na sua máquina) a **dispositivos remotos** — o navegador (claude.ai/code) ou o app móvel do Claude (iOS/Android).

### Características-chave

- **Sessão local persiste**: Claude roda inteiramente na sua máquina; apenas mensagens viajam pela API Anthropic via TLS.
- **Disponibilidade**: Research preview, disponível em Pro, Max, Team e Enterprise. Requer Claude Code v2.1.51+.
- **Requer**: Autenticação claude.ai (não suporta API keys), workspace trust, e Machine/org trust (em Team/Enterprise, admin ativa via settings).
- **Conexão resiliente**: Se o laptop dorme ou internet cai, a sessão reconecta automaticamente quando volta online.
- **Um processo local = uma sessão remota** (em modo interativo). Para múltiplas sessões concorrentes, use `claude remote-control` (server mode).

### Como funciona a conexão

1. **Inicia localmente**: `claude remote-control` (server mode) ou `claude --remote-control` (modo interativo)
2. **Exibe URL e QR code** para conectar de outro dispositivo
3. **Backend**: Autenticação Anthropic + credenciais curtas (expiram independentemente)
4. **Roteamento**: Mensagens entre web/mobile e sua sessão local viajam pela API Anthropic

**Fonte**: [Continue local sessions from any device with Remote Control - Claude Code Docs](https://code.claude.com/docs/en/remote-control)

---

## 2. Push Notifications Móvel (Integrado ao Remote Control)

### O que é a ferramenta PushNotification

A ferramenta **`PushNotification`** (built-in no Claude Code) envia:
1. **Notificação desktop** no seu terminal local
2. **Push no celular** (se Remote Control estiver ativo)

**Requer**: Claude Code v2.1.110+ (adicionado em 16 de abril de 2026), Remote Control ativo, app Claude móvel instalado.

### Como Claude decide quando push

Claude **decide autonomamente** quando enviar:
- Quando uma tarefa longa termina
- Quando precisa sua aprovação/decisão
- Quando você explicitamente pede: *"Notifique-me quando os testes terminarem"*

**Não há** configuração por evento. O toggle de config é apenas on/off:
- `/config` → **Push when Claude decides** (proativo)
- `/config` → **Push when actions required** (apenas para aprovações)

### Setup (4 passos)

1. App Claude mobile instalado (iOS/Android)
2. Login com mesma conta claude.ai
3. Aceitar permissão de notificações do SO
4. `/config` → habilitar "Push when Claude decides" ou "Push when actions required"

### Detalhes técnicos (segurança, entrega)

- **Skips while typing**: Claude **não** empurra notificações enquanto você está digitando no terminal conectado.
- **Pode skippar com `CLAUDE_CLIENT_PRESENCE_FILE`**: Se definir a env var para um arquivo marcador, notificações são suprimidas enquanto o arquivo existe (útil: integrar com listeners de lock de tela).
- **iOS/Android gotchas**:
  - iOS: Focus modes e notification summaries podem suprimir/atrasar pushes → Verificar Settings → Notifications → Claude
  - Android: Battery optimization agressivo pode atrasar → Colocar Claude app na exceção de otimização
- **"No mobile registered"**: Se `/config` avisar, abra o app Claude no celular para refresh do token de push.

### Limitação crítica para seu caso

> Push **só funciona dentro da sessão Remote Control ativa**. Não funciona de background tasks ou scheduled tasks fora de Remote Control.

**Implicação**: Se o coletor roda como um processo pm2 separado (não dentro de Claude Code), ele **não consegue diretamente disparar a ferramenta PushNotification** de Claude.

**Fonte**: [Mobile push notifications - Claude Code Docs](https://code.claude.com/docs/en/remote-control#mobile-push-notifications)

---

## 3. Canais (Channels) — O Caminho Para Eventos Externos

Se a limitação acima é bloqueante, **Channels** é a solução.

### O que são Channels

**Channels** são **servidores MCP** que **empurram eventos** para uma sessão Claude Code aberta, disparando reações em tempo real.

- **Research preview**: Requer Claude Code v2.1.80+, autenticação claude.ai (não API key, não Console API key em algumas configs).
- **Fluxo**: Evento (ex: CI failure, msg Telegram, webhook) → Canal MCP → Sessão Claude → Claude reage

### Como funciona o push (capacidade `claude/channel`)

Um servidor MCP declara `{"capabilities": {"channel": {}}}` e Claude ativa com flag `--channels`:

```bash
claude --channels plugin:telegram@claude-plugins-official
```

Quando um evento chega, Claude o recebe como:
```xml
<channel source="telegram">
  <message sender="your-id">Hey, qual é o status do deploy?</message>
</channel>
```

Claude **lê a mensagem e reage** dentro da sessão — edita arquivos, corre testes, responde de volta.

### Canais suportados (built-in)

- **Telegram**: Bot token, pairing code, allowlist
- **Discord**: Bot token, DM pairing, allowlist
- **iMessage**: Acesso disco local (macOS), AppleScript para reply

Todos suportam **two-way**: mensagem entra, Claude responde e a resposta volta ao canal.

### Customização: Seu próprio Channel

Você **pode construir um canal personalizado** que:
1. Leia mensagens de `data/<grupo>/messages.jsonl` (seu coletor)
2. Alimente a sessão Claude com `/webhook <evento>`
3. Claude reaja (ex: resumo, análise, acionamento)

Ver [Channels reference](https://code.claude.com/docs/en/channels-reference) para spec completa.

### Segurança & controle

- Cada canal tem **allowlist de senders** (pairing code + /access policy)
- Admin controla `channelsEnabled` e `allowedChannelPlugins` (Team/Enterprise)
- Pro/Max users: Sem restrições além do que você optar com `--channels`

**Fonte**: [Push events into a running session with channels - Claude Code Docs](https://code.claude.com/docs/en/channels)

---

## 4. Hooks — Alternativa Para Notificações Locais

Se você quiser **não usar** Remote Control push, uma abordagem é **hooks** + **desktop notifications locais**.

### Como funcionam

Hooks são scripts shell que disparam em eventos da sessão:
- `SessionStart`, `SessionEnd`, `Stop`, `PreToolUse`, `PostToolUse`, `Notification`, etc.

### Exemplo: Notificação desktop local após conclusão

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/notify-completion.sh"
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# ~/.claude/hooks/notify-completion.sh

# OSC 777 para Ghostty/Warp/urxvt
seq=$(printf '\033]777;notify;Claude Code;Task completed!\007')

jq -nc --arg seq "$seq" '{terminalSequence: $seq}'
```

### Limitação: Não é "push" em tempo real

Hooks reagem a **eventos da sessão Claude** (paradas, conclusões). Eles **não** são acionados por eventos externos (msg chegando no WhatsApp).

- Se a sessão está parada/idle, hook não dispara.
- Para reação em tempo real, você precisa de Channels (MCP que empurra) ou polling.

**Fonte**: [Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)

---

## 5. Caminhos Concretos Para Seu Objetivo

### Cenário: Coletor deteta msg nova → o operador recebe notificação no celular/Claude

**Seu setup atual**:
- Coletor Node.js sob pm2 (24/7) escreve em `data/<grupo>/messages.jsonl` + atualiza `data/.collector-status.json`
- o operador quer sinal: "msg chegou no grupo X"

### Caminho A: Remote Control + Polling (Mais Simples)

**Fluxo**:
1. o operador roda `claude --remote-control` em seu projeto
2. Claude Code tem acesso a `data/<grupo>/messages.jsonl`
3. Você cria um **comando do Claude** (tipo `/watch-messages`) que:
   - Lê `data/.collector-status.json` a cada 5-10s (via `Monitor` tool ou hook)
   - Detecta mudanças → Chama `PushNotification` automaticamente
4. **Notificação aparece** no celular dele via Remote Control

**Prós**:
- Simples, usa tools nativas
- Tight feedback loop (5-10s delay)
- Mensagem fica no histórico do Claude

**Contras**:
- Requer Claude Code rodando + Remote Control ativo continuamente
- Polling consome ciclos (minor)
- Só funciona enquanto Remote Control está conectado

**Implementação sketch**:
```javascript
// Dentro de uma sessão Claude
const checkMessages = async () => {
  const status = await readJsonFile('data/.collector-status.json');
  const newMsgCount = status.newMessages || 0;
  
  if (newMsgCount > 0) {
    // Claude chama PushNotification
    // "notify me: new messages in group X"
  }
};

// Claude roda /loop ou Monitor para checar periodicamente
```

### Caminho B: Custom Channel MCP (Mais Robusto)

**Fluxo**:
1. Escrever um servidor MCP Node que:
   - Lê `data/<grupo>/messages.jsonl` a cada N segundos
   - Quando detecta mensagens novas, emite evento channel
2. o operador roda com `--channels plugin:whatsapp-monitor`
3. Claude recebe eventos de msg e reage (resumo, notificação, etc.)

**Prós**:
- Decoupled: coletor pm2 + canal MCP rodando em paralelo
- Channel pode ser reusado em múltiplas sessões Claude
- Event-driven, não polling
- Pode ter two-way (Claude responde ao coletor)

**Contras**:
- Requer escrever código MCP (TypeScript + npm)
- Setup inicial maior
- Requer Bun para plugins oficiais (ou rodar como daemon Node)

**Estrutura**:
```typescript
// whatsapp-monitor-mcp.ts
import { Server } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({
  name: "whatsapp-monitor",
  version: "1.0.0"
});

// Declara capacidade de channel
server.setRequestHandler(ListCapabilitiesRequestSchema, async () => ({
  capabilities: {
    "claude/channel": {
      // Claude irá receber events como <channel source="whatsapp-monitor">
    }
  }
}));

// Poller que emite eventos
setInterval(async () => {
  const status = await readJsonFile('data/.collector-status.json');
  if (status.newMessages > 0) {
    server.emit('message', {
      source: 'whatsapp-monitor',
      text: `New messages in ${status.groups.join(', ')}`
    });
  }
}, 5000);

server.listen();
```

**Registro**:
```bash
# ~/.claude/channels/whatsapp-monitor.json
{
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/whatsapp-monitor.js"],
  "capabilities": ["claude/channel"]
}

# Ou como plugin (instalar via marketplace)
# claude --channels plugin:whatsapp-monitor
```

### Caminho C: Webhook + Canal (Separando Responsabilidades)

**Fluxo**:
1. Coletor detecta msg → POST para `http://localhost:3001/webhook/message`
2. Servidor webhook (Express, simples) armazena em fila
3. Claude Canal MCP lê fila e emite evento
4. Claude recebe e reage

**Prós**:
- Coletor não precisa saber de Claude
- Canal é agnóstico à origem (Telegram, Discord, WhatsApp)
- Escalável

**Contras**:
- Mais componentes
- Complexidade maior

---

## 6. Limitações & Realidade

### O que **NÃO** funciona hoje

1. **API ou webhook direto de Claude Code para app móvel**: Não existe endpoint para você chamar Push Notification de fora da sessão Claude.
   - `PushNotification` tool só trabalha **dentro** de uma sessão Claude conectada.

2. **Acordar uma sessão Claude de um evento externo**: 
   - Remote Control não "escuta" eventos; você precisa estar conectado e Claude precisa estar ativo.
   - Channels empurram eventos **para uma sessão já aberta**.

3. **Persistência de push**: Push é efêmero (notificação do SO). Se o usuário não tiver o app aberto, pode perder o timing.

4. **Amazon Bedrock, Google Vertex AI, Microsoft Foundry**: Push Notifications **não são suportadas** nesses providers (só Anthropic).

### Considerações de Privacidade

⚠️ **Mensagem de cliente em push**: Se você envia o conteúdo da mensagem (ex: "João: olá o operador") no push, ela viaja por:
- Servidor Anthropic API
- Serviço push (Apple Push, Google Firebase)
- Rede do celular

**Mitigação**: Enviar apenas notificação abstrata ("Nova msg no grupo Vendas") sem conteúdo.

---

## 7. Recomendação: Caminho Proposto Para o operador

### Curto Prazo (Próximas 2 semanas) — **Caminho A: Polling com Remote Control**

**Passo 1**: Inicie Remote Control localmente
```bash
cd /caminho/para/whatsapp-automation
claude --remote-control "WhatsApp Monitor"
```

**Passo 2**: Crie um comando/skill que Claude pode chamar
```markdown
---
name: check-whatsapp-messages
description: Check for new WhatsApp group messages and push notification if found
---

Leia `data/.collector-status.json` e `data/*/messages.jsonl`. 
Se houver mensagens novas desde a última verificação, chame PushNotification com um resumo.
Loop a cada 10 segundos.
```

**Passo 3**: o operador conecta celular via Remote Control e ativa push
- Abre app Claude no celular
- Conecta a sessão (QR code)
- `/config` → habilita "Push when Claude decides"

**Passo 4**: Teste
```
@claude check new messages every 10 seconds and notify me if any arrive
```

**Tempo**: ~30 min setup, feedback em tempo real.

---

### Médio Prazo (Próximas 4-6 semanas) — **Caminho B: Custom Channel MCP**

Depois de validar que o polling funciona, **migre para uma solução de event-driven**.

**Passo 1**: Clone/crie [whatsapp-monitor-mcp](https://github.com/yourusername/whatsapp-monitor-mcp) (referência: [Telegram plugin](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/telegram))

**Passo 2**: Instale como plugin
```bash
/plugin install whatsapp-monitor@seu-marketplace
/reload-plugins
```

**Passo 3**: Execute com channel ativo
```bash
claude --channels plugin:whatsapp-monitor@seu-marketplace
```

**Passo 4**: Teste dois-way
```
@claude what messages arrived in the Vendas group?
Claude reads from channel, responds with summary, and can even forward to Telegram if you want.
```

**Tempo**: ~2-3 horas desenvolvimento + testes.

---

### Longo Prazo (Opcional) — **Integração com MCP `novidades_desde`**

Você mencionou em outro contexto uma ferramenta MCP `novidades_desde` / "wake-on-message". Esse é o **Caminho B+ : Construir um servidor MCP completo** que:

1. Expõe recursos MCP para ler mensagens
2. Declara capability `claude/channel` para push events
3. o operador conecta **uma única ferramenta MCP** que faz tudo

Isso consolida suas 9 ferramentas MCP globais e cria uma experiência unificada.

---

## 8. Checklist de Implementação

- [ ] Remote Control ativo e testado
- [ ] App Claude mobile instalado + conectado
- [ ] `/config` → push notifications habilitado
- [ ] Skill `check-whatsapp-messages` implementada
- [ ] Teste: mandar msg no grupo, verificar push em <15s
- [ ] Documentar em `CLAUDE.md` como iniciar com Remote Control
- [ ] Decidir se escala para Channel MCP ou mantém polling

---

## 9. Referências Oficiais

- **Remote Control Main Doc**: [Continue local sessions from any device with Remote Control](https://code.claude.com/docs/en/remote-control)
- **Push Notifications Setup**: [Mobile push notifications](https://code.claude.com/docs/en/remote-control#mobile-push-notifications)
- **PushNotification Tool**: [Tools reference - PushNotification](https://code.claude.com/docs/en/tools-reference) (linha "PushNotification")
- **Channels Overview**: [Push events into a running session with channels](https://code.claude.com/docs/en/channels)
- **Channels Reference (Build Custom)**: [Channels reference](https://code.claude.com/docs/en/channels-reference)
- **Hooks Guide**: [Automate actions with hooks](https://code.claude.com/docs/en/hooks-guide)
- **Oficial Channel Plugins**: [claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins) (Telegram, Discord, iMessage source code)

---

## Resumo Executivo

| Aspecto | Resposta |
|---------|----------|
| **Remote Control permite push no celular?** | Sim, via ferramenta `PushNotification` integrada. Requer Remote Control ativo. |
| **Pode "acordar" Claude de um evento externo?** | Não direto. Channels (MCP) empurram para uma sessão já aberta. |
| **Caminho mais rápido?** | Polling: Claude lê `data/.collector-status.json` periodicamente e chama `PushNotification`. Setup <1h. |
| **Caminho mais robusto (longo prazo)?** | Custom Channel MCP que emite eventos. Decoupled, event-driven, reutilizável. |
| **Privacidade?** | Mensagens viajam por Anthropic API + serviço push (Apple/Google). Recomenda: enviar notificação abstrata, não conteúdo. |
| **Limitação crítica?** | Push só funciona em sessão Remote Control ativa. Scheduled tasks / background tasks fora de Remote Control não conseguem empurrar. |

---

**Recomendação final**: Comece com **Caminho A (Polling + Remote Control)** para validação rápida de UX. Depois, se quiser escala/robustez, **migre para Caminho B (Custom Channel MCP)** — seu coletor pm2 fica separado, e o evento-driven é mais limpo.
