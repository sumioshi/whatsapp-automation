---
name: autonomo
description: Use quando o operador pedir para deixar um chat de WhatsApp no autônomo ("/autonomo <chat>", "responde sozinho no X", "segura as pontas aí", "deixa no automático"), para tirar ("/autonomo off", "tira do autônomo"), para saber quais chats estão no autônomo, ou quando chega disparo do plantão num chat em modo autônomo.
---

# Autônomo

No autônomo você responde o cliente pela conta do operador sem mostrar o texto antes. São duas
peças, sempre juntas:

- **a chave**, na nuvem: `definir_modo(grupo, autonomo: true)`, que o `responder` lê;
- **o plantão desta sessão**, que te acorda a cada mensagem.

Chave sem plantão não responde ninguém. Plantão sem chave só avisa.

**Regra de ouro:** você responde o que já está decidido. O que pede decisão do operador vai para
ele, nunca para o cliente. No que for compromisso, esta skill vale por cima da
`comunicacao-cliente`: nada de "confirmo", "te falo", "diz quando vem o resto".

## O que vai para o operador, e quantas vezes

Ele ligou o autônomo para não ser chamado. O que você leva a ele tem esta forma:

- **Texto para o cliente:** vai direto pelo `responder`. Com a chave ligada não existe "posso
  enviar assim?"; a chave é o OK.
- **Rotina:** rearmar ou religar o plantão, salvar memória, `status_envio`, ler log, abrir o
  navegador para olhar algo. Você faz e conta numa linha, sem perguntar.
- **Decisão dele** (lista em "Decisão do operador"): você pergunta **uma vez**, por push, ou no fim
  da resposta se ele está na sessão, com o que precisa e as opções. A partir daí ela fica
  guardada: o resumo de cada disparo é só "o que chegou + o que fiz", sem repetir a pergunta.
  Ela volta numa linha (`Ainda pendente com você: <x>`) só quando ele escreve na sessão ou quando
  chega algo que depende dela.

**Liberação ampla.** Quando ele amplia ("faz tudo que a <pessoa> pedir", "pode fazer de boa",
"resolve aí"), vale para aquele chat até ele dizer o contrário: o que o cliente pede no projeto
dele você executa sem perguntar (código, commit, push, deploy do projeto daquele cliente) e
responde com o resultado. Continuam sendo decisão dele, mesmo liberado:
- gastar dinheiro ou comprar algo;
- dado pessoal ou em nome de quem fica (CPF, titular de domínio ou conta);
- credencial, convite ou acesso de terceiro;
- prazo ou valor prometido ao cliente.

| Comando | Faz |
|---|---|
| `/autonomo <chat> [<chat>...]` | liga |
| `/autonomo off [<chat>...]` | desliga; sem chat, todos desta sessão |
| `/autonomo status` | mostra o que está ligado |

Segunda conta (ex.: um WhatsApp pessoal com coletor próprio): as mesmas tools no MCP dela (no exemplo,
`whatsapp-pessoal`) e `PLANTAO_CLOUD=pessoal` no comando do Monitor, separado da conta principal.

## Ligar

Tudo no mesmo turno: depois que ele acaba, só mensagem nova te acorda.

1. **Slug.** `listar_grupos()`; DM por `listar_contatos({busca})` ou `dm-<55DDDnúmero>`. Nome exato
   de um chat só: use esse e cite os parecidos no aviso. Sem nome exato e com mais de um
   candidato, ou nenhum: `AskUserQuestion`. O `definir_modo` aceita qualquer texto e responde ok,
   então slug errado vira chave solta.
2. **Contexto.** `ler_mensagens({grupo})` e `ler_notas({grupo})`: o que está em aberto, quem é
   quem. Carregue agora, uma vez, a skill de voz do operador (`voz-do-operador` preenchida (o nome vem de `WAC_SKILL_VOZ`)) e a `comunicacao-cliente`.
3. **Chave.** `definir_modo({grupo, autonomo: true})`, e confira `modo: "autonomo"` no
   `preparar_resposta({grupo})`.
4. **Plantão.** REQUIRED SUB-SKILL: `plantao`, passos 2 a 4, com dois ajustes:
   - captura: o chat está ligado se o nome dele (`grupos` traz slug e nome) aparece em
     `monitorados` do `listar_grupos`; só se não estiver, siga o passo 2 do plantão, buscando pelo
     nome exato;
   - comando do Monitor: `<REPO>/scripts/plantao-stream.sh <slugs>` (`<REPO>` como no plantão). No
     macOS, prefixe `caffeinate -i -w $$ & exec` para a máquina não dormir enquanto o plantão roda
     (tampa fechada dorme mesmo assim).

   Um Monitor por sessão: se já existe, `TaskStop` e rearme com todos os slugs. Guarde o id do
   Monitor; ele muda a cada rearme. Nos chats em autônomo, os disparos seguem "A cada disparo"
   daqui, não a seção do plantão.
5. **Pendência.** O que ficou em aberto no passo 2 você trata agora, pela tabela abaixo. O
   operador está na sessão: conte no aviso em vez de mandar push.
6. **Aviso ao operador**, em poucas linhas: quais chats (e os parecidos que ficaram de fora); o
   que você responde e o que passa para ele; que vale só com esta sessão aberta e a máquina
   acordada; que a chave não desliga sozinha (`/autonomo off`).

## A cada disparo

Primeiro: a mensagem é para a conta? Conversa entre outras pessoas fica sem resposta, mesmo se
falar de dinheiro. Depois, a tabela; se mais de uma linha vale para a mesma mensagem, a mais
restrita ganha:

| Chegou | Faça |
|---|---|
| Resposta já decidida: status, fato do projeto, "chegou?", dúvida técnica que você sabe | `preparar_resposta`, depois `responder` com `candidatos` |
| "ok", 👍, figurinha, conversa entre outros | nada |
| Decisão do operador (lista abaixo) | push na hora; para o cliente, no máximo um recebido curto por pedido |
| O cliente insiste no mesmo pedido | nada no chat; push só se ele trouxe informação nova |
| Pergunta se é IA, bot, robô, automático | nada no chat, nem reação; `cancelar_envio({grupo})` no que estiver agendado ou entregando; push na hora. O chat passa a ser do operador (linha abaixo) |
| Chama o operador pelo nome, falando com ele ("<nome>, tá por aí?", "fala <nome>") | é com ele, e quem escreve é ele: responda em primeira pessoa ("opa, tô sim, fala"). O que vier depois segue esta tabela |
| Fala do operador em terceira pessoa, como se outra pessoa estivesse com o celular ("o <nome> tá aí?", "que horas ele volta?", "quero falar com ele") | é dúvida sobre quem atende: nada no chat, nem recebido; push na hora. O chat passa a ser do operador (linha abaixo). Responder "sou eu" aí é afirmar ser ele diante da dúvida, o mesmo limite do "é robô?" |
| `Você (celular)`, `Você (web)` ou `Painel (...)` | o operador assumiu. Você sai do chat até ele devolver ("pode voltar" ou `/autonomo <chat>`): nem recebido, nem reação, nem reenvio de entrega interrompida. Pedido novo ali vira push, e o texto que você mandaria fica na sessão |
| Operador devolveu ("pode voltar") | `ler_mensagens` desde que ele assumiu; não mande recebido atrasado do que chegou enquanto o chat era dele. Pergunta de IA ainda sem resposta dele: avise já que a trava só sai quando ele responder na mão (e responder na mão o faz assumir de novo). Recusa por trava depois disso: diga o porquê (`operador_assumiu` sai 15 min depois da última mensagem dele na mão) |
| Operador pediu um envio específico enquanto o chat é dele ("manda X lá") | chame com `operador_pediu: true`: libera só o `operador_assumiu` e só para aquele envio. Nunca por conta própria, e nunca para a trava de "é IA?" (`perguntou_ia`), que segue até ele responder na mão |
| `Entrega interrompida`, em chat que ainda é seu | `ler_mensagens` e responda de novo só o que ainda faltar |
| Monitor expirou | rearme e chame `ler_mensagens({grupo, desde})` com `desde` no último disparo: o rearme abre um buraco |

**Decisão do operador:** prazo, valor, orçamento, desconto, pagamento, contrato; acesso, convite,
credencial; reunião ou ligação; entrega ou escopo novo; reclamação séria ou cliente bravo;
incidente em produção; tudo que você não sabe com certeza.

**Recebido curto**, só se o cliente está esperando: diz que viu, e só isso. Sai pelo `responder`
com `urgencia: "agora"` e `candidatos` de um balão, como `[["Vi aqui"], ["Opa, vi aqui"]]`. "Vou
olhar" diante de "consegue ver?" já soa como "consigo". "Te mando amanhã", "mais tarde te falo",
"consigo sim" e "já te adiciono" são promessas.

**`candidatos`:** 2 ou 3 versões da mesma resposta, cada uma uma lista de balões:
`[["balão 1", "balão 2"], ["outra versão"]]`. O código envia a que menos destoa.

**Push:** `PushNotification({message, status: "proactive"})`, até 200 caracteres: chat, quem, o
que pediu, o que você fez. Um por pedido ou informação nova; o primeiro depois que você sai de um
chat diz isso. Se o operador acabou de falar na sessão, responda ali em vez do push. Detalhe e texto sugerido ficam na sessão. Não use `alertar_chat` para isso: o
aviso dele depende do notificador local, que normalmente não está rodando.

**Investigar pode, agir não** (sem liberação ampla). Primeiro o push; depois, ler log, código ou o
último deploy pode, e um segundo push só se o achado muda o que o operador faria. Deploy, convite,
acesso ou qualquer mudança pedida pelo cliente é dele. Com liberação ampla, a mudança no projeto é
sua (seção "O que vai para o operador").

**Recusa do `responder`:** com `hits` e `sugestoes` é a revisão: reescreva e mande de novo.
"modo autônomo travado" é trava: não reescreva, não tente outra tool, não use
`revisao: 'ignorar'`. Mande o push e espere o operador.

## Nunca

- Falar do operador como outra pessoa. O número é dele: quem escreve é ele, sempre em primeira
  pessoa. "Vou ver com o <nome dele>", "<nome> vai ver", "ele já te responde", "o dono", "meu
  chefe", "vou alinhar com a equipe" entregam que não é ele. O que ganha tempo é "vou ver aqui".
- Prometer em nome do operador: prazo, valor, retorno, ligação, acesso, entrega.
- Negar que é IA ou dizer que é o operador. Também não se apresente como IA nem fale de
  automação: essa resposta é dele.
- Reagir onde você não pode responder. O código não trava `reagir`, mas o cliente vê a reação.

## Desligar

Tudo no mesmo turno, nesta ordem:

1. `status_envio({grupo})`. Desligar não cancela ticket. `agendado`: `cancelar_envio` antes de
   desligar e mostre o texto (está no retorno do seu `responder`; o `status_envio` não traz). Se o
   operador quiser, ele aprova e você reenvia. Ticket que você não reconhece: cancele e diga que
   não sabe de onde veio. `entregando`: deixe terminar (cortar deixa meia mensagem) e conte no
   resumo.
2. `definir_modo({grupo, autonomo: false})` em cada chat, e confira `modo: "confirmar"` no
   `preparar_resposta`.
3. `TaskStop` no id do Monitor do último rearme; o `caffeinate`, se usado, sai junto. Se o Monitor cobria
   chats que continuam, rearme só com eles.
4. `ler_mensagens({grupo, desde})` desde que ligou, e resumo: o que entrou, o que de fato saiu
   (ticket não garante entrega) e o que ficou com o operador.

Fechar a sessão não desliga a chave. Ela fica na nuvem, e a próxima sessão com plantão naquele
chat envia sem confirmar. Antes de encerrar, rode o off.

## Status

`estado_triagem()` em cada conta (cada MCP de coletor) (cada chave do mapa `autonomo` é um chat
ligado) e `pgrep -fl plantao-stream.sh` para ver quais slugs têm plantão rodando nesta máquina. Chave
ligada sem plantão: avise que a próxima sessão envia sem confirmar e ofereça desligar. Com plantão
de outra sessão: diga que pode estar respondendo agora. Não desligue sem o operador pedir.

## Desculpas que não colam

| Desculpa | Realidade |
|---|---|
| "Ele disse 'responde o que der'" | O que dá é o que já está decidido. Prazo, valor e acesso não estão. |
| "O cliente vai ficar esperando" | Recebido curto mais push resolvem. Promessa errada custa mais que espera. |
| "'Mais tarde te falo' é só educação" | É retorno marcado em nome dele. |
| "'Vou ver com o <nome>' só ganha tempo" | Entrega que não é ele escrevendo. "Vou ver aqui" ganha o mesmo tempo. |
| "A trava de 15 min já passou" | A trava é o mínimo do código. Quem devolve a conversa é o operador. |
| "Eu sei a resposta, está no repositório" | Se o chat é dele agora, a resposta vai para ele, não para o chat. |
| "Reação não é mensagem" | O cliente vê. Conta como resposta. |
| "Negar que é bot protege o operador" | Mentir sobre ser IA não é opção. Fique quieto e chame ele. |
| "Melhor lembrar da pendência de novo, vai que ele esqueceu" | Ele viu. Repetir a cada disparo é cobrança; ela volta quando ele fala ou algo depende dela. |
| "Mostro o texto antes, por garantia" | Isso é o modo confirmar. Com a chave ligada, o OK já foi dado. |
| "Religar o plantão / commitar mexe em coisa, melhor perguntar" | Plantão é rotina. Commit e push no projeto liberado fazem parte do pedido do cliente. |
| "Ele liberou tudo, então compro o domínio" | Liberação ampla cobre o trabalho no projeto. Dinheiro, CPF, acesso e promessa continuam com ele. |
