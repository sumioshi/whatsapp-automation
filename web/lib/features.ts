import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DATA_DIR } from './paths';
import { slugify } from './slug';

/**
 * Entregas por cliente: cada funcionalidade concluída vira uma linha append-only.
 * A referência (URL do PR) deduplica DENTRO do chat, para o registro automático
 * poder repetir sem gravar duas vezes. É por chat porque a `ref` é texto livre
 * no MCP: "issue 12" em dois clientes são entregas diferentes.
 */
export interface Feature {
  id: string;
  slug: string;
  nome: string;
  ref: string | null;
  origem: 'mcp' | 'pr';
  em: string;
  por: string | null;
}

export interface EntradaFeature {
  slug: string;
  nome: string;
  ref?: string | null;
  origem?: 'mcp' | 'pr';
  por?: string | null;
  em?: string;
}

const ARQUIVO = () => join(DATA_DIR, 'features.jsonl');

function novoId(agora: Date): string {
  const rnd = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `${String(agora.getTime()).padStart(13, '0')}-${rnd}`;
}

function parseLinha(linha: string): Feature | null {
  try {
    const f = JSON.parse(linha) as Feature;
    return typeof f.id === 'string' && typeof f.slug === 'string' && typeof f.nome === 'string' ? f : null;
  } catch {
    return null;
  }
}

async function lerTodas(): Promise<Feature[]> {
  let raw: string;
  try {
    raw = await readFile(ARQUIVO(), 'utf8');
  } catch {
    return [];
  }
  return raw.split('\n').filter(Boolean).map(parseLinha).filter((f): f is Feature => f !== null);
}

/** Lista entregas, opcionalmente por chat e a partir de um instante ISO. */
export async function listarFeatures(filtro: { slug?: string; desde?: string } = {}): Promise<Feature[]> {
  const key = filtro.slug ? slugify(filtro.slug) : null;
  return (await lerTodas()).filter((f) => (!key || f.slug === key) && (!filtro.desde || f.em >= filtro.desde));
}

/** Registra uma entrega. Mesma `ref` (não nula) já gravada NO MESMO chat → devolve a existente com `duplicada: true`. */
export async function registrarFeature(entrada: EntradaFeature): Promise<{ feature: Feature; duplicada: boolean }> {
  // slugify tem fallback para "sem-nome" (útil pra nome de grupo ausente), então
  // a checagem de vazio precisa vir ANTES dele — senão slug="" nunca é rejeitado.
  if (!(entrada.slug ?? '').trim()) throw new Error('slug obrigatório');
  const slug = slugify(entrada.slug);
  const nome = (entrada.nome ?? '').trim();
  if (!nome) throw new Error('nome obrigatório');
  const ref = entrada.ref ? String(entrada.ref).trim() || null : null;
  const todas = await lerTodas();
  if (ref) {
    const existente = todas.find((f) => f.ref === ref && f.slug === slug);
    if (existente) return { feature: existente, duplicada: true };
  }
  const agora = entrada.em ? new Date(entrada.em) : new Date();
  if (Number.isNaN(agora.getTime())) throw new Error('em deve ser um timestamp ISO');
  const feature: Feature = {
    id: novoId(agora),
    slug,
    nome,
    ref,
    origem: entrada.origem === 'pr' ? 'pr' : 'mcp',
    em: agora.toISOString(),
    por: entrada.por ?? null,
  };
  await mkdir(dirname(ARQUIVO()), { recursive: true });
  await appendFile(ARQUIVO(), `${JSON.stringify(feature)}\n`);
  return { feature, duplicada: false };
}
