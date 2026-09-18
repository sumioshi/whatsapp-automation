/**
 * Ambiente do MCP, resolvido ANTES de qualquer outro import (este módulo é o
 * primeiro da lista em server.ts, então roda antes de `../lib/paths` fixar
 * DATA_DIR). O MCP é registrado globalmente e nasce com o diretório de trabalho
 * da sessão, que pode ser qualquer repositório: sem isto, cada projeto ganharia
 * um `data/` próprio e o registro de revisões, o baseline de estilo e o cache de
 * mídia ficariam espalhados.
 */
import { resolve } from "node:path";

// Lançado pelo Claude Code, não pelo `npm run dev`: não herda o .env da raiz.
// loadEnvFile NÃO sobrescreve o que já veio do registro do MCP.
try {
  process.loadEnvFile(resolve(__dirname, "../../.env"));
} catch {
  // Sem .env (ou Node < 20.12): segue sem nuvem, comportamento de antes.
}

// Raiz de dados deste repositório, independente de onde a sessão foi aberta.
process.env.WAC_DATA_DIR ??= resolve(__dirname, "../../data");
process.env.WAC_GROUPS_CONFIG ??= resolve(__dirname, "../../groups.config.json");

process.stderr.write(`[whatsapp-mcp] dados em ${process.env.WAC_DATA_DIR}\n`);
