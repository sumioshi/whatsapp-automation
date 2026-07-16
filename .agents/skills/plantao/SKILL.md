---
name: plantao
description: Use quando o operador pedir para ficar de olho, monitorar ou avisar quando chegar mensagem em um chat de WhatsApp. Resolve o chat, garante a captura e usa o mecanismo de monitoramento persistente disponível no runtime do Codex.
---

# Plantão de mensagens WhatsApp no Codex

Leia completamente a skill canônica antes de agir:

`/Users/operador/projetos/empresa-sumioshi/whatsapp-automation/.claude/skills/plantao/SKILL.md`

Preserve dela:

- a descoberta e confirmação do chat;
- a resolução do slug;
- a verificação de `watch` para grupos;
- a remoção de monitores duplicados;
- o filtro de mensagens `fromMe`;
- a regra de nunca responder automaticamente.

## Adaptação de runtime

As ferramentas `Monitor`, `TaskList` e `TaskStop` citadas na skill canônica são
específicas do Claude Code. No Codex:

1. Use o mecanismo persistente de monitoramento, espera ou automação disponibilizado
   pelo produto para executar:

   ```bash
   /Users/operador/projetos/empresa-sumioshi/whatsapp-automation/scripts/plantao-stream.sh <slug>
   ```

2. Antes de criar um monitor, encerre qualquer monitor existente do mesmo chat quando
   o runtime permitir inspecioná-los.
3. Se o runtime atual não oferecer monitoramento persistente capaz de despertar o
   agente, não declare que o plantão foi armado. Explique a limitação e ofereça:
   - consultar `novidades` sob demanda; ou
   - ativar `alertar_chat` para notificar o operador no Mac.

Nunca substitua o plantão por um loop bloqueante improvisado nem envie mensagens ao chat.
