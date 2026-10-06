import type { Role } from './contacts';

/** Filtros do stream SSE, decididos no servidor pra não descer o que ninguém quer. */
export interface FiltroEventos {
  /** null = não filtra por fromMe. */
  fromMe: boolean | null;
  /** Canais a esconder: `coletor` = eco do que o agente/MCP mandou; `painel` = o que uma pessoa mandou pelo painel. */
  ocultar: Set<string>;
  /** Vazio = qualquer papel. */
  papel: Set<Role>;
}

const PAPEIS: ReadonlySet<string> = new Set(['me', 'team', 'client']);

function lista(v: string | null): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `slug=a,b,c` → ['a','b','c'] sem repetição. */
export function parseSlugs(q: URLSearchParams): string[] {
  return [...new Set(lista(q.get('slug')))];
}

/** `fromMe=0|1`, `ocultar=coletor,ia_meta`, `papel=client,team`. */
export function parseFiltro(q: URLSearchParams): FiltroEventos {
  const fm = q.get('fromMe');
  return {
    fromMe: fm === '0' ? false : fm === '1' ? true : null,
    ocultar: new Set(lista(q.get('ocultar'))),
    papel: new Set(lista(q.get('papel')).filter((p): p is Role => PAPEIS.has(p))),
  };
}

/** Canal pra filtrar: envio de pessoa no painel vira `painel`, não o `coletor` do agente. */
function canal(msg: { origem?: string; ator?: string }): string | undefined {
  return msg.ator === 'painel' ? 'painel' : msg.origem;
}

export function passaFiltro(
  msg: { fromMe?: boolean; origem?: string; sender?: string; ator?: string },
  f: FiltroEventos,
  papelDe: (sender: string) => Role,
): boolean {
  const meu = Boolean(msg.fromMe);
  if (f.fromMe !== null && f.fromMe !== meu) return false;
  const c = canal(msg);
  if (c && f.ocultar.has(c)) return false;
  if (f.papel.size && !f.papel.has(papelDe(msg.sender ?? ''))) return false;
  return true;
}
