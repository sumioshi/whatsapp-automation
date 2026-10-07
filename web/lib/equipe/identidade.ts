import { readdir, stat } from 'node:fs/promises';
import { type Contacts, readContactSidecar } from '../contacts';
import { CONTACTS_FILE, DATA_DIR } from '../paths';

/** Teto de vida de qualquer leitura em cache, mesmo com a chave igual. */
const TTL_MS = 15_000;

/**
 * Cache de módulo para leituras que toda requisição da área repete. Relê
 * quando a chave muda (mtime/tamanho do arquivo) ou quando o TTL vence — o
 * mtime pode repetir, então o TTL é o teto. Chamadas simultâneas dividem a
 * mesma consulta (chave + leitura), registrada antes de qualquer espera;
 * leitura que falhou não fica guardada.
 */
export function cacheComChave<T>(o: {
  chave: () => Promise<string | null>;
  ler: () => Promise<T>;
  ttlMs: number;
  agora?: () => number;
}): () => Promise<T> {
  const agora = o.agora ?? Date.now;
  let atual: { chave: string | null; em: number; valor: Promise<T> } | null = null;
  let pendente: Promise<T> | null = null;
  const consultar = async (): Promise<T> => {
    const chave = await o.chave();
    const t = agora();
    if (atual && atual.chave === chave && t - atual.em < o.ttlMs) return atual.valor;
    const valor = o.ler();
    const entrada = { chave, em: t, valor };
    atual = entrada;
    valor.catch(() => {
      if (atual === entrada) atual = null;
    });
    return valor;
  };
  return () => {
    if (pendente) return pendente;
    const p = consultar();
    pendente = p;
    const solta = () => {
      if (pendente === p) pendente = null;
    };
    p.then(solta, solta);
    return p;
  };
}

async function chaveDeStat(caminho: string): Promise<string | null> {
  try {
    const s = await stat(caminho);
    return `${s.mtimeMs}:${s.size}:${s.ino}`;
  } catch {
    return null;
  }
}

/**
 * Contatos que a autorização usa: só o mapa LID ↔ telefone do sidecar do
 * coletor (é o que decide os irmãos de DM e o destino). Não varre as
 * mensagens de todos os chats, ao contrário do `buildContacts` completo.
 */
export const contatosDeIdentidade: () => Promise<Contacts> = cacheComChave({
  chave: () => chaveDeStat(CONTACTS_FILE),
  ler: async () => {
    const s = await readContactSidecar();
    return { names: s.names, ownIds: new Set(), teamIds: new Set(), phones: s.phones, lids: s.lids, hasSidecar: s.hasSidecar };
  },
  ttlMs: TTL_MS,
});

/** Diretórios de chat do coletor; a chave é o mtime da pasta (muda quando um chat nasce). */
export const slugsExistentes: () => Promise<ReadonlySet<string>> = cacheComChave({
  chave: () => chaveDeStat(DATA_DIR),
  ler: async () => {
    try {
      const entries = await readdir(DATA_DIR, { withFileTypes: true });
      return new Set(entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name));
    } catch {
      return new Set<string>();
    }
  },
  ttlMs: TTL_MS,
});
