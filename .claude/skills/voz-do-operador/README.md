# Voz do operador — como preencher

Esta pasta é um **molde**. Ela não descreve ninguém até você rodar a extração sobre o
seu próprio histórico e preencher os campos `{{...}}` do `SKILL.md`.

O objetivo: quando o agente escrever uma mensagem que vai pro WhatsApp em seu nome, que
ela soe como **você**, e não como um assistente educado. A diferença entre as duas
coisas é medível, e é isso que o script mede.

## Por que não basta descrever seu estilo

Se você escrever "sou informal, uso gíria, escrevo curto", o resultado vai ser uma
caricatura genérica de informalidade. Ninguém sabe de cabeça que usa vírgula em 28% das
mensagens, ou que a palavra com que mais começa mensagem representa só 4% delas.

Esses números são o que separa "informal" de **você**. E eles já estão no seu histórico.

## Passo 1 — descubra a data de corte

A data em que a automação começou a enviar mensagem por você. Tudo a partir dali é
texto de IA, e incluir isso faz o perfil aprender o próprio eco em vez do seu jeito.

Se você acabou de instalar o coletor e nunca automatizou envio, use a data de hoje.

## Passo 2 — triagem: separe pessoal de trabalho

```bash
python3 .claude/skills/voz-do-operador/extrair-voz.py \
    --data data --antes 2026-06-01 --triagem
```

Sai uma lista de chats ordenada por registro: score alto = informal/pessoal, score
baixo = trabalho. Você vai extrair **dois perfis separados**, porque quase todo mundo
escreve diferente com um amigo e com um cliente — e é o perfil de trabalho que o
atendimento usa.

Anote os slugs de cada grupo. Confie no seu julgamento, não só no score: você sabe quem
é cliente e quem é amigo.

## Passo 3 — extraia cada perfil

```bash
# perfil profissional (chats de trabalho)
python3 .claude/skills/voz-do-operador/extrair-voz.py \
    --data data --antes 2026-06-01 --chats slug-cliente-1 slug-cliente-2 ...

# perfil pessoal (chats de amigo/família)
python3 .claude/skills/voz-do-operador/extrair-voz.py \
    --data data --antes 2026-06-01 --chats slug-amigo-1 slug-amigo-2 ...
```

O relatório traz tamanho de balão, rajada, pontuação, caixa, pares de abreviação,
teto de frequência das aberturas, paleta de emoji, grafia da risada e as palavras mais
repetidas.

## Passo 4 — leia antes de escrever

**Estatística dá as proporções; ela não dá o ritmo.** Abra 30 ou 40 rajadas suas de
verdade e leia. É lendo que aparecem as coisas que nenhum contador pega: como você vira
uma frase no meio, como você discorda sem dizer não, a partícula que você usa e mais
ninguém usa.

Copie exemplos **reais** pro `SKILL.md`. Não escreva exemplos "no estilo de" — o valor
inteiro do arquivo vem de ele não ser inventado.

## Passo 5 — preencha o SKILL.md

Substitua todo `{{...}}`. Um campo deixado pela metade é pior que vazio: parece
autoridade e não é.

Duas seções merecem cuidado extra:

- **Teto de frequência.** É a regra que mais protege a voz. Se o agente usar seu
  bordão preferido em toda mensagem, ele vai estar dezenas de vezes acima da sua
  frequência real, e isso soa robô mesmo com o vocabulário certo.
- **O que não aparece no profissional.** Compare os dois perfis: o que tem contagem
  alta no pessoal e **zero** no trabalho é exatamente o que não pode vazar pro cliente.

## Passo 6 — teste com gabarito

Pegue uma conversa real e reescreva algumas mensagens suas usando a skill. Compare com
o que você realmente escreveu na época. Onde divergir, o arquivo está errado — ajuste
o arquivo, não a sua memória.

## Passo 7 — deixe o agente obrigado a usar

Instrução em prompt é lembrete; o agente pode passar reto. Este projeto traz duas
camadas mais fortes, e elas já estão configuradas:

- **`instructions` do servidor MCP** (`web/mcp/server.ts`) — carrega no início da
  sessão, antes de qualquer decisão de envio.
- **hook `PreToolUse`** (`.claude/hooks/exigir-voz.sh`) — nega a chamada das tools de
  envio quando a skill de voz não foi carregada na sessão. O agente lê o motivo,
  carrega e tenta de novo sozinho.

O hook procura a skill pelo nome. Se você renomear a sua, ajuste o `SKILL` no script.

## Privacidade

**Não versione o corpus extraído nem a sua skill preenchida.** Os dois contêm conversa
privada sua e de terceiros. Guarde a skill preenchida fora do repositório (por exemplo
em `~/.claude/skills/<sua-voz>/`), e o corpus num diretório ignorado pelo git.

Este molde é a única parte que vai pro repositório.
