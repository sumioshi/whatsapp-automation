---
title: Como conectar o WhatsApp ao Claude Code com MCP
description: Passo a passo para conectar o WhatsApp ao Claude Code, ao Codex ou a qualquer cliente MCP com o servidor de código aberto do WACrew, com cuidados de envio.
slug: whatsapp-mcp-claude-code
date: 2026-11-13
updated: 2026-11-13
keyword: WhatsApp MCP Claude Code
image: /assets/screens/ficha-agente-orca.webp
imageAlt: Ficha de cliente no WACrew com o escritório 2D ao fundo e, ao lado, o terminal do agente de código ligado ao repositório daquele projeto
---

Se você passa o dia no terminal com um agente de código, faz sentido que ele também leia o que o cliente pediu no WhatsApp. O caminho para isso é o **MCP** (Model Context Protocol): um padrão aberto que deixa um agente como o Claude Code chamar ferramentas externas, como "ler mensagens do grupo X" ou "transcrever este áudio".

Este guia mostra como **conectar o WhatsApp ao Claude Code com MCP** usando o servidor do [WACrew](/), que é de código aberto e traz 36 ferramentas. O mesmo servidor funciona no Codex, no Qwen Code e em qualquer cliente MCP.

## O que o agente consegue fazer depois de conectado

Com o servidor ligado, você conversa com o agente em linguagem natural e ele escolhe as ferramentas. Alguns pedidos que funcionam:

- "Quem está esperando resposta agora?" usa `caixa_de_entrada`.
- "O que o cliente pediu hoje no grupo do projeto?" usa `ler_mensagens` e `transcrever` para os áudios.
- "Olha o print do erro que ele mandou" usa `ver_imagem`, e o modelo enxerga a imagem.
- "Ele mandou um vídeo da tela, o que acontece ali?" usa `assistir_video`.
- "Procura onde falamos do prazo do relatório" usa `buscar`, que acha texto inclusive dentro das transcrições.
- "Responde que o ajuste sobe amanhã" usa `preparar_resposta` e `responder`.

O ganho real aparece quando a conversa e o código estão no mesmo lugar: o agente lê o bug relatado no grupo, abre o repositório, corrige e rascunha a resposta para o cliente sem você trocar de janela.

## Antes de começar

Você vai precisar de:

- **Node.js 20 ou mais novo** e `ffmpeg` instalados.
- **Uma conta de WhatsApp** para conectar como aparelho a mais. Pode ser a do seu trabalho; o celular continua funcionando normalmente.
- **Claude Code** (ou outro cliente MCP) instalado.
- Para transcrever áudio na própria máquina, um Mac com Apple Silicon. Fora do Mac, a transcrição vai por API.

Um aviso que vale ler agora: o WACrew **não usa a API oficial do WhatsApp**. Ele conecta pelo Baileys, como o WhatsApp Web. Foi feito para atender quem já fala com você. Disparo em massa e abordagem fria podem bloquear o número.

## Passo 1: instale e conecte o WhatsApp

Clone o repositório e instale as dependências do coletor e do painel:

```bash
git clone https://github.com/sumioshi/wacrew && cd wacrew
npm install && npm --prefix web install
npm run dev
```

O `npm run dev` sobe o coletor, o painel, a transcrição e o notificador. Abra `http://localhost:3000/config`, escaneie o QR pelo celular (WhatsApp, Aparelhos conectados, Conectar um aparelho) e escolha os grupos que quer acompanhar. A sessão fica salva e reconecta sozinha.

A captura começa nesse momento. O WACrew não importa histórico antigo, então o agente só vai enxergar o que chegar depois do pareamento.

## Passo 2: registre o servidor MCP no Claude Code

O repositório traz um modelo pronto de configuração com escopo de projeto. Copie:

```bash
cp .mcp.json.example .mcp.json
```

O arquivo aponta para o servidor em `web/mcp/server.ts` e para a pasta de dados local:

```json
{
  "mcpServers": {
    "whatsapp-collector": {
      "command": "./web/node_modules/.bin/tsx",
      "args": ["./web/mcp/server.ts"],
      "env": {
        "WAC_DATA_DIR": "./data",
        "WAC_GROUPS_CONFIG": "./groups.config.json"
      }
    }
  }
}
```

Abra o Claude Code na pasta do repositório. Ele lê o `.mcp.json` e pede a sua aprovação no primeiro uso do servidor. Aprove e confira com `/mcp` que o `whatsapp-collector` aparece conectado.

O `.mcp.json` fica fora do git de propósito: se você colocar senha nele, ela não vai parar no repositório.

## Passo 3: teste com um pedido de leitura

Comece sempre lendo, nunca enviando. Peça algo como:

> liste os grupos que você consegue ver e me diga quem está esperando resposta

O agente deve chamar `listar_grupos` e `caixa_de_entrada`. Se a lista vier vazia, volte ao painel e confira se os grupos estão marcados para acompanhar e se já chegou alguma mensagem depois do pareamento.

## Passo 4: responda com segurança

Enviar é a parte que exige cuidado, porque **o envio é real**: a mensagem sai da sua conta, para o seu cliente. O fluxo recomendado tem quatro etapas.

1. **`preparar_resposta`** devolve o seu estilo recente naquela conversa e o que o cliente deixou em aberto.
2. O agente escreve dois ou três rascunhos e você lê. Para revisar sem enviar, existe `revisar_texto`.
3. **`responder`** recebe os rascunhos como `candidatos` e envia o que menos destoa de você. Antes de sair, uma revisão em código barra clichê de robô, desculpa repetida e balão repetido; se barrar, nada é enviado.
4. O retorno é um **ticket**, não uma confirmação de envio. A mensagem sai depois, no ritmo humano: segundos numa conversa ativa, minutos a horas numa fria. `status_envio` acompanha e `cancelar_envio` cancela.

Cada conversa tem um modo. No **Confirmar**, que é o padrão, a convenção é o agente mostrar o texto e esperar o seu OK antes de chamar o envio. No **Autônomo**, ligado por conversa, ele pode responder sozinho. Comece tudo em Confirmar.

Faça o primeiro teste de envio num grupo só seu, criado para isso. Nunca teste num grupo de cliente.

## Usando no Codex e em outros clientes MCP

O servidor é o mesmo; muda só onde ele é registrado. O Qwen Code lê o mesmo `.mcp.json` da raiz e pede aprovação na primeira vez. No Codex, o servidor entra na seção `mcp_servers` do `config.toml`, com caminhos absolutos para não depender da pasta em que o Codex foi aberto:

```toml
[mcp_servers.whatsapp-collector]
command = "/caminho/para/wacrew/web/node_modules/.bin/tsx"
args = ["/caminho/para/wacrew/web/mcp/server.ts"]
env = { WAC_DATA_DIR = "/caminho/para/wacrew/data", WAC_GROUPS_CONFIG = "/caminho/para/wacrew/groups.config.json" }
```

Qualquer outro cliente que fale MCP por stdio segue a mesma ideia: comando `tsx`, argumento `web/mcp/server.ts` e as duas variáveis de ambiente.

## Rodando 24 horas e lendo da nuvem

Com o coletor só no seu computador, mensagens que chegam com a máquina desligada não são capturadas. Para não perder nada, suba o coletor e o painel num servidor com o `Dockerfile` incluso (a Railway funciona direto) e um volume em `/data`. Defina `PANEL_USER` e `PANEL_PASS` para o painel exigir login.

Depois, o MCP local pode ler direto do painel na nuvem. Parta do `.mcp.json.remote.example`, que adiciona `WAC_MCP_REMOTE=1` e as variáveis `WAC_CLOUD_URL`, `WAC_CLOUD_USER` e `WAC_CLOUD_PASS`. A mídia é baixada sob demanda quando o agente pede para ver ou transcrever algo.

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| O servidor não aparece no `/mcp` | O Claude Code foi aberto fora da pasta do repositório, ou o `.mcp.json` não existe | Abra o Claude Code na raiz do repositório e confira o arquivo |
| O servidor falha ao iniciar | As dependências do painel não foram instaladas, então falta o `tsx` | Rode `npm --prefix web install` |
| Nenhum grupo aparece | O número não foi pareado ou os grupos não foram marcados | Abra `localhost:3000/config` e confira |
| Mensagens antigas não aparecem | A captura começa no pareamento | Não há como importar o histórico anterior |
| A resposta "não saiu" | O envio é por ticket e leva tempo de propósito | Consulte `status_envio` antes de tentar de novo, para não mandar duas vezes |

## Para onde ir depois

Com o agente lendo e respondendo, o próximo passo é organizar a fila. O guia de [como atender grupos de clientes no WhatsApp sem deixar ninguém esperando](/blog/atender-grupos-de-clientes-no-whatsapp/) mostra o método que usamos. E para entender por que a entrega demora de propósito e o que a revisão barra, leia [Automação de WhatsApp com IA sem cara de robô](/blog/automacao-de-whatsapp-com-ia/).

A lista completa das 36 ferramentas está no [README do projeto](https://github.com/sumioshi/wacrew/blob/main/README.pt-BR.md). O código é aberto, com licença Apache 2.0, e está no [GitHub](https://github.com/sumioshi/wacrew).
