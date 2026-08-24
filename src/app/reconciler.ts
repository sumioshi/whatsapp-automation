import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../logger.js';
import { writeJsonAtomicNode } from '../storage/atomic.js';
import { type Buraco, detectarBuraco, proximaExecucaoMs, type RegistroTail } from './reconciler-core.js';

/**
 * Reconciliador: de tempos em tempos (intervalo configurável pelo painel),
 * confere nomes de grupo e buracos de histórico, e pede backfill ao celular
 * quando há âncora. Vive DENTRO do coletor — a sessão Baileys é uma só e não
 * pode ser compartilhada com outro processo.
 */

export interface ReconcilerDeps {
  dataDir: string;
  connected(): boolean;
  refreshGroups(): Promise<void>;
  lastActivityOf(slug: string): number | null;
  fetchHistoryBefore(
    jid: string,
    ancora: { id: string; timestampMs: number; fromMe: boolean; sender: string },
  ): Promise<boolean>;
  watchedEntries(): Array<{ id: string; slug: string | undefined }>;
}

export interface ReconcilerResumo {
  executadoEm: string;
  conectado: boolean;
  chatsVerificados: number;
  pedidosBackfill: number;
  aguardandoAncora: string[];
}

interface StatusFile {
  ultimaExecucao: string | null;
  proximaExecucao: string | null;
  intervaloMin: number;
  resumo: ReconcilerResumo | null;
  /** slug -> última âncora já pedida (não repete pedido pra mesma âncora). */
  ancorasTentadas: Record<string, string>;
}

/** Teto de pedidos de histórico por tick — cada pedido acorda o celular. */
const MAX_PEDIDOS_POR_TICK = 5;
const DEFAULT_INTERVALO_MIN = 15;
/** Quantos bytes do fim do jsonl bastam pra detecção (≈ dezenas de msgs). */
const TAIL_BYTES = 64 * 1024;

export class Reconciler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private rodando = false;
  private ancorasTentadas: Record<string, string> = {};

  constructor(private readonly deps: ReconcilerDeps) {}

  private configPath(): string {
    return join(this.deps.dataDir, 'reconciler.config.json');
  }
  private statusPath(): string {
    return join(this.deps.dataDir, '.reconciler-status.json');
  }

  async start(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.statusPath(), 'utf8')) as Partial<StatusFile>;
      if (raw.ancorasTentadas) this.ancorasTentadas = raw.ancorasTentadas;
    } catch {
      // primeiro boot — sem estado anterior
    }
    await this.agendar();
  }

  /** Intervalo vigente — relido a cada agendamento (painel edita sem restart). */
  private async intervaloMin(): Promise<number> {
    try {
      const cfg = JSON.parse(await readFile(this.configPath(), 'utf8')) as {
        intervaloMin?: number;
      };
      if (typeof cfg.intervaloMin === 'number' && cfg.intervaloMin > 0) return cfg.intervaloMin;
    } catch {
      // sem config → default
    }
    return DEFAULT_INTERVALO_MIN;
  }

  private async agendar(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    const intervalo = await this.intervaloMin();
    const proxima = proximaExecucaoMs(Date.now(), intervalo);
    this.timer = setTimeout(() => {
      void this.tickNow('auto').catch((err) =>
        logger.error({ err }, 'Reconciliador: tick falhou.'),
      );
    }, proxima - Date.now());
    this.timer.unref?.();
    await this.persistStatus(null, proxima, intervalo);
  }

  /** Executa um ciclo agora (auto ou manual) e reagenda o próximo. */
  async tickNow(motivo: 'auto' | 'manual'): Promise<ReconcilerResumo> {
    if (this.rodando) {
      return {
        executadoEm: new Date().toISOString(),
        conectado: this.deps.connected(),
        chatsVerificados: 0,
        pedidosBackfill: 0,
        aguardandoAncora: [],
      };
    }
    this.rodando = true;
    const resumo: ReconcilerResumo = {
      executadoEm: new Date().toISOString(),
      conectado: this.deps.connected(),
      chatsVerificados: 0,
      pedidosBackfill: 0,
      aguardandoAncora: [],
    };
    try {
      if (resumo.conectado) {
        // 1) Nomes/renames — barato e idempotente (slug estável não fragmenta).
        await this.deps.refreshGroups().catch((err) =>
          logger.warn({ err }, 'Reconciliador: refreshGroups falhou.'),
        );

        // 2) Buracos de histórico nos grupos monitorados.
        for (const { id: jid, slug } of this.deps.watchedEntries()) {
          if (!slug) continue;
          resumo.chatsVerificados++;
          const tail = await this.lerTail(slug);
          const buraco = detectarBuraco(tail, this.deps.lastActivityOf(slug), Date.now());
          if (!buraco) continue;
          if (buraco.tipo === 'sem_ancora') {
            resumo.aguardandoAncora.push(slug);
            continue;
          }
          await this.pedirBackfill(jid, slug, buraco, resumo);
          if (resumo.pedidosBackfill >= MAX_PEDIDOS_POR_TICK) break;
        }
      }
      logger.info({ motivo, ...resumo }, '🔄 Reconciliador executado.');
    } finally {
      this.rodando = false;
      await this.agendarComResumo(resumo);
    }
    return resumo;
  }

  private async pedirBackfill(
    jid: string,
    slug: string,
    buraco: Extract<Buraco, { tipo: 'com_ancora' }>,
    resumo: ReconcilerResumo,
  ): Promise<void> {
    // Mesma âncora de antes = o celular não tinha mais nada; não insiste.
    if (this.ancorasTentadas[slug] === buraco.ancora.id) return;
    try {
      const ok = await this.deps.fetchHistoryBefore(jid, buraco.ancora);
      if (ok) {
        this.ancorasTentadas[slug] = buraco.ancora.id;
        resumo.pedidosBackfill++;
        logger.info({ slug, ancora: buraco.ancora.id }, '🕳️  Backfill pedido ao celular.');
      }
    } catch (err) {
      logger.warn({ err, slug }, 'Reconciliador: fetchMessageHistory falhou.');
    }
  }

  /** Últimos registros do messages.jsonl (só o rabo — leitura barata). */
  private async lerTail(slug: string): Promise<RegistroTail[]> {
    const path = join(this.deps.dataDir, slug, 'messages.jsonl');
    let fh: Awaited<ReturnType<typeof open>> | null = null;
    try {
      fh = await open(path, 'r');
      const { size } = await fh.stat();
      const inicio = Math.max(0, size - TAIL_BYTES);
      const buf = Buffer.alloc(size - inicio);
      await fh.read(buf, 0, buf.length, inicio);
      const linhas = buf.toString('utf8').split('\n');
      // Primeira linha pode estar cortada pelo recorte — descarta se não parseia.
      const out: RegistroTail[] = [];
      for (const linha of linhas) {
        if (!linha.trim()) continue;
        try {
          const r = JSON.parse(linha) as {
            id?: string;
            timestamp?: string;
            fromMe?: boolean;
            sender?: string;
          };
          if (!r.id || !r.timestamp) continue;
          out.push({
            id: r.id,
            timestampMs: new Date(r.timestamp).getTime(),
            fromMe: Boolean(r.fromMe),
            sender: r.sender ?? '',
          });
        } catch {
          // linha cortada/corrompida — ignora
        }
      }
      return out;
    } catch {
      return []; // diretório sem jsonl ainda
    } finally {
      await fh?.close();
    }
  }

  private async agendarComResumo(resumo: ReconcilerResumo): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    const intervalo = await this.intervaloMin();
    const proximaMs = proximaExecucaoMs(Date.now(), intervalo);
    this.timer = setTimeout(() => {
      void this.tickNow('auto').catch((err) =>
        logger.error({ err }, 'Reconciliador: tick falhou.'),
      );
    }, proximaMs - Date.now());
    this.timer.unref?.();
    await this.persistStatus(resumo, proximaMs, intervalo);
  }

  private async persistStatus(
    resumo: ReconcilerResumo | null,
    proximaMs: number,
    intervaloMin: number,
  ): Promise<void> {
    const status: StatusFile = {
      ultimaExecucao: resumo?.executadoEm ?? null,
      proximaExecucao: new Date(proximaMs).toISOString(),
      intervaloMin,
      resumo,
      ancorasTentadas: this.ancorasTentadas,
    };
    await writeJsonAtomicNode(this.statusPath(), status).catch((err) =>
      logger.warn({ err }, 'Reconciliador: falha ao gravar status.'),
    );
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
