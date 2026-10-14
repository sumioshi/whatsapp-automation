import { open, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../logger.js';
import { writeJsonAtomicNode } from '../storage/atomic.js';
import { fundirConversa } from '../storage/fundir-conversa.js';
import { type Buraco, detectarBuraco, precisaAvatar, proximaExecucaoMs, type RegistroTail } from './reconciler-core.js';

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
  /** Telefone real de um user-part (LID→fone), pelo sidecar de contatos. */
  phoneOf(userPart: string): string | null;
  /** URL da foto de perfil de um jid (null se não tem/erro). */
  avatarUrl(jid: string): Promise<string | null>;
  /** Baixa e grava a foto de um contato no diretório do slug. */
  saveAvatarDm(slug: string, url: string | null): Promise<boolean>;
}

export interface ReconcilerResumo {
  executadoEm: string;
  conectado: boolean;
  chatsVerificados: number;
  pedidosBackfill: number;
  aguardandoAncora: string[];
  duplicatasFundidas: number;
  avataresAtualizados: number;
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
/**
 * Teto de cada chamada externa do ciclo (WhatsApp ou download). Sem ele, uma
 * promessa que nunca resolve deixava `rodando` preso para sempre: e o ciclo para
 * de fundir DMs LID×telefone.
 */
const TETO_CHAMADA_MS = 90_000;
/** Ciclo que passou disso é dado como travado e não bloqueia o próximo. */
const CICLO_TRAVADO_MS = 15 * 60_000;

/** Rejeita se `p` não resolver em `ms` — a promessa original segue solta. */
export function comTeto<T>(p: Promise<T>, ms: number, rotulo: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<never>((_, rejeitar) => {
    timer = setTimeout(() => rejeitar(new Error(`${rotulo}: sem resposta em ${ms} ms`)), ms);
    timer.unref?.();
  });
  return Promise.race([p, teto]).finally(() => clearTimeout(timer));
}

export class Reconciler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private rodando = false;
  private rodandoDesde = 0;
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
    if (this.rodando && Date.now() - this.rodandoDesde > CICLO_TRAVADO_MS) {
      logger.warn(
        { desde: new Date(this.rodandoDesde).toISOString() },
        'Reconciliador: ciclo anterior travado, seguindo com um novo.',
      );
      this.rodando = false;
    }
    if (this.rodando) {
      return {
        executadoEm: new Date().toISOString(),
        conectado: this.deps.connected(),
        chatsVerificados: 0,
        pedidosBackfill: 0,
        aguardandoAncora: [],
        duplicatasFundidas: 0,
        avataresAtualizados: 0,
      };
    }
    this.rodando = true;
    this.rodandoDesde = Date.now();
    const resumo: ReconcilerResumo = {
      executadoEm: new Date().toISOString(),
      conectado: this.deps.connected(),
      chatsVerificados: 0,
      pedidosBackfill: 0,
      aguardandoAncora: [],
      duplicatasFundidas: 0,
      avataresAtualizados: 0,
    };
    try {
      // 1) DMs duplicadas (LID×telefone) — fusão local, independe da conexão.
      // Vem primeiro: não fica refém de chamada de rede dos passos seguintes.
      await this.fundirDuplicatasDm(resumo);

      if (resumo.conectado) {
        // 2) Nomes/renames — barato e idempotente (slug estável não fragmenta).
        await comTeto(this.deps.refreshGroups(), TETO_CHAMADA_MS, 'refreshGroups').catch((err) =>
          logger.warn({ err }, 'Reconciliador: refreshGroups falhou.'),
        );

        // 3) Buracos de histórico nos grupos monitorados.
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
      // 4) Fotos de perfil de contatos ativos (grupos já têm fluxo próprio).
      if (resumo.conectado) await this.atualizarAvataresDm(resumo);
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
      const ok = await comTeto(
        this.deps.fetchHistoryBefore(jid, buraco.ancora),
        TETO_CHAMADA_MS,
        'fetchHistoryBefore',
      );
      if (ok) {
        this.ancorasTentadas[slug] = buraco.ancora.id;
        resumo.pedidosBackfill++;
        logger.info({ slug, ancora: buraco.ancora.id }, '🕳️  Backfill pedido ao celular.');
      }
    } catch (err) {
      logger.warn({ err, slug }, 'Reconciliador: fetchMessageHistory falhou.');
    }
  }

  /**
   * Funde diretórios `dm-<lid>` no `dm-<telefone>` quando o sidecar de
   * contatos conhece o mapeamento (fonte confiável — nunca por nome). Pula
   * diretórios com escrita recente (o coletor pode estar gravando neles).
   */
  private async fundirDuplicatasDm(resumo: ReconcilerResumo): Promise<void> {
    const TETO_POR_TICK = 3;
    const ESCRITA_RECENTE_MS = 10 * 60_000;
    let dirs: string[];
    try {
      dirs = (await readdir(this.deps.dataDir)).filter((d) => d.startsWith('dm-'));
    } catch {
      return;
    }
    for (const dir of dirs) {
      if (resumo.duplicatasFundidas >= TETO_POR_TICK) return;
      const id = dir.slice(3);
      const fone = this.deps.phoneOf(id);
      if (!fone || fone === id) continue;
      const alvo = `dm-${fone}`;
      if (alvo === dir) continue;
      try {
        const s = await stat(join(this.deps.dataDir, dir, 'messages.jsonl'));
        if (Date.now() - s.mtimeMs < ESCRITA_RECENTE_MS) continue;
      } catch {
        // sem jsonl — fusão vira mover simples, segue
      }
      const r = await fundirConversa(this.deps.dataDir, alvo, dir);
      if (r.ok) {
        resumo.duplicatasFundidas++;
        logger.info({ de: dir, para: alvo }, '🧬 DM duplicada fundida.');
      }
    }
  }

  /**
   * Busca foto de perfil pros DMs ativos sem avatar (ou com avatar velho).
   * Teto por tick + pausa entre chamadas — foto de perfil tem rate limit.
   */
  private async atualizarAvataresDm(resumo: ReconcilerResumo): Promise<void> {
    const TETO_POR_TICK = 8;
    let dirs: string[];
    try {
      dirs = (await readdir(this.deps.dataDir)).filter((d) => d.startsWith('dm-'));
    } catch {
      return;
    }
    const agora = Date.now();
    for (const dir of dirs) {
      if (resumo.avataresAtualizados >= TETO_POR_TICK) return;
      let msgsMtime: number;
      try {
        msgsMtime = (await stat(join(this.deps.dataDir, dir, 'messages.jsonl'))).mtimeMs;
      } catch {
        continue;
      }
      let avatarMtime: number | null = null;
      try {
        avatarMtime = (await stat(join(this.deps.dataDir, dir, 'avatar.jpg'))).mtimeMs;
      } catch {
        // sem avatar ainda
      }
      if (!precisaAvatar(msgsMtime, avatarMtime, agora)) continue;

      const id = dir.slice(3);
      const fone = this.deps.phoneOf(id) ?? (/^\d{10,15}$/.test(id) ? id : null);
      if (!fone) continue; // LID sem telefone conhecido — sem jid discável
      try {
        const url = await comTeto(
          this.deps.avatarUrl(`${fone}@s.whatsapp.net`),
          TETO_CHAMADA_MS,
          'avatarUrl',
        );
        const ok = await comTeto(this.deps.saveAvatarDm(dir, url), TETO_CHAMADA_MS, 'saveAvatarDm');
        if (ok) {
          resumo.avataresAtualizados++;
          logger.info({ slug: dir }, '🖼️  Foto do contato atualizada.');
        } else if (avatarMtime === null) {
          // Sem foto disponível (privacidade/sem foto): não insistir a cada tick.
          // O mtime do jsonl segue guiando; o custo de re-tentar é 1 chamada — ok.
        }
        await new Promise((r) => setTimeout(r, 400));
      } catch (err) {
        logger.warn({ err, slug: dir }, 'Falha ao buscar foto do contato.');
      }
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
