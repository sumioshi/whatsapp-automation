# Contribuindo

Obrigado pelo interesse. Issues e PRs são bem-vindos.

## Antes de abrir um PR

```bash
npm install
cd web && npm install && cd ..

npm test            # suíte (Vitest)
npx tsc --noEmit    # typecheck
```

Os dois precisam passar. O projeto usa [Biome](https://biomejs.dev) para formatação e lint.

## Como o código é organizado

- **`src/`** — o coletor (daemon Baileys). O Baileys fica isolado em `src/whatsapp/` seguindo Ports & Adapters, então mexer em adaptadores não vaza pro resto.
- **`web/`** — o painel (Next.js) e o MCP server (`web/mcp/server.ts`). As libs compartilhadas entre os dois estão em `web/lib/`.
- **`transcriber/`** — o serviço de transcrição (Python/MLX).

## Diretrizes

- **Teste o que adicionar.** Lógica nova de parsing/seleção (ex.: o que vira mensagem, como uma rajada é agrupada) deve ter teste. Veja os `*.test.ts` em `web/lib/` como referência.
- **Cuidado com dados reais.** Nunca commite número de telefone, JID, nome de cliente ou caminho pessoal, nem em teste ou exemplo. Use placeholders (`Acme Corp`, `551199999999`, `120363000000000001@g.us`).
- **Nada de conteúdo coletado.** `data/`, `auth/`, `.env` e `groups.config.json` são gitignored. Mantenha assim.
- **Commits pequenos e descritivos.** Um assunto por commit.

## Reportando bug

Abra uma issue com o sistema operacional, a versão do Node, e os passos pra reproduzir. Quanto mais específico, mais rápido de resolver.
