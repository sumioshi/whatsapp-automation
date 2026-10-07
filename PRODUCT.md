# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Operador (dono):** dono de uma agência de software que atende os clientes pelo WhatsApp da
  própria empresa. Usa o painel o dia todo no computador e também no celular, para responder rápido
  fora da mesa. Lê conversas, responde, acompanha quem está esperando, contratos, entregas e agenda.
- **Atendentes (equipe):** funcionários com login próprio, só no computador. Entram em
  `/atendimento` e só enxergam os chats que o operador liberou. Respondem como se fossem o operador.
- **Agente de IA:** não usa a interface, mas o que ele faz aparece nela (rascunhos, envios com
  latência humana, triagem). A interface precisa deixar claro quem fez o quê.

## Product Purpose

Juntar num lugar só todos os grupos e conversas de clientes do WhatsApp da empresa (cerca de 200),
mostrar o que precisa de resposta e há quanto tempo, e deixar o operador, a equipe e a IA
responderem sem perder contexto. Sucesso: nenhum cliente esquecido sem resposta, menos tempo
caçando conversa, e o operador vendo de relance quem está ativo demais para o contrato, quem renova
e o que foi entregue.

## Positioning

Não é um CRM genérico nem um WhatsApp Web com outra pele: é a mesa de operação de uma pessoa que
vende e entrega software pelo WhatsApp, com o histórico completo na nuvem, IA que escreve na voz
dele e com ritmo humano, e equipe com acesso recortado por chat.

## Operating Context

- Conversas de grupo e DMs de clientes, com texto, áudio (com transcrição), imagem, vídeo,
  documentos, reações, citações e enquetes.
- Quem enviou importa: cliente, operador pelo celular, operador pelo painel, atendente pelo
  painel, IA da Meta, agente.
- Fila de "aguardando resposta" por tempo de espera; etiquetas por chat; notas e memória por
  cliente; contrato e entregas por cliente; agenda Google sincronizada.
- Uso intenso de teclado (paleta de comandos, j/k, atalhos).

## Capabilities and Constraints

- Next.js 16 (App Router) + React 19 + Tailwind; tema claro e escuro; PWA instalável.
- Interface toda em pt-BR.
- Telas: barra lateral com navegação e lista de conversas, conversa + painel de contexto
  (contexto, notas, contrato, copiloto IA), caixa de entrada/triagem, clientes (grade e kanban),
  dashboard (totais, sinais, entregas, tabela por cliente), agenda semanal, equipe, links de
  projeto, nova conversa, configurações, login, área restrita da equipe.
- Hoje não há layout mobile; o operador quer usar no celular, a equipe não.
- Nomes de conceito estão misturados hoje (conversa, grupo, cliente, contato) e precisam de um
  vocabulário único.
- Decisão do operador: **cards em tamanhos padronizados e reutilizáveis**, um conjunto pequeno de
  formatos repetidos pelo app, para não multiplicar código de componente.
- Em aberto: nome próprio do produto (o operador pediu proposta).

## Evidence on Hand

- Dados reais existem no coletor, mas nomes e números de clientes são privados: protótipos e
  código usam dados de exemplo genéricos, nunca clientes reais.

## Product Principles

1. O que precisa de resposta aparece primeiro, com tempo de espera visível.
2. Quem fez o quê nunca é ambíguo (cliente, operador, equipe, IA).
3. Densidade com calma: muita informação, pouco ruído, tudo operável pelo teclado.
4. Um vocabulário só e um conjunto pequeno de peças reutilizáveis em todas as telas.
5. O operador decide: a IA sugere e entrega no ritmo dele, nunca por cima dele.
