import { quebrarEmBaloes } from './baloes.js';
import { foraDoExpediente } from './expediente.js';
import { loadPerfilEnvio } from './perfil.js';
import { garantirJanela, type Passo, planoDeEntrega } from './plano.js';

export interface EntregadorHumano {
  entregarHumano(
    jid: string,
    plano: Passo[],
    signal?: AbortSignal,
  ): Promise<{ enviados: number; total: number; cancelado: boolean }>;
}

/** Janela mínima antes do 1º balão: tempo que o operador tem pra cancelar (Esc / "cancela"). */
export const JANELA_CANCELAMENTO_MS = 5_000;

/**
 * Entrega um texto como o operador digitando: perfil de cadência do chat, balões,
 * pausas e (opcional) typo. É o mesmo caminho do `/send` com `humano: true`,
 * extraído pra quem envia de dentro do coletor (Despacho) reusar sem HTTP.
 */
export async function enviarHumano(
  gateway: EntregadorHumano,
  dataDir: string,
  jid: string,
  texto: string,
  opts: {
    slug?: string;
    typos?: boolean;
    umBalao?: boolean;
    /** Aborta entre passos; nada que já saiu é desfeito. */
    signal?: AbortSignal;
    janelaMs?: number;
  } = {},
): Promise<{ baloes: number; enviados: number; cancelado: boolean }> {
  const perfil = await loadPerfilEnvio(opts.slug, dataDir);
  const baloes = opts.umBalao ? [texto.trim()] : quebrarEmBaloes(texto, perfil);
  const plano = garantirJanela(
    planoDeEntrega(baloes, perfil, {
      typos: opts.typos === true,
      foraDoExpediente: await foraDoExpediente(dataDir),
    }),
    opts.janelaMs ?? JANELA_CANCELAMENTO_MS,
  );
  const r = await gateway.entregarHumano(jid, plano, opts.signal);
  return { baloes: r.total, enviados: r.enviados, cancelado: r.cancelado };
}
