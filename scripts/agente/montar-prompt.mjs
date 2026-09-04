#!/usr/bin/env node
// Renderiza o prompt do worker de triagem a partir do template e do item da fila.
// Node puro (roda no runner do GitHub sem instalar nada).
//   ITEM='{"slug":...}' PASSADA=2026-09-04T0610 node montar-prompt.mjs .github/agente/triagem.prompt.md
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function renderTemplate(template, vars) {
  const out = template.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, chave) => {
    if (!(chave in vars)) throw new Error(`placeholder sem valor: ${chave}`);
    return String(vars[chave]);
  });
  return out;
}

function main() {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error('uso: montar-prompt.mjs <template.md> (env ITEM e PASSADA)');
    process.exit(2);
  }
  const item = JSON.parse(process.env.ITEM ?? '{}');
  const vars = { ...item, passada: process.env.PASSADA ?? '' };
  process.stdout.write(renderTemplate(readFileSync(caminho, 'utf8'), vars));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
