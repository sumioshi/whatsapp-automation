/**
 * Padrões do pacote npm, aplicados antes de o servidor carregar.
 * O pacote roda fora do repositório: os dados de trabalho (cache de mídia,
 * registro de revisões) ficam em ~/.wacrew, e com WAC_CLOUD_URL definido o
 * MCP lê e envia pelo painel do WACrew (modo remoto), que é o uso esperado.
 */
import { homedir } from "node:os";
import { join } from "node:path";

process.env.WACREW_MCP_PACKAGED = "1";
process.env.WAC_DATA_DIR ??= join(homedir(), ".wacrew", "data");
process.env.WAC_GROUPS_CONFIG ??= join(homedir(), ".wacrew", "groups.config.json");
if (process.env.WAC_CLOUD_URL && process.env.WAC_MCP_REMOTE === undefined) {
  process.env.WAC_MCP_REMOTE = "1";
}
