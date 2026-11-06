# API v1

Superfície estável para consumir o coletor de fora — listar conversas, ler
histórico, receber mensagem nova em tempo real, enviar, editar, reagir e mexer na
triagem.

As rotas antigas (`/api/messages`, `/api/send`, `/api/triage`…) continuam existindo
e servindo o painel. Elas autenticam por Basic/cookie e mudam de formato conforme
a tela precisa — **não use como integração**. A v1 é a que tem contrato.

Base: `https://<host>/api/v1`

## Autenticação

Bearer token com escopo. `read` lê; `write` lê e escreve.

```bash
curl -H "authorization: Bearer $TOKEN" https://<host>/api/v1/health
```

Gere e administre os tokens no servidor:

```bash
node scripts/api-token.mjs criar meu-projeto --escopos read,write
node scripts/api-token.mjs listar
node scripts/api-token.mjs revogar tk_abc123
```

O token cru aparece **uma vez**, na criação. O arquivo (`<data>/api-tokens.json`)
guarda só o sha256, então cópia do volume não entrega credencial usável. Revogação
vale em até 10 segundos — é o TTL do cache que evita reler o arquivo a cada
requisição.

## Formato

Sucesso vem em envelope:

```json
{ "data": [ … ], "page": { "next": "<cursor>", "hasMore": true } }
```

Erro é sempre a mesma forma, com código estável para o cliente ramificar:

```json
{ "error": { "code": "not_found", "message": "chat \"x\" não encontrado" } }
```

Códigos: `unauthorized` (401), `forbidden` (403), `invalid_request` (400),
`not_found` (404), `conflict` (409), `rate_limited` (429), `internal` (500).

## Endpoints

| método | rota | escopo | o que faz |
|---|---|---|---|
| GET | `/health` | read | conexão do WhatsApp; serve de teste de credencial |
| GET | `/chats` | read | lista os chats (`?q`, `?limit`, `?offset`) |
| GET | `/chats/{slug}` | read | detalhe do chat e estado de triagem |
| PATCH | `/chats/{slug}` | write | `mode`, `muted`, `note`, `tags`, `resolvedAt` |
| GET | `/chats/{slug}/messages` | read | histórico (`?limit`, `?before`) |
| POST | `/chats/{slug}/messages` | write | envia texto ou mídia por URL |
| GET | `/chats/{slug}/events` | read | SSE das mensagens novas |
| PATCH | `/messages/{id}` | write | edita mensagem própria (`chat` no corpo) |
| PUT/DELETE | `/messages/{id}/reaction` | write | define/remove reação |
| GET | `/contacts` | read | contatos conhecidos, com jid de DM |
| GET | `/media/{path}` | read | arquivo referenciado em `mediaPath` |
| GET | `/radar` | read | quem está sem resposta |
| GET | `/openapi` | read | especificação, para gerar cliente |

## Paginação do histórico

Mensagens voltam em ordem cronológica dentro da janela, e a paginação anda **para
trás**: pegue `page.next` e mande em `before` para carregar o bloco anterior.

```js
const primeira = await busca(`/chats/${slug}/messages?limit=100`);
const anterior = await busca(`/chats/${slug}/messages?limit=100&before=${primeira.page.next}`);
```

## Envio sem duplicar

Mande `Idempotency-Key` em toda escrita. Se o cliente repetir a chamada — timeout,
retry automático, usuário clicando duas vezes — a segunda devolve a resposta da
primeira, com `idempotent-replay: true`, em vez de mandar a mensagem de novo.

```bash
curl -X POST https://<host>/api/v1/chats/meu-chat/messages \
  -H "authorization: Bearer $TOKEN" \
  -H "idempotency-key: $(uuidgen)" \
  -H "content-type: application/json" \
  -d '{"text":"oi"}'
```

Sem a chave, cada chamada envia. Um retry cego já duplicou mensagem em chat de
cliente aqui; a chave existe para isso não se repetir.

A resposta traz o `mode` do chat: `confirm` significa que a convenção interna pede
aprovação humana antes de mandar. A API **não bloqueia** — quem decide é o
integrador, mas o dado está lá.

## Tempo real

```js
const es = new EventSource(`${base}/chats/${slug}/events`, { headers });
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

Cada evento é uma mensagem nova, a partir do momento da conexão (não replica o
histórico). Tem heartbeat a cada 25s para atravessar proxy.

## CORS

Desligado por padrão, e essa é a escolha certa quando o consumidor tem backend
próprio: o token fica no servidor dele e nunca chega ao navegador.

Se o consumidor for front puro, libere as origens:

```
WAC_API_CORS_ORIGINS=https://app.exemplo.com,https://outro.exemplo.com
```

Nesse caso use **só token `read`** — token em front é visível para quem abrir o
DevTools.

## Limite de taxa

120 requisições por minuto por token, ajustável em `WAC_API_RATE_LIMIT`. A resposta
traz `x-ratelimit-remaining`; ao estourar, 429 com `retry-after`.

É janela em memória, por instância — contém cliente com laço desgovernado, não
pretende ser defesa contra abuso distribuído.

## Exemplo: listar conversas e abrir uma

```js
const base = "https://<host>/api/v1";
const h = { authorization: `Bearer ${process.env.WAC_API_TOKEN}` };

const { data: chats } = await fetch(`${base}/chats?limit=50`, { headers: h }).then((r) => r.json());

const slug = chats[0].slug;
const { data: msgs } = await fetch(`${base}/chats/${slug}/messages?limit=100`, { headers: h })
  .then((r) => r.json());

for (const m of msgs) {
  console.log(m.fromMe ? "eu" : m.senderName, m.text ?? `[${m.type}]`);
  if (m.mediaPath) console.log(`  mídia: ${base}/media/${m.mediaPath}`);
}
```

## Agente de triagem

Rotas usadas pelo workflow de triagem.

| Rota | Escopo | Uso |
|---|---|---|
| `GET /api/v1/agente/fila?slug=` | read | chats com agente ligado, repositório vinculado e mensagem nova de terceiro desde o checkpoint. `slug` força um chat. |
| `POST /api/v1/agente/checkpoint` `{slug, ate}` | write | avança o checkpoint (nunca recua). |
| `POST /api/v1/agente/despacho` `{passada, itens}` | write | grava a fila de decisões da passada; o coletor envia ao operador e executa `ok N`. **Idempotente por `passada`**: um POST repetido (retry do workflow) não sobrescreve o arquivo já gravado — devolve `duplicado: true` e mantém `enviadoEm`/`executadoEm` que o operador já tiver marcado. |

Item de despacho: `{ slug, cliente, tipo: issue|pergunta|bug|info, titulo, url?, texto?, issue?: {repo, numero}, acao?: nenhuma|label|enviar, label? }`.

## Entregas por cliente

| Rota | Escopo | Uso |
|---|---|---|
| `GET /api/v1/features?slug=&desde=` | read | entregas registradas (manuais via MCP ou automáticas por PR mergeado). |
| `POST /api/v1/features` `{slug, nome, ref?, origem?, por?, em?}` | write | registra uma entrega; mesma `ref` já gravada **no mesmo chat** devolve `duplicada: true` sem gravar (a mesma `ref` em outro chat é outra entrega). `em` é o instante ISO da entrega — o padrão é agora, e o workflow manda o `merged_at` do PR. |
