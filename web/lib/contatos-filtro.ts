import type { Role } from "./contacts";

/**
 * Filtro do `listar_contatos`. Uma conta com history sync tem milhares de
 * contatos — listar tudo estoura o contexto de quem chama. Aqui: busca por
 * nome ou número, colapso de telefone+LID da mesma pessoa numa linha (com o
 * slug da DM pronto pra `ler_mensagens`) e teto com aviso de truncado.
 */

export interface ContatoLinha {
  id: string;
  nome: string;
  papel: Role;
  dmJid: string | null;
}

export interface ContatoAgrupado {
  nome: string;
  papel: Role;
  dmJid: string | null;
  /** Slug da DM (`dm-<telefone>`) pra ler direto; null quando não há telefone. */
  slug: string | null;
  /** Todos os ids (telefone e/ou LID) que apontam pra esta pessoa. */
  ids: string[];
}

export interface ContatosFiltrados {
  /** Quantas pessoas casaram com a busca (antes do teto). */
  total: number;
  mostrados: ContatoAgrupado[];
  truncado: boolean;
}

const LIMITE_PADRAO = 100;

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Formas equivalentes de um número BR: o WhatsApp guarda celulares antigos SEM o
 * nono dígito (55 + DDD + 8), e o operador digita COM (55 + DDD + 9 + 8). Casar as
 * duas evita "não achei" por causa de um 9.
 */
function variantesBr(digitos: string): string[] {
  const out = new Set([digitos]);
  const comNove = /^55(\d{2})9(\d{8})$/.exec(digitos);
  if (comNove) out.add(`55${comNove[1]}${comNove[2]}`);
  const semNove = /^55(\d{2})(\d{8})$/.exec(digitos);
  if (semNove) out.add(`55${semNove[1]}9${semNove[2]}`);
  return [...out];
}

export function filtrarContatos(
  lista: ContatoLinha[],
  busca?: string,
  limite: number = LIMITE_PADRAO,
): ContatosFiltrados {
  // Agrupa por dmJid (telefone e LID da mesma pessoa); sem dmJid, cada id é uma linha.
  const grupos = new Map<string, ContatoAgrupado>();
  for (const c of lista) {
    const chave = c.dmJid ?? `id:${c.id}`;
    const atual = grupos.get(chave);
    if (atual) {
      if (!atual.ids.includes(c.id)) atual.ids.push(c.id);
      if (!atual.nome && c.nome) atual.nome = c.nome;
      continue;
    }
    const telefone = c.dmJid?.endsWith("@s.whatsapp.net") ? c.dmJid.split("@")[0] : null;
    grupos.set(chave, {
      nome: c.nome,
      papel: c.papel,
      dmJid: c.dmJid,
      slug: telefone ? `dm-${telefone}` : null,
      ids: [c.id],
    });
  }

  let pessoas = [...grupos.values()];
  const termo = normalizar(busca ?? "");
  const digitos = soDigitos(busca ?? "");
  if (termo) {
    pessoas = pessoas.filter((p) => {
      if (normalizar(p.nome).includes(termo)) return true;
      if (digitos.length >= 6) {
        const formas = variantesBr(digitos);
        if (p.ids.some((id) => formas.some((f) => id.includes(f)))) return true;
        if (p.dmJid && formas.some((f) => soDigitos(p.dmJid ?? "").includes(f))) return true;
      }
      return false;
    });
  }
  pessoas.sort((a, b) => a.papel.localeCompare(b.papel) || a.nome.localeCompare(b.nome));
  const teto = Math.max(1, limite);
  return { total: pessoas.length, mostrados: pessoas.slice(0, teto), truncado: pessoas.length > teto };
}
