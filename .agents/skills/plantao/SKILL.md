---
name: plantao
description: Use quando o operador pedir para ficar de olho, monitorar ou avisar quando chegar mensagem em um chat de WhatsApp. Resolve o chat, garante a captura e usa o mecanismo de monitoramento persistente disponível no runtime.
---

# Plantão de mensagens WhatsApp (adaptador de runtime)

Leia completamente a skill canônica antes de agir:

`<raiz-do-repo>/.claude/skills/plantao/SKILL.md` (path relativo: `../../.claude/skills/plantao/SKILL.md`)

Preserve dela:

- a descoberta e confirmação do chat;
- a resolução do slug;
- a verificação de `watch` para grupos;
- a remoção de monitores duplicados;
- o filtro de mensagens `fromMe`;
- a regra de nunca responder automaticamente.

## Adaptação de runtime

As ferramentas `Monitor`, `TaskList` e `TaskStop` citadas na skill canônica são específicas do
Claude Code. O equivalente muda por runtime:

| Runtime | Armar | Inspecionar | Encerrar |
|---|---|---|---|
| Claude Code | `Monitor(persistent: true, command: …)` | `TaskList` | `TaskStop` |
| Qwen Code | `monitor(command: …, idle_timeout_ms: 600000, max_events: 10000)` | `list_agents` | `task_stop` |
| Outros | o mecanismo persistente de monitoramento/automação do produto | — | — |

Em todos, o comando vigiado é o mesmo:

```bash
<raiz-do-repo>/scripts/plantao-stream.sh <slug>
```

**Limite do Qwen Code (importante):** o `monitor` para sozinho após `idle_timeout_ms` sem saída
(teto 600000 ms = 10 min) ou `max_events` eventos. Chat quieto derruba o plantão — então, pra
vigília longa, prefira `/loop` ou `cron_create` chamando `novidades` em intervalo, e diga ao
operador qual dos dois você armou. Nunca declare plantão armado com o `monitor` prometendo horas.

Antes de armar, encerre o monitor anterior do mesmo chat (zumbi duplica resposta). Se o runtime não
oferecer monitoramento persistente capaz de despertar o agente, não declare que o plantão foi
armado: explique a limitação e ofereça `novidades` sob demanda ou `alertar_chat` (notificação no Mac).

Nunca substitua o plantão por um loop bloqueante improvisado nem envie mensagens ao chat.
