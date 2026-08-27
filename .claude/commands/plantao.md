---
description: Arma o plantão/monitor de mensagens do WhatsApp (SSE da nuvem) no chat indicado ou por contexto do projeto
allowed-tools: Bash, Read, Write, Edit
---

Arma um **Monitor SSE da nuvem** que acorda o agente a cada mensagem nova em um chat do WhatsApp, sem depender de coletor local.

Siga os passos exatamente como especificados na skill `plantao`:

1. **Identificar o chat/slug**:
   - Se o projeto atual tiver `.claude/whatsapp.json`, use o `grupo` (slug) cadastrado lá.
   - Senão, se um chat for informado pelo usuário, resolva o slug via API do painel (`$REPO/scripts/plantao-candidatos.sh` ou `curl $WAC_CLOUD_URL/api/groups/summary`).
   - Se houver dúvida ou múltiplos candidatos, pergunte ao usuário antes de armar.

2. **Checar se o grupo está com `watch: true` na nuvem**:
   - Se `"watch": false`, ative via `POST $WAC_CLOUD_URL/api/groups` `{"id": "<jid>", "watch": true}`.

3. **Matar monitores zumbis** antigos do mesmo chat.

4. **Armar o Monitor SSE**:
   - Execute o script `plantao-stream.sh <slug>` com `Monitor(persistent: true)`.

5. **Confirmar ao usuário** que o plantão está ativo e pronto.
