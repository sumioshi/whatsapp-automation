---
name: link-whatsapp
description: Liga o repositório atual a um grupo ou DM de WhatsApp (cria .claude/whatsapp.json + linha no CLAUDE.md/AGENTS.md + indexa no painel). Use quando o operador pedir pra "linkar", "vincular" ou "conectar" um repo/projeto a uma conversa de WhatsApp.
---

# Link projeto ↔ WhatsApp

Siga **exatamente** o passo a passo canônico em `.claude/commands/link-whatsapp.md` na raiz
deste repositório (`whatsapp-automation`) — ele é a fonte única do fluxo: descobrir o painel
(local → Railway), listar os chats, confirmar os campos com o operador e gravar o link.

Duas adaptações quando rodando fora do Claude Code (ex.: Codex):

1. Onde o fluxo manda escrever a linha marcada no `CLAUDE.md` do repo de destino, faça o
   MESMO upsert também no `AGENTS.md` (crie se não existir) — mesmo bloco, mesmos marcadores
   `<!-- wa-link:start -->` / `<!-- wa-link:end -->` — pra qualquer agente enxergar o vínculo.
2. Ignore instruções específicas do harness do Claude (ex.: armar a tool Monitor); o vínculo
   em si (`.claude/whatsapp.json` + linha no arquivo de instruções + índice do painel) é
   agnóstico de agente.
