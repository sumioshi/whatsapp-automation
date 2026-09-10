---
name: plantao
description: Use quando o operador pedir pra "ficar de olho", "monitorar", "me avisa/me acorda quando chegar mensagem" num chat de WhatsApp — em qualquer sessão, de qualquer diretório. Também quando um monitor de WhatsApp já armado está mudo/não dispara.
---

# Plantão de mensagens WhatsApp

## Overview

Arma **UM** Monitor persistente do harness que acorda o agente a cada mensagem nova de um chat,
via **SSE da nuvem** — funciona com o Mac "limpo" (não precisa de coletor local, `npm run dev`,
pm2 nem sync). O coletor 24/7 é o da nuvem (Railway); o Mac só segura uma conexão HTTP.

REPO = raiz do repo whatsapp-automation. Use paths ABSOLUTOS (a sessão pode estar em outro
diretório). Se não souber onde o repo está, descubra pelo symlink desta skill:
```bash
REPO="$(dirname "$(dirname "$(dirname "$(readlink -f ~/.claude/skills/plantao)")")")"
```

## Passos

**0. Se o pedido NÃO nomeia o chat** ("fica de olho no whatsapp", "arma um plantão aí") **ou o
nome é ambíguo**, descubra por contexto — NUNCA escolha sozinho:
- Repo linkado? Se existir `.claude/whatsapp.json` no projeto atual, o chat é o de lá (use o slug
  e pule pro passo 2).
- Senão, derive tokens do projeto (nome da pasta do cwd, `"name"` do package.json) e ranqueie os
  chats parecidos: `$REPO/scripts/plantao-candidatos.sh <tokens>` (sem tokens = mais ativos).
- Monte um `AskUserQuestion` com os até 4 candidatos como opções (label = nome do chat) — quem
  quiser outro usa o "Other" (digita o nome, resolva pelo passo 1).

**1. Resolver o slug** (nome do chat → slug):
```bash
cd $REPO && set -a && . ./.env; set +a
curl -s -u "$WAC_CLOUD_USER:$WAC_CLOUD_PASS" "$WAC_CLOUD_URL/api/groups/summary" \
  | python3 -c 'import sys,json
for g in json.load(sys.stdin):
    if "NOME_BUSCADO".lower() in (str(g.get("name",""))+g.get("slug","")).lower():
        print(g["slug"],"|",g["name"])'
```

**2. Checar a CAPTURA do grupo (pegadinha de grupo novo/recém-criado):** grupo novo nasce com
`watch: false` na nuvem — o monitor ficaria armado mas **surdo pra sempre**. Cheque em
`GET /api/groups` (procure o chat pelo nome). Atenção: esse endpoint traz `id`/`name`/`watch`
mas **NÃO traz `slug`** — slug vem só do `/api/groups/summary` (passo 1); não tente tirar daqui.
Se `"watch": false`, ligue:
```bash
curl -s -u "$WAC_CLOUD_USER:$WAC_CLOUD_PASS" -X POST -H "content-type: application/json" \
  -d '{"id":"<jid do grupo>","watch":true}' "$WAC_CLOUD_URL/api/groups"
```
(O coletor da nuvem tem hot-reload do config — vale na hora, sem restart.)

**3. Matar monitor zumbi:** `TaskList` → `TaskStop` em qualquer Monitor antigo do MESMO chat.
Armar sem matar o antigo = disparo em duplicata/triplicata.

**4. Armar o Monitor** (o script encapsula SSE + reconexão com retomada + lock + filtro):
```
Monitor(persistent: true, description: "Plantão SSE em <slug>[, <slug2>...]", command:
  $REPO/scripts/plantao-stream.sh <slug> [<slug2> ...])
```
($REPO expandido pro path absoluto real — o Monitor não herda variáveis da sua sessão.)
Vários chats = UM Monitor com vários slugs (uma conexão só; a linha vem com `[slug]` na frente).
`--alertar` no lugar dos slugs acompanha todos os chats com `alertar` ligado na triagem.
**Coletor PESSOAL** (o 2º container, WhatsApp pessoal do operador): prefixe `PLANTAO_CLOUD=pessoal`
no command (`PLANTAO_CLOUD=pessoal $REPO/scripts/plantao-stream.sh <slug>`); o script usa o trio
`WAC_PESSOAL_*` do arquivo de ambiente da raiz. Slugs do pessoal vêm do MCP `whatsapp-pessoal`
(`listar_grupos` lá), não do principal — são contas diferentes.
Se o Monitor morrer na hora com código 3 e "plantão já ativo", já existe plantão desse
conjunto nesta máquina (outra sessão ou zumbi) — não é erro do script; ache e mate o antigo.

**5. Confirmar pro operador:** plantão armado; o que o próprio agente/MCP manda não dispara;
resposta manual dele (celular/web) dispara como contexto.

## Quando o monitor disparar

Cada linha é um evento, e o prefixo diz quem escreveu:
- `Fulano: texto` — mensagem recebida. Se precisar de contexto/mídia, use as tools MCP
  (`ler_mensagens` etc.). **Não responda no grupo por conta própria** — o pedido foi "me avisa";
  respeite o modo do chat (`confirmar` é o default).
- `Você (celular): texto` / `Você (web): texto` — o OPERADOR respondeu na mão. Absorva como
  contexto (ele já cuidou daquilo; não repita, não responda por cima, não avise que viu). Só
  fale se o que ele escreveu contradiz algo que você sabe do projeto.
- `IA da Meta (sua conta): texto` — resposta automática da Meta em nome da conta. Trate como
  contexto e avise o operador se ela prometeu algo errado.
- O que o próprio agente/MCP/painel mandou NÃO aparece (o servidor oculta `origem: coletor`).

Conexão que cai (deploy, wifi) reconecta sozinha e retoma de onde parou — nada se perde no
buraco (teto de 200 mensagens por chat; acima disso o servidor avisa que truncou).

## Erros comuns

- **Receita antiga (`tail -F` no `data/<slug>/messages.jsonl` local):** só funciona com o coletor
  LOCAL rodando (`npm run dev`). Com o Mac limpo o arquivo não cresce e o monitor fica MUDO.
  Use sempre o script da nuvem (passo 4); a receita local é só pra quando o dev está de pé.
- **Pular o passo 2:** monitor armado num grupo com `watch: false` nunca dispara.
- **Monitor mudo depois de renomearem o grupo:** o slug é estável por jid (não muda com o
  nome), então o plantão continua válido — mas se o monitor foi armado ANTES da era do slug
  estável num slug derivado do nome antigo/novo errado, re-resolva o slug no passo 1
  (`listar_grupos` traz `renomeados`) e rearme.
- **Checar pm2/coletor local como pré-requisito:** não é — nada roda no boot do Mac por decisão
  do operador, e o plantão via nuvem não precisa de processo local nenhum.
