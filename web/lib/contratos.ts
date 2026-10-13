import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';
import { slugify } from './slug';

/**
 * Estado comercial de cada chat: o que o dashboard cruza com a atividade para
 * apontar cliente ativo demais para o contrato, renovação próxima e custo por entrega.
 */
export type EstadoContrato = 'ativo' | 'encerrado' | 'pausado' | 'sem';

export interface Contrato {
  estado: EstadoContrato;
  /** YYYY-MM-DD ou null. */
  inicio: string | null;
  fim: string | null;
  /** Valor mensal em reais, ou null quando não informado. */
  valorMensal: number | null;
  /** Mensagens do cliente em 30 dias que o plano comporta; null = sem limite. */
  limiteMensagens: number | null;
  nota: string;
}

export const CONTRATO_PADRAO: Contrato = {
  estado: 'sem',
  inicio: null,
  fim: null,
  valorMensal: null,
  limiteMensagens: null,
  nota: '',
};

const ARQUIVO = () => join(DATA_DIR, '.contratos.json');
const ESTADOS: EstadoContrato[] = ['ativo', 'encerrado', 'pausado', 'sem'];
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function dataOuNull(v: unknown, campo: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || !DATA_RE.test(v)) throw new Error(`${campo} deve ser YYYY-MM-DD ou vazio`);
  return v;
}

/** Valida um patch parcial vindo de fora (rota, MCP). Lança com mensagem em pt-BR. */
export function validarPatch(patch: unknown): Partial<Contrato> {
  if (!patch || typeof patch !== 'object') throw new Error('patch deve ser objeto');
  const p = patch as Record<string, unknown>;
  const out: Partial<Contrato> = {};
  if (p.estado !== undefined) {
    if (!ESTADOS.includes(p.estado as EstadoContrato)) throw new Error(`estado deve ser um de: ${ESTADOS.join(', ')}`);
    out.estado = p.estado as EstadoContrato;
  }
  const inicio = dataOuNull(p.inicio, 'inicio');
  if (inicio !== undefined) out.inicio = inicio;
  const fim = dataOuNull(p.fim, 'fim');
  if (fim !== undefined) out.fim = fim;
  if (p.valorMensal !== undefined) {
    if (p.valorMensal === null || p.valorMensal === '') out.valorMensal = null;
    else {
      const n = Number(p.valorMensal);
      if (!Number.isFinite(n) || n < 0) throw new Error('valorMensal deve ser número maior ou igual a zero');
      out.valorMensal = n;
    }
  }
  if (p.limiteMensagens !== undefined) {
    if (p.limiteMensagens === null || p.limiteMensagens === '') out.limiteMensagens = null;
    else {
      const n = Number(p.limiteMensagens);
      if (!Number.isInteger(n) || n < 1) throw new Error('limiteMensagens deve ser um número inteiro maior que zero');
      out.limiteMensagens = n;
    }
  }
  if (p.nota !== undefined) {
    if (typeof p.nota !== 'string') throw new Error('nota deve ser texto');
    out.nota = p.nota.trim();
  }
  if (out.inicio && out.fim && out.fim < out.inicio) throw new Error('fim não pode ser antes do início');
  return out;
}

function contratoValido(v: unknown): v is Contrato {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    ESTADOS.includes(c.estado as EstadoContrato) &&
    (c.inicio === null || (typeof c.inicio === 'string' && DATA_RE.test(c.inicio))) &&
    (c.fim === null || (typeof c.fim === 'string' && DATA_RE.test(c.fim))) &&
    (c.valorMensal === null || typeof c.valorMensal === 'number') &&
    (c.limiteMensagens === undefined || c.limiteMensagens === null || typeof c.limiteMensagens === 'number') &&
    typeof c.nota === 'string'
  );
}

/**
 * Lê todos os contratos; entradas inválidas são ignoradas, arquivo ausente vira {}.
 * Contrato gravado antes de um campo existir ganha o padrão dele (ex.: sem limite).
 */
export async function readContratos(): Promise<Record<string, Contrato>> {
  try {
    const parsed = JSON.parse(await readFile(ARQUIVO(), 'utf8')) as Record<string, unknown>;
    const out: Record<string, Contrato> = {};
    for (const [slug, c] of Object.entries(parsed)) if (contratoValido(c)) out[slug] = { ...CONTRATO_PADRAO, ...c };
    return out;
  } catch {
    return {};
  }
}

/** Mescla o patch sobre o contrato atual (ou o padrão) e persiste. */
export async function setContrato(slug: string, patch: Partial<Contrato>): Promise<Contrato> {
  const key = slugify(slug);
  const todos = await readContratos();
  const atual = todos[key] ?? CONTRATO_PADRAO;
  const novo: Contrato = { ...atual, ...validarPatch(patch) };
  if (novo.inicio && novo.fim && novo.fim < novo.inicio) throw new Error('fim não pode ser antes do início');
  todos[key] = novo;
  await writeJsonAtomic(ARQUIVO(), todos);
  return novo;
}
