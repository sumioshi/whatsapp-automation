---
name: agenda-radar
description: Passada diária — cria lembretes de follow-up (radar de sem-resposta) e eventos de reuniões combinadas nos chats, no Google Calendar do operador.
---

# Agenda do radar

Rodar 1x/dia (cron da manhã) ou sob demanda via /agenda-radar. Requer a sessão
com Google Calendar conectado e o MCP whatsapp-collector.

## Passo 1 — follow-ups de sem-resposta

1. Carregar as variáveis de ambiente da raiz do repo (trio `WAC_CLOUD_*`);
   `GET $WAC_CLOUD_URL/api/radar` com Basic `$WAC_CLOUD_USER:$WAC_CLOUD_PASS`.
2. Para cada pendência com `horas >= 12`: criar lembrete no Google Calendar de
   HOJE, 09:00–09:15, título `Responder <nome>`, descrição com o slug e a
   espera. Incluir `extendedProperties.private = { radarSlug: <slug>,
   radarDia: <YYYY-MM-DD> }` se a API da sessão aceitar.
3. DEDUP OBRIGATÓRIO: antes de criar, listar os eventos de HOJE e pular
   qualquer pendência que já tenha evento com o mesmo radarSlug (ou, sem
   extendedProperties, mesmo título "Responder <nome>"). Rodar a skill 2x no
   mesmo dia NÃO pode duplicar nada.
4. Teto: no máximo 10 lembretes por dia (os de maior espera primeiro); o resto
   fica só no painel.

## Passo 2 — reuniões combinadas nos chats

1. `listar_grupos` → chats com atividade nas últimas 24h; ignorar silenciados.
2. Para cada um, `ler_mensagens` das últimas 24h e procurar compromisso
   AGENDADO entre as partes (data+hora explícitas ou dedutíveis: "amanhã
   14:30", "quinta às 10"). Proposta vaga ("bora marcar?") NÃO conta.
3. Para cada compromisso: conferir se já existe evento no horário com o mesmo
   assunto; se não, criar `[radar] <descrição> — <chat>` na data/hora deduzida
   (30 min default).
4. Em dúvida sobre data/hora, NÃO criar — listar como "incerto" no resumo.

## Passo 3 — resumo

Se criou QUALQUER coisa (ou achou incertos): mandar UMA mensagem no chat
"você mesmo" do operador (MCP `responder` pro próprio número) com o resumo:
lembretes criados, eventos detectados, incertos. Se não criou nada, não manda.

## Regras duras

- NUNCA criar evento em agenda que não seja a principal do operador.
- NUNCA mandar mensagem pra cliente — o único destinatário é o self-chat.
- Nunca apagar/editar eventos existentes — só criar.
