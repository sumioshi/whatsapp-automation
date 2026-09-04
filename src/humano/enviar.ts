import { quebrarEmBaloes } from './baloes.js';
import { foraDoExpediente } from './expediente.js';
import { loadPerfilEnvio } from './perfil.js';
import { type Passo, planoDeEntrega } from './plano.js';

export interface EntregadorHumano {
  entregarHumano(jid: string, plano: Passo[]): Promise<{ enviados: number; total: number }>;
}

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
  opts: { slug?: string; typos?: boolean; umBalao?: boolean } = {},
): Promise<{ baloes: number }> {
  const perfil = await loadPerfilEnvio(opts.slug, dataDir);
  const baloes = opts.umBalao ? [texto.trim()] : quebrarEmBaloes(texto, perfil);
  const plano = planoDeEntrega(baloes, perfil, {
    typos: opts.typos === true,
    foraDoExpediente: await foraDoExpediente(dataDir),
  });
  const r = await gateway.entregarHumano(jid, plano);
  return { baloes: r.total };
}
