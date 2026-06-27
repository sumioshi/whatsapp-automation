/**
 * Agendador do recado de expediente. A cada tick: lê expediente.json, calcula se
 * estamos DENTRO/FORA do expediente e, SÓ na transição, troca o recado/"sobre" do
 * perfil via a API de controle do coletor (POST /profile/status). Processo
 * standalone (igual scripts/notifier.ts), idempotente: se o coletor estiver
 * offline na hora, a troca falha e tenta de novo no próximo tick.
 *
 * Rodar: `npm run expediente` (via tsx). Variáveis:
 *   WAC_DATA_DIR              raiz dos dados (default ./data)
 *   WAC_CONTROL_PORT          porta do control server (default 4310)
 *   WAC_EXPEDIENTE_INTERVALO_MS  intervalo do tick (default 300000 = 5min)
 */
import { resolve } from 'node:path';

// As libs do painel resolvem DATA_DIR/CONTROL por env — fixa antes de importá-las.
const DATA_DIR = process.env.WAC_DATA_DIR ?? resolve(process.cwd(), 'data');
process.env.WAC_DATA_DIR = DATA_DIR;

const INTERVALO_MS = Number(process.env.WAC_EXPEDIENTE_INTERVALO_MS ?? '300000');

async function tick(): Promise<void> {
  const { CONTROL_URL } = await import('../web/lib/paths');
  const { lerExpediente, lerEstadoAplicado, gravarEstadoAplicado } = await import(
    './lib/expediente-store'
  );
  const { decidirAcao } = await import('./lib/expediente');

  const cfg = await lerExpediente(DATA_DIR);
  if (!cfg.ativo) return; // desligado: nada a fazer

  const ultimo = await lerEstadoAplicado(DATA_DIR);
  const acao = decidirAcao(new Date(), cfg, ultimo);
  if (!acao.aplicar || acao.recado === null) return;

  try {
    const res = await fetch(`${CONTROL_URL}/profile/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: acao.recado }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      console.error(`[expediente] falha ao aplicar recado (${acao.estado}):`, data.error ?? res.status);
      return; // NÃO persiste o estado — tenta de novo no próximo tick
    }
    await gravarEstadoAplicado(DATA_DIR, acao.estado);
    console.log(`[expediente] recado trocado → ${acao.estado}: "${acao.recado}"`);
  } catch (err) {
    console.error('[expediente] coletor offline? tentando no próximo tick:', err);
  }
}

async function main(): Promise<void> {
  console.log(
    `[expediente] agendador iniciado (DATA_DIR=${DATA_DIR}, intervalo=${INTERVALO_MS}ms). ` +
      `Edite expediente.json e ponha "ativo": true para ligar.`,
  );
  await tick(); // aplica o estado atual já no boot (se houver transição vs persistido)
  setInterval(() => {
    void tick();
  }, INTERVALO_MS);
}

void main();
