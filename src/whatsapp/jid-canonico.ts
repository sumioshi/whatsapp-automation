/**
 * JID canônico de uma DM. O número que alguém digita nem sempre é o JID da
 * conta: no Brasil, muitas contas são registradas sem o nono dígito, e o
 * WhatsApp aceita o envio para o JID "errado" sem erro nenhum (um tique, nunca
 * entrega). Só quem sabe o JID certo é o próprio WhatsApp, então todo envio
 * para número de telefone passa por aqui antes; grupo e `@lid` já são
 * canônicos e passam direto.
 */

export class NumeroInexistente extends Error {
  override name = 'NumeroInexistente';
}

export type CheckNumber = (numero: string) => Promise<{ exists: boolean; jid: string | null }>;

export interface JidResolvido {
  jid: string;
  /** O JID pedido, quando difere do canônico (ex.: veio com o nono dígito). */
  corrigidoDe?: string;
}

const TTL_POSITIVO_MS = 24 * 3600_000;
/** Quem não está no WhatsApp hoje pode estar daqui a pouco: negativo expira rápido. */
const TTL_NEGATIVO_MS = 10 * 60_000;
const MAX_CACHE = 2000;

const SUFIXO_PN = '@s.whatsapp.net';

export function criarResolvedorDeJid(
  checkNumber: CheckNumber,
  opts: { agora?: () => number } = {},
): (jid: string) => Promise<JidResolvido> {
  const agora = opts.agora ?? Date.now;
  const cache = new Map<string, { em: number; jid: string | null }>();

  return async (jid) => {
    if (!jid.endsWith(SUFIXO_PN)) return { jid };
    const numero = (jid.split('@')[0] ?? '').split(':')[0] ?? '';
    if (!/^\d{8,}$/.test(numero)) return { jid };

    const pedido = `${numero}${SUFIXO_PN}`;
    const hit = cache.get(numero);
    let canonico: string | null;
    if (hit && agora() - hit.em < (hit.jid ? TTL_POSITIVO_MS : TTL_NEGATIVO_MS)) {
      canonico = hit.jid;
    } else {
      try {
        const r = await checkNumber(numero);
        canonico = r.exists && r.jid ? r.jid : null;
      } catch {
        // Consulta fora do ar não pode travar envio para contato conhecido.
        return { jid: pedido };
      }
      if (cache.size >= MAX_CACHE) {
        const maisAntigo = cache.keys().next().value;
        if (maisAntigo !== undefined) cache.delete(maisAntigo);
      }
      cache.set(numero, { em: agora(), jid: canonico });
    }
    if (!canonico) throw new NumeroInexistente(`o número ${numero} não está no WhatsApp`);
    return canonico === pedido ? { jid: canonico } : { jid: canonico, corrigidoDe: jid };
  };
}
