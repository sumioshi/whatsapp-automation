#!/usr/bin/env node
/**
 * Driver do MCP server (web/mcp/server.ts) por stdio JSON-RPC.
 * Sobe o servidor, faz o handshake e lista ou chama uma ferramenta.
 *
 *   node driver.mjs                          # lista as ferramentas
 *   node driver.mjs call listar_grupos       # chama sem argumentos
 *   node driver.mjs call resumo_do_dia '{"grupo":"meu-grupo"}'
 *   node driver.mjs call ver_imagem '{"grupo":"x","mediaPath":"x/image/y.jpg"}'
 *
 * Resolve a raiz do repo a partir da própria localização (.claude/skills/...).
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const TSX = resolve(ROOT, "web/node_modules/.bin/tsx");
const SERVER = resolve(ROOT, "web/mcp/server.ts");

const [, , cmd, toolName, toolArgsJson] = process.argv;

const child = spawn(TSX, [SERVER], {
  cwd: resolve(ROOT, "web"),
  env: {
    ...process.env,
    WAC_DATA_DIR: resolve(ROOT, "data"),
    WAC_GROUPS_CONFIG: resolve(ROOT, "groups.config.json"),
  },
  stdio: ["pipe", "pipe", "ignore"],
});

const pending = new Map();
let buf = "";
child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`timeout em ${method}`)), 120000);
    pending.set(id, (m) => {
      clearTimeout(timer);
      res(m);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}
function notify(method) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
}

try {
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "driver", version: "1" },
  });
  notify("notifications/initialized");

  if (cmd === "call") {
    if (!toolName) throw new Error("uso: node driver.mjs call <ferramenta> '<json>'");
    const args = toolArgsJson ? JSON.parse(toolArgsJson) : {};
    const out = await rpc("tools/call", { name: toolName, arguments: args });
    const content = out.result?.content ?? [];
    for (const c of content) {
      if (c.type === "text") console.log(c.text);
      else if (c.type === "image") console.log(`[imagem ${c.mimeType}, ${c.data.length} bytes base64]`);
      else console.log(JSON.stringify(c));
    }
    if (out.error) console.error("erro:", out.error.message);
  } else {
    const list = await rpc("tools/list", {});
    console.log(`${list.result.tools.length} ferramentas:`);
    for (const t of list.result.tools) console.log(`  - ${t.name}: ${t.description.slice(0, 80)}`);
  }
} catch (err) {
  console.error("driver falhou:", err.message);
  process.exitCode = 1;
} finally {
  child.kill();
}
