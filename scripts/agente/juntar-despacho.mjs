#!/usr/bin/env node
// Junta os despacho/<slug>.json produzidos pelos jobs da matriz num único corpo
// pro POST /api/v1/agente/despacho. Node puro.
//   PASSADA=2026-09-04T0610 node juntar-despacho.mjs despacho/
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function juntar(arquivos) {
  const itens = [];
  for (const a of arquivos) {
    if (!a || typeof a !== 'object' || typeof a.slug !== 'string' || !a.slug) continue;
    for (const item of Array.isArray(a.itens) ? a.itens : []) {
      if (!item || typeof item !== 'object') continue;
      itens.push({ ...item, slug: a.slug, cliente: typeof a.cliente === 'string' ? a.cliente : a.slug });
    }
  }
  return { itens };
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('uso: juntar-despacho.mjs <dir> (env PASSADA)');
    process.exit(2);
  }
  let nomes = [];
  try {
    nomes = readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    nomes = [];
  }
  const arquivos = nomes.map((n) => {
    try {
      return JSON.parse(readFileSync(join(dir, n), 'utf8'));
    } catch {
      return null;
    }
  });
  const { itens } = juntar(arquivos);
  process.stdout.write(JSON.stringify({ passada: process.env.PASSADA ?? '', itens }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
