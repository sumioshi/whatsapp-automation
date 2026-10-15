/**
 * Quanto esperar antes de ler e antes de digitar, como uma pessoa que trabalha
 * e responde no WhatsApp: regime ativo (conversa em curso) ou frio (mensagem
 * parada), reciprocidade com o ritmo do cliente, hora do dia, expediente.
 * Puro, rng injetável — todo número vem da pesquisa citada na spec.
 */
import type { Regime, Urgencia } from './fila-core.js';

export interface EntradaLatencia {
  /** Segundos desde a última mensagem do cliente; null = nenhuma conhecida. */
  gapDesdeCliente_s: number | null;
  /** Hora local (0–23) e dia da semana (0 = domingo) no fuso do expediente. */
  hora: number;
  diaSemana: number;
  latenciaClienteMediana_s: number | null;
  latenciaOperadorMediana_s: number | null;
  foraDoExpediente: boolean;
  /** Segundos até a próxima abertura do expediente (só com `segurarEnvios`). */
  segurarPor_s: number | null;
  urgencia: Urgencia;
  /** Segundos que o agente já gastou desde que leu a mensagem. */
  decorrido_s: number;
  latenciaMaxima_s: number;
  /** Segundos para assistir/ouvir/ler o que o cliente mandou (ver `estimarConsumo`). */
  consumo_s?: number;
  /**
   * Quanto uma pessoa levaria entre ler e mandar ESTA resposta (estimativa do agente:
   * um "blz" são segundos; corrigir um bug e subir, dezenas de minutos). Só uma fração
   * vira espera, e o tempo que o agente já gastou desconta.
   */
  tempoHumano_s?: number | null;
}

/** O que conta para o tempo de consumo: cada mensagem do cliente ainda sem resposta. */
export interface MsgConsumo {
  type?: string;
  text?: string;
  duracao_s?: number;
  paginas?: number;
}

export interface SaidaLatencia {
  esperaAteLer_s: number;
  esperaAteDigitar_s: number;
  regime: Regime;
}

export const LATENCIA = {
  ativaGapMax_s: 13 * 60,
  ativaMediana_s: 30,
  ativaSigma: 0.9,
  ativaMin_s: 5,
  ativaMax_s: 240,
  /** [de_s, ate_s, fração] — 56 % em 1 min, 12 % até 5 min, 18 % até 1 h, 12 % até 4 h. */
  faixasFrias: [
    [5, 60, 0.56],
    [60, 300, 0.12],
    [300, 3600, 0.18],
    [3600, 14_400, 0.12],
  ] as ReadonlyArray<readonly [number, number, number]>,
  friaResto_s: 14_400,
  janelaCancelamento_s: 5,
  latenciaMaximaPadrao_s: 4 * 3600,
  foraExpedienteFator: 2.5,
  fimDeSemanaFator: 1.5,
  lerFracao: 0.4,
  lerSigma: 0.5,
  lerPisoAtiva_s: 2,
  /** Teto do piso de consumo/tempo humano: um pouco mais lento que hoje, nunca 20 min parado. */
  pisoTeto_s: 240,
  /** Tempo humano t vira ~ pisoBase_s·√(t/60) de espera: 20 min → ~2,2 min; 5 s → ~9 s. */
  pisoBase_s: 30,
  pisoSigma: 0.35,
  /** Vídeo: pula trecho ou volta (0,6–1,3×); áudio: às vezes acelerado (0,5–1,1×). */
  consumoVideo: [0.6, 1.3] as const,
  consumoAudio: [0.5, 1.1] as const,
  consumoVideoPadrao_s: 45,
  consumoAudioPadrao_s: 20,
  consumoPaginaMediana_s: 40,
  consumoDocPaginasPadrao: 2,
  consumoDocTeto_s: 300,
  consumoImagemMediana_s: 4,
  /** Leitura de texto ~200 palavras/min. */
  leituraCharsPorS: 17,
};

/** Normal padrão por Box-Muller (com seno: rng constante 0,5 dá z = 0, a mediana exata). */
function normal(rng: () => number): number {
  const u1 = Math.min(Math.max(rng(), 1e-12), 1 - 1e-12);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
}

export function lognormal(mediana: number, sigma: number, rng: () => number): number {
  return mediana * Math.exp(sigma * normal(rng));
}

export function fatorHora(hora: number, diaSemana: number): number {
  const h = hora < 7 ? 4 : hora < 9 ? 1.5 : hora < 21 ? 1 : 1.8;
  const fds = diaSemana === 0 || diaSemana === 6 ? LATENCIA.fimDeSemanaFator : 1;
  return h * fds;
}

function sortearFria(rng: () => number): number {
  const u = rng();
  let acc = 0;
  for (const [de, ate, frac] of LATENCIA.faixasFrias) {
    acc += frac;
    if (u < acc) {
      // log-uniforme dentro da faixa: a massa fica perto do começo, como no dado real
      const v = rng();
      return Math.exp(Math.log(de) + v * (Math.log(ate) - Math.log(de)));
    }
  }
  return LATENCIA.friaResto_s;
}

const uniforme = (de: number, ate: number, rng: () => number): number => de + rng() * (ate - de);

/** Tempo, sorteado a cada chamada, para consumir o que o cliente mandou desde a última resposta. */
export function estimarConsumo(msgs: MsgConsumo[], rng: () => number = Math.random): number {
  let total = 0;
  for (const m of msgs) {
    const dur = typeof m.duracao_s === 'number' && m.duracao_s > 0 ? m.duracao_s : null;
    if (m.type === 'video') {
      total += (dur ?? LATENCIA.consumoVideoPadrao_s) * uniforme(...LATENCIA.consumoVideo, rng);
    } else if (m.type === 'audio') {
      total += (dur ?? LATENCIA.consumoAudioPadrao_s) * uniforme(...LATENCIA.consumoAudio, rng);
    } else if (m.type === 'document') {
      const paginas = m.paginas && m.paginas > 0 ? m.paginas : LATENCIA.consumoDocPaginasPadrao;
      let doc = 0;
      for (let i = 0; i < paginas && doc < LATENCIA.consumoDocTeto_s; i++)
        doc += lognormal(LATENCIA.consumoPaginaMediana_s, 0.5, rng);
      total += Math.min(doc, LATENCIA.consumoDocTeto_s);
    } else if (m.type === 'image') {
      total += lognormal(LATENCIA.consumoImagemMediana_s, 0.4, rng);
    }
    total += (m.text ?? '').length / LATENCIA.leituraCharsPorS;
  }
  return total;
}

/** Fração do tempo humano que vira espera: cresce com a raiz, então tarefa longa pesa pouco. */
function pisoTempoHumano(t: number, rng: () => number): number {
  return lognormal(LATENCIA.pisoBase_s * Math.sqrt(t / 60), LATENCIA.pisoSigma, rng);
}

const mediaGeometrica = (xs: number[]): number =>
  Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length);

const round1 = (x: number): number => Math.round(x * 10) / 10;

export function calcularLatencia(
  e: EntradaLatencia,
  rng: () => number = Math.random,
): SaidaLatencia {
  // Consumo começa quando a mensagem chega: o que já passou desde ela não espera de novo.
  const pisoConsumo = Math.max(0, (e.consumo_s ?? 0) - Math.max(0, e.gapDesdeCliente_s ?? 0));
  const tetoChat = Math.max(LATENCIA.janelaCancelamento_s, e.latenciaMaxima_s);

  if (e.urgencia === 'agora') {
    // "Cliente esperando um ok" não pula o tempo de assistir o vídeo que ele mandou.
    const piso = Math.min(pisoConsumo, LATENCIA.pisoTeto_s, tetoChat);
    return {
      esperaAteLer_s: 0,
      esperaAteDigitar_s: round1(Math.max(LATENCIA.janelaCancelamento_s, piso)),
      regime: 'agora',
    };
  }
  const ativa =
    e.urgencia !== 'calma' &&
    e.gapDesdeCliente_s !== null &&
    e.gapDesdeCliente_s < LATENCIA.ativaGapMax_s;
  const regime: Regime = ativa ? 'ativa' : 'fria';

  let alvo = ativa
    ? Math.min(
        Math.max(lognormal(LATENCIA.ativaMediana_s, LATENCIA.ativaSigma, rng), LATENCIA.ativaMin_s),
        LATENCIA.ativaMax_s,
      )
    : sortearFria(rng);

  const fatores = [alvo];
  if (e.latenciaClienteMediana_s && e.latenciaClienteMediana_s > 0)
    fatores.push(e.latenciaClienteMediana_s);
  if (e.latenciaOperadorMediana_s && e.latenciaOperadorMediana_s > 0)
    fatores.push(e.latenciaOperadorMediana_s);
  alvo = Math.max(LATENCIA.ativaMin_s, mediaGeometrica(fatores));

  alvo *= fatorHora(e.hora, e.diaSemana);
  const segurando = e.foraDoExpediente && !!e.segurarPor_s && e.segurarPor_s > 0;
  if (e.foraDoExpediente) {
    if (segurando) alvo = Math.max(alvo, e.segurarPor_s as number);
    else alvo *= LATENCIA.foraExpedienteFator;
  }
  if (ativa && !segurando) alvo = Math.min(alvo, LATENCIA.ativaMax_s);

  let espera = Math.max(LATENCIA.janelaCancelamento_s, alvo - Math.max(0, e.decorrido_s));
  const pisoHumano =
    e.tempoHumano_s && e.tempoHumano_s > 0
      ? pisoTempoHumano(e.tempoHumano_s, rng) - Math.max(0, e.decorrido_s)
      : 0;
  const piso = Math.min(Math.max(pisoConsumo, pisoHumano), LATENCIA.pisoTeto_s);
  espera = Math.max(espera, piso);
  espera = Math.min(espera, tetoChat);

  let ler = Math.min(espera, lognormal(LATENCIA.lerFracao * espera, LATENCIA.lerSigma, rng));
  // O visto sai antes de assistir/ler: o consumo fica entre o visto e o digitando.
  if (pisoConsumo > 0) ler = Math.min(ler, Math.max(0, espera - pisoConsumo));
  if (ativa) ler = Math.max(ler, Math.min(espera, LATENCIA.lerPisoAtiva_s));

  return { esperaAteLer_s: round1(ler), esperaAteDigitar_s: round1(espera), regime };
}
