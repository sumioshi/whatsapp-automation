/**
 * Núcleo puro do Despacho: formata a fila de decisões pro WhatsApp e interpreta
 * os comandos do operador. Sem I/O — o loop (despacho.ts) injeta arquivos e relógio.
 * O contrato JSON é o mesmo que o painel grava em `data/despacho/`.
 */
export type TipoItem = 'issue' | 'pergunta' | 'bug' | 'info';
export type AcaoItem = 'nenhuma' | 'label' | 'enviar';

export interface ItemDespacho {
  n: number;
  id: string;
  slug: string;
  cliente: string;
  tipo: TipoItem;
  titulo: string;
  url: string | null;
  texto: string | null;
  issue: { repo: string; numero: number } | null;
  acao: AcaoItem;
  label: string | null;
  executadoEm: string | null;
  resultado: string | null;
}

export interface ArquivoDespacho {
  passada: string;
  criadoEm: string;
  enviadoEm: string | null;
  itens: ItemDespacho[];
}

export const DESPACHO_MAX_ITENS = 12;

/** '2026-09-04T0610' → '04/09 06:10' (a passada já vem no fuso do operador). */
export function rotuloPassada(passada: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})$/.exec(passada);
  if (!m) return passada;
  return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
}

function linhaIssue(i: ItemDespacho): string {
  const num = i.issue ? ` · #${i.issue.numero}` : '';
  const bug = i.tipo === 'bug' ? ' _bug_' : '';
  return `${i.n}. ${i.cliente} — ${i.titulo}${num}${bug}`;
}

/** Digest no formato do WhatsApp: título em negrito, seções por tipo, itens numerados. */
export function formatarDespacho(a: ArquivoDespacho, maxItens = DESPACHO_MAX_ITENS): string {
  const titulo = `📋 *despacho — ${rotuloPassada(a.passada)}*`;
  if (a.itens.length === 0) return `${titulo}\n\nnada novo pra decidir nesta passada.`;
  const mostrados = a.itens.slice(0, maxItens);
  const resto = a.itens.length - mostrados.length;
  const issues = mostrados.filter((i) => i.tipo === 'issue' || i.tipo === 'bug');
  const perguntas = mostrados.filter((i) => i.tipo === 'pergunta');
  const infos = mostrados.filter((i) => i.tipo === 'info');
  const secoes: string[] = [];
  if (issues.length)
    secoes.push(`*Issues criadas (${issues.length})*\n${issues.map(linhaIssue).join('\n')}`);
  if (perguntas.length) {
    secoes.push(
      `*Perguntas pra aprovar (${perguntas.length})*\n${perguntas
        .map((i) => `${i.n}. ${i.cliente} — "${i.texto ?? i.titulo}"`)
        .join('\n')}`,
    );
  }
  if (infos.length)
    secoes.push(
      `*Pra você decidir (${infos.length})*\n${infos.map((i) => `${i.n}. ${i.cliente} — ${i.titulo}`).join('\n')}`,
    );
  const sufixo = resto > 0 ? `\n_… e mais ${resto}_` : '';
  return `${titulo}\n\n${secoes.join('\n\n')}${sufixo}\n\nresponda: ok N · não N · edita N: texto · ok todos`;
}

export type Comando =
  | { tipo: 'ok' | 'nao'; alvo: number | 'todos' }
  | { tipo: 'edita'; n: number; texto: string };

/** Só a mensagem inteira conta como comando; texto solto do operador é ignorado. */
export function parseComando(texto: string): Comando | null {
  const t = texto.trim();
  const simples = /^(ok|não|nao)\s+(\d+|todos)$/i.exec(t);
  if (simples?.[1] && simples[2]) {
    const tipo = simples[1].toLowerCase() === 'ok' ? 'ok' : 'nao';
    const alvo = simples[2].toLowerCase() === 'todos' ? 'todos' : Number(simples[2]);
    return { tipo, alvo };
  }
  const edita = /^edita\s+(\d+)\s*:\s*(.+)$/is.exec(t);
  if (edita?.[1] && edita[2]) return { tipo: 'edita', n: Number(edita[1]), texto: edita[2].trim() };
  return null;
}

export function acharItem(
  arquivos: ArquivoDespacho[],
  n: number,
): { arquivo: ArquivoDespacho; item: ItemDespacho } | null {
  for (const arquivo of arquivos) {
    const item = arquivo.itens.find((i) => i.n === n);
    if (item) return { arquivo, item };
  }
  return null;
}

/** Itens que ainda aceitam `ok`: têm ação e não foram executados. */
export function pendentes(arquivo: ArquivoDespacho): ItemDespacho[] {
  return arquivo.itens.filter((i) => i.acao !== 'nenhuma' && !i.executadoEm);
}
