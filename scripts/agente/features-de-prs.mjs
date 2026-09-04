#!/usr/bin/env node
// Lista PRs mergeados de um repositório que fecham issues da triagem (label `whatsapp`)
// e monta as entregas para o POST /api/v1/features. Node puro; usa `gh api` (GH_TOKEN).
//   node features-de-prs.mjs <slug> <owner/repo> <desde-ISO>   → JSON no stdout
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REF_RE = /\b(?:closes|fixes|resolves)\b:?\s*#(\d+)/gi;

export function issuesFechadas(texto) {
  if (!texto) return [];
  const vistos = new Set();
  const out = [];
  for (const m of String(texto).matchAll(REF_RE)) {
    const n = Number(m[1]);
    if (!vistos.has(n)) {
      vistos.add(n);
      out.push(n);
    }
  }
  return out;
}

export function montarEntregas(prs, slug, issuesWhatsapp) {
  const out = [];
  for (const pr of prs) {
    const fecha = issuesFechadas(`${pr.title ?? ''}\n${pr.body ?? ''}`);
    if (!fecha.some((n) => issuesWhatsapp.has(n))) continue;
    out.push({ slug, nome: pr.title, ref: pr.html_url, origem: 'pr', por: 'features.yml', em: pr.merged_at });
  }
  return out;
}

function gh(args) {
  return JSON.parse(execFileSync('gh', ['api', ...args], { encoding: 'utf8' }));
}

function main() {
  const [slug, repo, desde] = process.argv.slice(2);
  if (!slug || !repo || !desde) {
    console.error('uso: features-de-prs.mjs <slug> <owner/repo> <desde-ISO>');
    process.exit(2);
  }
  const dia = desde.slice(0, 10);
  const busca = gh([`search/issues?q=${encodeURIComponent(`repo:${repo} is:pr is:merged merged:>=${dia}`)}&per_page=50`]);
  const prs = (busca.items ?? []).map((i) => ({ title: i.title, html_url: i.html_url, body: i.body, merged_at: i.pull_request?.merged_at ?? i.closed_at }));
  const numeros = new Set(prs.flatMap((pr) => issuesFechadas(`${pr.title}\n${pr.body ?? ''}`)));
  const whatsapp = new Set();
  for (const n of numeros) {
    try {
      const issue = gh([`repos/${repo}/issues/${n}`]);
      if ((issue.labels ?? []).some((l) => l.name === 'whatsapp')) whatsapp.add(n);
    } catch {
      // issue inexistente ou sem acesso: não conta
    }
  }
  process.stdout.write(JSON.stringify(montarEntregas(prs, slug, whatsapp)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
