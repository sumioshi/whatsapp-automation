/**
 * Worker da fila de entregas: agenda o visto e a digitação de cada ticket,
 * roda a entrega pelo gateway com um AbortController próprio, persiste o
 * estado em data/.fila-envio.json (retomado no boot) e registra cada
 * transição em data/.entregas.jsonl (o SSE do painel faz tail dele). Emite
 * 'entrega' com o ticket a cada transição.
 */
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WhatsAppGateway } from '../core/ports.js';
import { logger } from '../logger.js';
import { writeJsonAtomicNode } from '../storage/atomic.js';
import { quebrarEmBaloes } from './baloes.js';
import { foraDaFaixa, horaLocal, lerExpediente, proximaAbertura } from './expediente.js';
import {
  acharTicket,
  aoReiniciar,
  CONFIG_FILA,
  cancelar as cancelarCore,
  type EstadoFila,
  enfileirar as enfileirarNoEstado,
  filtrarRepetidos,
  haPendenteVencido,
  interromper,
  JANELA_REPETIDO_MS,
  marcarEntregando,
  marcarEntregue,
  marcarFalha,
  marcarLido,
  marcarProgresso,
  novoEstado,
  novoTicket,
  type OrigemTicket,
  podar,
  proximo,
  proximoDisparo,
  proximosParaLer,
  RecusaEnvio,
  type RefTicket,
  type Ticket,
  terminal,
  ticketVivo,
  type Urgencia,
} from './fila-core.js';
import { calcularLatencia, LATENCIA } from './latencia.js';
import { lerHistorico, loadPerfilEnvio, ultimaDoCliente } from './perfil.js';
import { planoDeEntrega } from './plano.js';
import { Presenca } from './presenca.js';
import { aoPresenca, aoReceberMensagem, type MsgVigia, type PresencaVigia } from './vigia.js';

export interface PedidoEnvio {
  jid: string;
  slug?: string;
  texto?: string;
  baloes?: string[];
  typos?: boolean;
  umBalao?: boolean;
  citar?: string;
  urgencia?: Urgencia;
  origem: OrigemTicket;
  decorrido_s?: number;
  latenciaMaxima_s?: number;
}

export interface DepsFila {
  dataDir: string;
  gateway: Pick<WhatsAppGateway, 'entregarHumano' | 'marcarLido' | 'sendPresence'>;
  conectado(): boolean;
  agora?: () => number;
  rng?: () => number;
}

const ARQUIVO_ESTADO = '.fila-envio.json';
const ARQUIVO_EVENTOS = '.entregas.jsonl';
const ARQUIVO_EQUIPE = '.team.json';
const EQUIPE_TTL_MS = 60_000;
const FUSO_PADRAO = 'America/Sao_Paulo';

export function resumoTicket(t: Ticket) {
  return {
    ticket: t.id,
    jid: t.jid,
    slug: t.slug,
    estado: t.estado,
    motivo: t.motivo ?? null,
    enviados: t.enviados,
    total: t.total,
    previsao_s: t.previsao_s,
    duracao_s: t.duracao_s,
    entregarEm: new Date(t.entregarEm).toISOString(),
    lerEm: new Date(t.lerEm).toISOString(),
    iniciadoEm: t.iniciadoEm ? new Date(t.iniciadoEm).toISOString() : null,
    regime: t.regime,
    mensagensNovas: t.mensagensNovas,
    origem: t.origem,
  };
}

export type ResumoTicket = ReturnType<typeof resumoTicket>;

export interface ResultadoEnfileirar {
  ticket: Ticket;
  /** Balões do pedido que repetiam mensagem recente e não entraram no ticket. */
  descartados: string[];
  substituiu?: string;
  substituiu_enviados?: number;
  substituiu_baloes_enviados?: string[];
}

export class FilaEnvio extends EventEmitter {
  private estado: EstadoFila = novoEstado();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly controllers = new Map<string, AbortController>();
  private readonly presenca: Presenca;
  private equipe: { ids: Set<string>; lidoEm: number } = { ids: new Set(), lidoEm: 0 };
  private parado = false;
  /** Gravações encadeadas: duas no mesmo instante colidiriam no nome do tmp. */
  private gravacao: Promise<void> = Promise.resolve();
  private readonly agora: () => number;
  private readonly rng: () => number;

  private constructor(
    private readonly deps: DepsFila,
    presencaAtiva: boolean,
  ) {
    super();
    this.agora = deps.agora ?? Date.now;
    this.rng = deps.rng ?? Math.random;
    this.presenca = new Presenca(deps.gateway, presencaAtiva, this.rng);
  }

  static async carregar(deps: DepsFila): Promise<FilaEnvio> {
    const cfg = await lerExpediente(deps.dataDir);
    const presencaAtiva =
      process.env.WAC_PRESENCA_COERENTE !== '0' && cfg?.presencaCoerente !== false;
    const f = new FilaEnvio(deps, presencaAtiva);
    try {
      const raw = JSON.parse(
        await readFile(join(deps.dataDir, ARQUIVO_ESTADO), 'utf8'),
      ) as EstadoFila;
      if (raw?.versao === 1 && Array.isArray(raw.tickets)) f.estado = { ...novoEstado(), ...raw };
    } catch {
      /* primeiro boot ou arquivo inválido: fila vazia */
    }
    const agora = f.agora();
    const estavamEntregando = f.estado.tickets.filter((t) => t.estado === 'entregando');
    aoReiniciar(f.estado, agora);
    for (const t of estavamEntregando) f.emitir(t);
    await f.persistir();
    f.reagendar();
    return f;
  }

  listar(): Ticket[] {
    return this.estado.tickets.filter((t) => !terminal(t));
  }

  status(ref: RefTicket): Ticket | null {
    return acharTicket(this.estado, ref) ?? null;
  }

  async enfileirar(p: PedidoEnvio): Promise<ResultadoEnfileirar> {
    const agora = this.agora();
    const slug = p.slug ?? p.jid.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const perfil = await loadPerfilEnvio(p.slug, this.deps.dataDir);
    const explicitos = (p.baloes ?? []).map((b) => b.trim()).filter(Boolean);
    const texto = (p.texto ?? '').trim();
    const rascunho = explicitos.length
      ? explicitos
      : p.umBalao
        ? [texto]
        : quebrarEmBaloes(texto, perfil);
    if (!rascunho.length) throw new RecusaEnvio('nada a enviar');

    const historico = p.slug ? await lerHistorico(this.deps.dataDir, p.slug) : [];
    // Trava contra a mesma mensagem duas vezes: o que a conta já mandou há pouco
    // (histórico) e o que o ticket vivo deste chat já entregou (o eco pode ainda
    // não estar gravado) não saem de novo, venha o pedido de onde vier.
    const vivo = ticketVivo(this.estado, p.jid);
    const recentes = [
      ...historico
        .filter(
          (m) => m.fromMe && m.text && agora - new Date(m.timestamp).getTime() < JANELA_REPETIDO_MS,
        )
        .map((m) => m.text as string),
      ...(vivo ? vivo.baloes.slice(0, vivo.enviados) : []),
    ];
    const { mantidos: baloes, descartados } = filtrarRepetidos(rascunho, recentes);
    if (!baloes.length) {
      throw new RecusaEnvio(
        `nada novo a enviar: ${descartados.length} balão(ões) repetem mensagem já enviada neste chat nos últimos 30 min`,
      );
    }
    const ultima = ultimaDoCliente(historico, await this.lerEquipe());
    const cfg = await lerExpediente(this.deps.dataDir);
    const agoraDate = new Date(agora);
    const fora = cfg?.ativo === true && foraDaFaixa(agoraDate, cfg);
    const abertura = fora && cfg?.segurarEnvios ? proximaAbertura(agoraDate, cfg) : null;
    const { hora, diaSemana } = horaLocal(agoraDate, cfg?.timezone ?? FUSO_PADRAO);

    const lat = calcularLatencia(
      {
        gapDesdeCliente_s: ultima ? (agora - ultima.ts) / 1000 : null,
        hora,
        diaSemana,
        latenciaClienteMediana_s: perfil.latenciaClienteMediana_s,
        latenciaOperadorMediana_s: perfil.latenciaMediana_s,
        foraDoExpediente: fora,
        segurarPor_s: abertura ? (abertura.getTime() - agora) / 1000 : null,
        urgencia: p.urgencia ?? 'normal',
        decorrido_s: p.decorrido_s ?? 0,
        latenciaMaxima_s: p.latenciaMaxima_s ?? LATENCIA.latenciaMaximaPadrao_s,
      },
      this.rng,
    );
    const ticket = novoTicket({
      id: randomUUID().slice(0, 8),
      jid: p.jid,
      slug,
      baloes,
      origem: p.origem,
      opts: {
        typos: p.typos === true,
        umBalao: p.umBalao === true,
        urgencia: p.urgencia ?? 'normal',
        ...(p.citar ? { citar: p.citar } : {}),
      },
      criadoEm: agora,
      lerEm: agora + Math.round(lat.esperaAteLer_s * 1000),
      entregarEm: agora + Math.round(lat.esperaAteDigitar_s * 1000),
      regime: lat.regime,
      ...(perfil.charsPorSegundo ? { cps: perfil.charsPorSegundo } : {}),
    });
    const r = enfileirarNoEstado(this.estado, ticket, agora);
    if (r.anterior) {
      this.abortar(r.anterior.id);
      this.emitir(r.anterior);
    }
    this.emitir(ticket);
    await this.persistir();
    this.reagendar();
    logger.info(
      {
        ticket: ticket.id,
        jid: p.jid,
        previsao_s: ticket.previsao_s,
        duracao_s: ticket.duracao_s,
        regime: ticket.regime,
        ...(descartados.length ? { descartados: descartados.length } : {}),
      },
      '🎫 Entrega agendada.',
    );
    return {
      ticket,
      descartados,
      ...(r.anterior
        ? {
            substituiu: r.anterior.id,
            substituiu_enviados: r.anterior.enviados,
            substituiu_baloes_enviados: r.anterior.baloes.slice(0, r.anterior.enviados),
          }
        : {}),
    };
  }

  cancelar(ref: RefTicket): Ticket | null {
    const t = cancelarCore(this.estado, ref, this.agora());
    if (!t) return null;
    this.abortar(t.id);
    this.emitir(t);
    void this.persistir();
    this.reagendar();
    return t;
  }

  /** Resolve quando o ticket chega a um estado terminal; abortar o sinal cancela o ticket. */
  aguardar(id: string, signal?: AbortSignal): Promise<Ticket> {
    return new Promise((resolve) => {
      const t = this.status({ ticket: id });
      if (!t) {
        resolve({ ...ticketVazio(id), estado: 'cancelado' });
        return;
      }
      if (terminal(t)) {
        resolve(t);
        return;
      }
      const onEntrega = (x: Ticket) => {
        if (x.id !== id || !terminal(x)) return;
        this.off('entrega', onEntrega);
        signal?.removeEventListener('abort', onAbort);
        resolve(x);
      };
      const onAbort = () => {
        this.cancelar({ ticket: id });
      };
      this.on('entrega', onEntrega);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  aoMensagem(msg: MsgVigia): void {
    const r = aoReceberMensagem(this.estado, msg, this.equipe.ids, this.agora(), this.rng);
    if (!r) return;
    if (r.acao === 'interrompeu') this.abortar(r.ticket.id);
    this.emitir(r.ticket);
    void this.persistir();
    this.reagendar();
  }

  aoPresenca(p: PresencaVigia): void {
    if (aoPresenca(this.estado, p, this.agora())) this.reagendar();
  }

  /** Para timers e entregas em andamento; resolve quando a última gravação terminar. */
  parar(): Promise<void> {
    this.parado = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.presenca.parar();
    for (const ac of this.controllers.values()) ac.abort(new Error('coletor encerrando'));
    return this.gravacao;
  }

  // ---- internos ----

  /**
   * Um timer só: acorda no próximo visto/digitação, no fim do intervalo entre
   * chats ou quando o cliente parar de digitar. Travado só pelo cap de
   * simultâneas, não agenda nada — o fim de uma entrega reagenda.
   */
  private reagendar(): void {
    if (this.parado) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const agora = this.agora();
    const cands: number[] = [];
    const prox = proximoDisparo(this.estado);
    if (prox !== null) cands.push(prox);
    if (haPendenteVencido(this.estado, agora)) {
      const intervalo = this.estado.ultimoInicio + CONFIG_FILA.intervaloEntreChats_ms;
      if (intervalo > agora) cands.push(intervalo);
      for (const [jid, d] of Object.entries(this.estado.clienteDigitando)) {
        if (d.ate > agora && ticketVivo(this.estado, jid)) {
          cands.push(Math.min(d.ate, d.desde + CONFIG_FILA.tetoEsperaDigitando_ms + 1));
        }
      }
    }
    if (!cands.length) return;
    const alvo = Math.min(...cands);
    if (
      alvo <= agora &&
      !proximo(this.estado, agora) &&
      !proximosParaLer(this.estado, agora).length &&
      cands.every((c) => c <= agora)
    ) {
      return;
    }
    this.timer = setTimeout(() => void this.tick(), Math.max(0, alvo - agora));
  }

  private async tick(): Promise<void> {
    if (this.parado) return;
    const agora = this.agora();
    for (const t of proximosParaLer(this.estado, agora)) {
      marcarLido(this.estado, t.id, agora);
      if (this.deps.conectado()) {
        await this.deps.gateway.marcarLido(t.jid);
        this.presenca.aoLer();
      }
    }
    let t: Ticket | null = proximo(this.estado, agora);
    while (t) {
      if (t.mensagensNovas > 0) {
        // O cliente falou depois que a resposta foi escrita: não sai nada,
        // o agente regenera com o contexto novo.
        interromper(this.estado, { ticket: t.id }, 'mensagem_nova', agora);
        this.emitir(t);
        t = proximo(this.estado, agora);
        continue;
      }
      marcarEntregando(this.estado, t.id, agora);
      if (!this.deps.conectado()) {
        marcarFalha(this.estado, t.id, 0, agora);
        this.emitir(t);
        t = proximo(this.estado, agora);
        continue;
      }
      this.emitir(t);
      void this.executar(t);
      break; // intervalo entre chats: o próximo tick decide
    }
    podar(this.estado, agora);
    await this.persistir();
    this.reagendar();
  }

  private async executar(t: Ticket): Promise<void> {
    const ac = new AbortController();
    this.controllers.set(t.id, ac);
    let fechadoFora = false;
    try {
      const perfil = await loadPerfilEnvio(t.slug, this.deps.dataDir);
      const ultima = ultimaDoCliente(
        await lerHistorico(this.deps.dataDir, t.slug),
        this.equipe.ids,
      );
      const plano = planoDeEntrega(t.baloes, perfil, {
        typos: t.opts.typos,
        msgRecebidaChars: ultima?.chars,
        ...(t.opts.citar ? { citar: t.opts.citar } : {}),
        rng: this.rng,
      });
      this.presenca.aoEntregar();
      // Contagem atualizada a cada balão: quem cancela ou interrompe no meio
      // (e o status) vê o que já saiu, sem esperar a entrega terminar.
      const r = await this.deps.gateway.entregarHumano(t.jid, plano, ac.signal, (enviados) => {
        marcarProgresso(this.estado, t.id, enviados, this.agora());
        void this.persistir();
      });
      fechadoFora = terminal(t);
      marcarEntregue(this.estado, t.id, r.enviados, this.agora());
      logger.info(
        { ticket: t.id, jid: t.jid, enviados: r.enviados, total: r.total, estado: t.estado },
        r.cancelado ? '📵 Entrega interrompida.' : '📤🧍 Entrega concluída.',
      );
    } catch (err) {
      const m = /\((\d+) enviado/.exec(err instanceof Error ? err.message : '');
      fechadoFora = terminal(t);
      marcarFalha(this.estado, t.id, m ? Number(m[1]) : 0, this.agora());
      logger.warn({ err, ticket: t.id, jid: t.jid, estado: t.estado }, '⚠️ Entrega falhou.');
    } finally {
      this.controllers.delete(t.id);
      this.presenca.aoTerminar();
      // Fechado por fora (cancelar/interromper) já foi emitido na hora, com a
      // contagem certa; repetir aqui daria dois fechamentos pro mesmo ticket.
      if (!fechadoFora) this.emitir(t);
      await this.persistir();
      this.reagendar();
    }
  }

  private abortar(id: string): void {
    this.controllers.get(id)?.abort(new Error('ticket encerrado'));
  }

  private emitir(t: Ticket): void {
    this.emit('entrega', t);
    const linha = { ts: new Date(this.agora()).toISOString(), ...resumoTicket(t) };
    appendFile(join(this.deps.dataDir, ARQUIVO_EVENTOS), `${JSON.stringify(linha)}\n`).catch(
      () => {},
    );
  }

  private persistir(): Promise<void> {
    this.gravacao = this.gravacao.then(async () => {
      try {
        await writeJsonAtomicNode(join(this.deps.dataDir, ARQUIVO_ESTADO), this.estado);
      } catch (err) {
        logger.warn({ err }, 'fila: não gravou o estado (segue em memória).');
      }
    });
    return this.gravacao;
  }

  private async lerEquipe(): Promise<Set<string>> {
    const agora = this.agora();
    if (agora - this.equipe.lidoEm < EQUIPE_TTL_MS) return this.equipe.ids;
    try {
      const raw = JSON.parse(
        await readFile(join(this.deps.dataDir, ARQUIVO_EQUIPE), 'utf8'),
      ) as unknown;
      const ids = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
      this.equipe = { ids: new Set(ids), lidoEm: agora };
    } catch {
      this.equipe = { ids: new Set(), lidoEm: agora };
    }
    return this.equipe.ids;
  }
}

function ticketVazio(id: string): Ticket {
  return novoTicket({
    id,
    jid: '',
    slug: '',
    baloes: [],
    origem: 'api',
    opts: { typos: false, umBalao: false, urgencia: 'normal' },
    criadoEm: 0,
    lerEm: 0,
    entregarEm: 0,
    regime: 'agora',
  });
}
