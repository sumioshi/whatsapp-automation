---
description: Liga o repositório atual a um grupo ou DM de WhatsApp (cria .claude/whatsapp.json + linha no CLAUDE.md + indexa no painel)
allowed-tools: Bash, Read, Write, Edit
---

Você vai linkar o **repositório atual** (o cwd) a um grupo ou DM de WhatsApp, pra que qualquer
Claude aberto neste repo já saiba qual conversa consultar via o MCP `whatsapp-collector`.

Caminho canônico — siga nesta ordem, não improvise:

1. **Descubra o cwd absoluto** com `pwd`. Esse é o `repoPath`.

   Descubra também o repositório no GitHub: `git remote get-url origin` → converta pra
   `owner/repo` (aceita `git@github.com:owner/repo.git`, `git@github.com-alias:owner/repo.git`
   e `https://github.com/owner/repo.git`). Se não houver remoto, `github` fica vazio e o
   agente de triagem não roda pra este chat até existir.

2. **Descubra o painel (híbrido: local → Railway).** Nunca hardcode URL nem credenciais — descubra
   em runtime, nesta ordem:
   - **Local:** `curl -s --max-time 3 http://localhost:3000/api/links`. Se responder JSON, use
     `PANEL=http://localhost:3000` sem auth.
   - **Railway (se o local estiver fora):** use o MCP `railway` — `list_projects`, ache o projeto
     do coletor de WhatsApp (ex.: `whatsapp-collector`), depois `list_services` e `list_variables`
     do serviço do painel/coletor. Das variáveis, tire:
     `RAILWAY_PUBLIC_DOMAIN` (→ `PANEL=https://<domínio>`) e `PANEL_USER`/`PANEL_PASS`
     (→ `curl -u "$PANEL_USER:$PANEL_PASS"` em toda chamada).
   - Se nenhum dos dois responder, pule direto pro fallback do passo 6 (lado do repo apenas).

3. **Liste os chats disponíveis.** `curl -s [auth] $PANEL/api/links` → campo `chats` (cada um:
   `slug`, `name`, `messageCount`, `tipo`). Se a lista for grande, filtre por termos do projeto.
   Se o chat esperado **não aparecer**, provavelmente está sem watch no coletor — ative com
   `curl -s [auth] -X POST $PANEL/api/groups -H 'Content-Type: application/json' -d '{"id":"<jid>","watch":true}'`
   (o JID sai do MCP `listar_grupos`); a coleta começa dali pra frente e o slug segue o padrão
   kebab-case do nome. Mostre as opções relevantes ao usuário e **pergunte qual** é a conversa
   deste projeto. Não adivinhe.

4. **Confirme os campos** com o usuário (curto): `cliente` (nome do cliente/projeto), `tipo`
   (`dm`, `grupo` ou `projeto`), `notas` (uma linha de contexto). Sugira o tipo a partir do slug
   (`dm-…` → `dm`).

5. **Grave o link.** Caminho preferido — POST no painel, que já escreve os dois lados de uma vez
   (`data/links.json` central + `.claude/whatsapp.json` + linha no `CLAUDE.md` do repo):
   ```bash
   curl -s [auth] -X POST $PANEL/api/links \
     -H 'Content-Type: application/json' \
     -d '{"slug":"<slug>","repoPath":"<pwd>","cliente":"<cliente>","tipo":"<tipo>","notas":"<notas>","github":"<owner/repo>"}'
   ```
   Confira a resposta (deve voltar `links` com a entrada).

   ⚠️ **Painel em outra máquina (nuvem):** o `repoPath` é validado no filesystem **do
   servidor**, então um caminho local é rejeitado com `"repoPath não existe"`. Isso NÃO
   quer dizer que o índice ficou indisponível — só que o servidor não alcança o seu repo.
   Faça o lado do repo você mesmo (passo 6) e repita o POST com `"indexOnly": true`:
   ```bash
   curl -s [auth] -X POST $PANEL/api/links \
     -H 'Content-Type: application/json' \
     -d '{"slug":"<slug>","repoPath":"<pwd>","cliente":"<cliente>","tipo":"<tipo>","notas":"<notas>","github":"<owner/repo>","indexOnly":true}'
   ```
   Assim o índice central fica completo e nada fica pendente.

6. **Lado do repo (sempre que o painel não alcançar seu filesystem, e no fallback de
   painel fora):** faça você mesmo —
   - Escreva `<pwd>/.claude/whatsapp.json` com `{ "grupo": "<slug>", "cliente": "<cliente>", "tipo": "<tipo>", "notas": "<notas>", "github": "<owner/repo>" }`.
   - No `<pwd>/CLAUDE.md` (crie se não existir), faça upsert do bloco entre os marcadores
     `<!-- wa-link:start -->` e `<!-- wa-link:end -->`, com uma linha tipo:
     "WhatsApp deste projeto: `<slug>` (<cliente>). Consulte o histórico via MCP `whatsapp-collector`
     usando esse slug. 'Teve mensagem nova?': `caixa_de_entrada` com `grupos: ["<slug>"]` (barato;
     `ler_mensagens` só pra ler a conversa). Pra acompanhar ativamente, use `/plantao`. Detalhes em `.claude/whatsapp.json`."
   - Avise o usuário: o índice central (painel) **não** foi atualizado e por quê (fora do ar, ou
     validação de `repoPath` do painel na nuvem).

7. **Confirme ao usuário** o que foi gravado (slug, repoPath, painel usado — local ou Railway — e
   se o central foi indexado ou ficou pendente).

Regra: este comando só **cria/atualiza** o link. Não envie mensagem, não mexa em outra config.
