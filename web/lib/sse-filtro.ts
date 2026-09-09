import type { Role } from './contacts';

/** Filtros do stream SSE, decididos no servidor pra não descer o que ninguém quer. */
export interface FiltroEventos {
  /** null = não filtra por fromMe. */
  fromMe: boolean | null;
  /** Origens a esconder (`coletor` = o que este agente/MCP/painel mandou). */
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

export function passaFiltro(
  msg: { fromMe?: boolean; origem?: string; sender?: string },
  f: FiltroEventos,
  papelDe: (sender: string) => Role,
): boolean {
  const meu = Boolean(msg.fromMe);
  if (f.fromMe !== null && f.fromMe !== meu) return false;
  if (msg.origem && f.ocultar.has(msg.origem)) return false;
  if (f.papel.size && !f.papel.has(papelDe(msg.sender ?? ''))) return false;
  return true;
}
