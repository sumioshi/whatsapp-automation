---
description: Liga o repositório atual a um grupo ou DM de WhatsApp (cria .claude/whatsapp.json + linha no CLAUDE.md + indexa no painel)
allowed-tools: Bash, Read, Write, Edit
---

Você vai linkar o **repositório atual** (o cwd) a um grupo ou DM de WhatsApp, pra que qualquer
Claude aberto neste repo já saiba qual conversa consultar via o MCP `whatsapp-collector`.

Caminho canônico — siga nesta ordem, não improvise:

1. **Descubra o cwd absoluto** com `pwd`. Esse é o `repoPath`.

2. **Liste os chats disponíveis.** Tente primeiro o painel (traz grupos E DMs já com slug):
   `curl -s http://localhost:3000/api/links` → campo `chats` (cada um: `slug`, `name`, `messageCount`, `tipo`).
   Se o painel estiver fora, use o MCP: ferramenta `listar_grupos` (slug de DM é `dm-<id>`).
   Mostre as opções relevantes ao usuário e **pergunte qual** é a conversa deste projeto. Não adivinhe.

3. **Confirme os campos** com o usuário (curto): `cliente` (nome do cliente/projeto), `tipo`
   (`dm`, `grupo` ou `projeto`), `notas` (uma linha de contexto). Sugira o tipo a partir do slug
   (`dm-…` → `dm`).

4. **Grave o link.** Caminho preferido — POST no painel, que já escreve os dois lados de uma vez
   (`data/links.json` central + `.claude/whatsapp.json` + linha no `CLAUDE.md` do repo):
   ```bash
   curl -s -X POST http://localhost:3000/api/links \
     -H 'Content-Type: application/json' \
     -d '{"slug":"<slug>","repoPath":"<pwd>","cliente":"<cliente>","tipo":"<tipo>","notas":"<notas>"}'
   ```
   Confira a resposta (deve voltar `links` com a entrada).

5. **Fallback se o painel estiver fora** (o curl falhar): faça o lado do repo você mesmo, pra não
   deixar o usuário na mão —
   - Escreva `<pwd>/.claude/whatsapp.json` com `{ "grupo": "<slug>", "cliente": "<cliente>", "tipo": "<tipo>", "notas": "<notas>" }`.
   - No `<pwd>/CLAUDE.md` (crie se não existir), faça upsert do bloco entre os marcadores
     `<!-- wa-link:start -->` e `<!-- wa-link:end -->`, com uma linha tipo:
     "WhatsApp deste projeto: `<slug>` (<cliente>). Consulte o histórico via MCP `whatsapp-collector`
     usando esse slug. Pra acompanhar ativamente, use `acompanhar_chat`. Detalhes em `.claude/whatsapp.json`."
   - Avise o usuário: o índice central (painel) **não** foi atualizado; rode o painel e re-rode
     `/link-whatsapp` depois pra indexar o lado WhatsApp→repo.

6. **Confirme ao usuário** o que foi gravado (slug, repoPath, e se o central foi indexado ou ficou pendente).

Regra: este comando só **cria/atualiza** o link. Não envie mensagem, não mexa em outra config.
