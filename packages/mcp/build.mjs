// Empacota o servidor MCP do WACrew num único arquivo para o npm.
// Uso (na raiz do repositório): node packages/mcp/build.mjs
import { build } from "esbuild";
import { readFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const { version } = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));

await build({
  entryPoints: [join(here, "src", "bin.ts")],
  outfile: join(here, "dist", "wacrew-mcp.cjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  banner: { js: "#!/usr/bin/env node" },
  define: { "process.env.WACREW_MCP_VERSION": JSON.stringify(version) },
  legalComments: "linked",
  logLevel: "warning",
});

copyFileSync(join(root, "LICENSE"), join(here, "LICENSE"));
copyFileSync(join(root, "NOTICE"), join(here, "NOTICE"));
console.log(`wacrew-mcp ${version} -> packages/mcp/dist/wacrew-mcp.cjs`);
