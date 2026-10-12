/**
 * Contas da aparência do Balcão: matiz por nome, iniciais e a régua de espera.
 * Puras e sem dependência de React, para servir ao servidor, ao cliente e aos testes.
 */

export type Matiz = 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'sky' | 'indigo' | 'violet' | 'pink';

export const MATIZES: readonly Matiz[] = ['red', 'orange', 'amber', 'green', 'teal', 'sky', 'indigo', 'violet', 'pink'];

/** O mesmo nome cai sempre no mesmo matiz, então o cliente tem a mesma cor em todas as telas. */
export function matizDoNome(nome: string): Matiz {
  let h = 7;
  for (const ch of nome.trim().toLocaleLowerCase('pt-BR')) {
    h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) >>> 0;
  }
  return MATIZES[h % MATIZES.length] as Matiz;
}

export function corDoMatiz(m: Matiz): string {
  return `var(--color-hue-${m})`;
}

/** Etiquetas do dia a dia têm cor fixa; qualquer outra usa o matiz pelo nome. */
const MATIZ_ETIQUETA: Record<string, Matiz> = {
  bug: 'red',
  contrato: 'indigo',
  proposta: 'amber',
  lead: 'violet',
  parceiro: 'teal',
};

export function matizDaEtiqueta(nome: string): Matiz {
  return MATIZ_ETIQUETA[nome.trim().toLocaleLowerCase('pt-BR')] ?? matizDoNome(nome);
}

const TRATAMENTOS = new Set(['dr', 'dra', 'sr', 'sra', 'srta', 'prof', 'profa']);

/** Até duas letras. Telefone, emoji ou vazio viram "#" para o avatar nunca sair em branco. */
export function iniciais(nome: string): string {
  const palavras = nome
    .normalize('NFC')
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((p) => /\p{L}/u.test(p))
    .filter((p) => !TRATAMENTOS.has(p.toLocaleLowerCase('pt-BR')));
  if (palavras.length === 0) return '#';
  return palavras
    .slice(0, 2)
    .map((p) => (p.match(/\p{L}/u)?.[0] ?? '').toLocaleUpperCase('pt-BR'))
    .join('');
}

export function tipoPeloSlug(slug: string): 'grupo' | 'dm' {
  return slug.startsWith('dm-') ? 'dm' : 'grupo';
}

const MIN = 60_000;
const LIMITE_ATENCAO = 30 * MIN;
const LIMITE_URGENTE = 4 * 60 * MIN;

export type NivelEspera = 'neutro' | 'atencao' | 'urgente';

/** Régua de espera: neutro até 30 min, âmbar até 4 h, vermelho depois. */
export function nivelEspera(ms: number): NivelEspera {
  if (!(ms >= LIMITE_ATENCAO)) return 'neutro';
  return ms <= LIMITE_URGENTE ? 'atencao' : 'urgente';
}

/** Número e unidade separados: o número vai em mono e a unidade na fonte de texto. */
export function formatarEspera(ms: number): { valor: string; unidade: string }[] {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / MIN) : 0;
  if (total < 60) return [{ valor: String(total), unidade: 'min' }];
  if (total < 24 * 60) {
    return [
      { valor: String(Math.floor(total / 60)), unidade: 'h' },
      { valor: String(total % 60).padStart(2, '0'), unidade: 'm' },
    ];
  }
  return [
    { valor: String(Math.floor(total / (24 * 60))), unidade: 'd' },
    { valor: String(Math.floor((total % (24 * 60)) / 60)), unidade: 'h' },
  ];
}

/** Quanto do anel de espera está cheio: enche até 4 h. */
export function fracaoAnel(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(1, ms / LIMITE_URGENTE);
}
