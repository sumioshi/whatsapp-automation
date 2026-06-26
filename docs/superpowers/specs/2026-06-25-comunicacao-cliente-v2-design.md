# Reescrita da skill `comunicacao-cliente` (v2) — design

**Data:** 2026-06-25
**Motivação:** A v1 queimou em produção — clientes perceberam que era IA. A skill é quase toda regra negativa ("não faça X"); evitar tells não cria voz humana. Reescrever em duas camadas, embasada em pesquisa de detecção de IA + conversa humana real (BR/WhatsApp), não em introspecção.

## Problema com a v1

1. **Só proibições.** Toda regra é "não reformular, não empilhar, não dramatizar, corta dois-pontos". Uma IA tentando não parecer IA ainda é um tell. Falta o lado positivo: como humano REALMENTE escreve.
2. **Não validada contra literatura.** Os casos ("ó" repetido, verbosity compensation) vieram de dedução, não de evidência de detecção nem de corpus real.
3. **Vaza nomes de clientes reais** (ex.: "Pedro", casos com nome). A outra IA que consome a skill repete esses nomes. Têm que virar genéricos.

## Eixos do vazamento (definidos pelo o operador)

- **Texto em si** soa de IA (palavra, ritmo, estrutura de frase mesmo curta).
- **Padrão entre mensagens** (repetição, timing perfeito, responder tudo, ritmo robótico).
- **Comportamento de conversa** (rápido demais, nunca erra, nunca manda áudio, formal demais).
- **Sanitização:** remover todos os nomes reais de cliente da skill.

## Skill alvo — duas camadas

- **Camada 1 — A voz (positivo):** quem é a pessoa que escreve. 8-10 modelos concretos de mensagem real a imitar. Uma persona a vestir, não uma lista de medos.
- **Camada 2 — Tells a evitar (rede de segurança):** a lista atual da v1, endurecida com evidência de detecção de IA.
- Pipeline (humanizer → esta camada → confirmar/enviar) e checklist mantidos, enxutos.
- Nomes de cliente → genéricos ("um cliente", "o parceiro técnico").
- Preservar as regras-duras de conteúdo que já provaram valor: não expandir escopo; cliente apontando algo ≠ cobrança; honestidade primeiro; calibragem por arquétipo.

## Método — frota de deep-research

**Fase 1 — Fan-out (8 agentes cegos entre si):**
1. Detecção de IA state-of-the-art (tells comprovados, papers 2024-2026)
2. Conversa humana BR no WhatsApp (timing, áudio, erro, fragmentação, quando NÃO responde)
3. Psicolinguística/estilometria (burstiness, comprimento de frase, distribuição)
4. Prior art de humanização (o que funciona vs. mito)
5. Pragmática de atendimento ao cliente (equilíbrio robô↔largado)
6. Anti-padrões de LLM em chat (prestatividade, concordar com tudo, sem opinião)
7. Voz/persona writing (definir uma voz consistente, técnica de character)
8. Caso BR de cliente de software/dev + levantar nomes a sanitizar

**Fase 2 — Verificação adversarial (pipeline):** cada achado relevante passa por um cético que tenta refutar (mito? evidência? contradiz outro achado?). Sobrevive o embasado.

**Fase 3 — Síntese:** um agente monta a skill v2 nas duas camadas, nomes sanitizados; um crítico de completude revisa ("que ângulo ficou de fora?").

## Critério de sucesso

A skill v2 entrega (a) uma voz positiva imitável com modelos concretos, (b) tells a evitar com evidência, (c) zero nomes reais de cliente, (d) preserva as regras-duras de conteúdo da v1. O o operador revê antes de substituir a v1.

## Fora de escopo

- Mudar o `humanizer` (camada anterior, separada).
- Mudar a `run-whatsapp-automation` ou o fluxo de envio.
- Implementar detecção automática de "isso soa de IA" no código (é skill, não pipeline).
