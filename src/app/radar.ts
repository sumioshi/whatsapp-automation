import { open, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from '../logger.js';
import { writeJsonAtomicNode } from '../storage/atomic.js';
import {
  calcularPendencias,
  deveEnviarDigest,
  type EntradaRadar,
  ehNomeLegivel,
  formatarDigest,
  formatarFone,
  hashPendencias,
  type Pendencia,
  RADAR_DEFAULTS,
  type RadarConfig,
} from './radar-core.js';
import {
  deveVerificarUpstream,
  formatarUpstream,
  novidadesUpstream,
  type UpstreamEstado,
  type UpstreamSnapshot,
} from './upstream-core.js';

/**
 * Radar de sem-resposta: a cada tick varre os chats, calcula pendências
 * (regras no radar-core) e manda digest pro PRÓPRIO operador quando o
 * conjunto muda. Vive no coletor — precisa da sessão pra enviar.
 */

export interface RadarDeps {
  dataDir: string;
  connected(): boolean;
  selfJid(): string | null;
  sendText(jid: string, text: string): Promise<void>;
  /** Última atividade conhecida do chat (unix SEGUNDOS, padrão do gateway). */
  lastActivityOf(slug: string): number | null;
  /** Telefone real de um user-part (LID→fone) pelo sidecar de contatos. */
  phoneOf(userPart: string): string | null;
  /** Vigia de upstream do Baileys; ausente = desligado. */
  upstream?: {
    versaoInstalada: string;
    buscar(): Promise<UpstreamSnapshot>;
  };
}

export interface RadarResumo {
  executadoEm: string;
  pendencias: Pendencia[];
  digestEnviado: boolean;
}

interface StatusFile {
  ultimaExecucao: string | null;
  proximaExecucao: string | null;
  config: RadarConfig;
  pendencias: Pendencia[];
  digest: { enviadoEm: string | null; hash: string | null };
  upstream: UpstreamStatus;
}

interface UpstreamStatus extends UpstreamEstado {
  verificadoEm: string | null;
}

const UPSTREAM_ZERO: UpstreamStatus = {
  ultimoSha: null,
  ultimaVersaoNpm: null,
  verificadoEm: null,
};

/** Bytes do fim do jsonl que bastam pra achar a última mensagem real. */
const TAIL_BYTES = 16 * 1024;

export class Radar {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private digest: { enviadoEm: string | null; hash: string | null } = {
    enviadoEm: null,
    hash: null,
  };
  private upstream: UpstreamStatus = { ...UPSTREAM_ZERO };

  constructor(private readonly deps: RadarDeps) {}

  private configPath(): string {
    return join(this.deps.dataDir, 'radar.config.json');
  }
  private statusPath(): string {
    return join(this.deps.dataDir, '.radar-status.json');
  }

  async start(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.statusPath(), 'utf8')) as Partial<StatusFile>;
      if (raw.digest) {
        this.digest = { enviadoEm: raw.digest.enviadoEm ?? null, hash: raw.digest.hash ?? null };
      }
      if (raw.upstream) {
        this.upstream = {
          ultimoSha: raw.upstream.ultimoSha ?? null,
          ultimaVersaoNpm: raw.upstream.ultimaVersaoNpm ?? null,
          verificadoEm: raw.upstream.verificadoEm ?? null,
        };
      }
    } catch {
      // primeiro boot — sem estado anterior
    }
    await this.agendar();
  }

  /** Config vigente — relida a cada tick (painel edita sem restart). */
  private async config(): Promise<RadarConfig> {
    try {
      const raw = JSON.parse(await readFile(this.configPath(), 'utf8')) as Partial<RadarConfig>;
      return { ...RADAR_DEFAULTS, ...raw };
    } catch {
      return { ...RADAR_DEFAULTS };
    }
  }

  private async agendar(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    const cfg = await this.config();
    const min = Math.max(1, cfg.intervaloMin);
    this.timer = setTimeout(() => {
      void this.tickNow('auto').catch((err) => logger.error({ err }, 'radar: tick falhou'));
    }, min * 60_000);
    this.timer.unref?.();
  }

  async tickNow(motivo: 'auto' | 'manual'): Promise<RadarResumo> {
    const cfg = await this.config();
    const agora = Date.now();
    let pendencias: Pendencia[] = [];
    if (cfg.ativo) {
      const entradas = await this.coletarEntradas();
      pendencias = calcularPendencias(entradas, agora, cfg);
    }

    let digestEnviado = false;
    const hash = hashPendencias(pendencias);
    const enviadoEmMs = this.digest.enviadoEm ? Date.parse(this.digest.enviadoEm) : null;
    if (
      cfg.ativo &&
      deveEnviarDigest(hash, this.digest.hash, enviadoEmMs, agora, cfg.digestCooldownMin) &&
      this.deps.connected()
    ) {
      const jid = this.deps.selfJid();
      if (jid) {
        try {
          await this.deps.sendText(jid, formatarDigest(pendencias));
          this.digest = { enviadoEm: new Date(agora).toISOString(), hash };
          digestEnviado = true;
        } catch (err) {
          logger.warn({ err }, 'radar: digest não enviado — tenta no próximo tick');
        }
      }
    }

    await this.vigiarUpstream(cfg, agora);

    const status: StatusFile = {
      ultimaExecucao: new Date(agora).toISOString(),
      proximaExecucao: new Date(agora + Math.max(1, cfg.intervaloMin) * 60_000).toISOString(),
      config: cfg,
      pendencias,
      digest: this.digest,
      upstream: this.upstream,
    };
    await writeJsonAtomicNode(this.statusPath(), status);
    logger.info({ motivo, pendencias: pendencias.length, digestEnviado }, 'radar: tick');
    await this.agendar();
    return { executadoEm: status.ultimaExecucao ?? '', pendencias, digestEnviado };
  }

  /**
   * Vigia de upstream: uma vez por `upstreamIntervaloH` busca a master do
   * Baileys e o npm; novidade vira aviso no self-chat. Primeira checagem só
   * marca o ponto de partida. Falha de rede não avança nada (tenta no próximo
   * tick) e nunca derruba o tick das pendências.
   */
  private async vigiarUpstream(cfg: RadarConfig, agora: number): Promise<void> {
    const dep = this.deps.upstream;
    if (!dep || !cfg.upstreamAtivo) return;
    const verificadoEmMs = this.upstream.verificadoEm
      ? Date.parse(this.upstream.verificadoEm)
      : null;
    if (!deveVerificarUpstream(verificadoEmMs, agora, cfg.upstreamIntervaloH)) return;
    let snap: UpstreamSnapshot;
    try {
      snap = await dep.buscar();
    } catch (err) {
      logger.warn({ err }, 'radar: upstream do Baileys indisponível — tenta no próximo tick');
      return;
    }
    const novidades = novidadesUpstream(snap, this.upstream, dep.versaoInstalada);
    const texto = formatarUpstream(novidades, dep.versaoInstalada);
    if (texto) {
      const jid = this.deps.connected() ? this.deps.selfJid() : null;
      if (!jid) {
        logger.warn('radar: upstream com novidade mas sessão fechada — tenta no próximo tick');
        return;
      }
      try {
        await this.deps.sendText(jid, texto);
      } catch (err) {
        logger.warn({ err }, 'radar: aviso de upstream não enviado — tenta no próximo tick');
        return;
      }
    }
    this.upstream = {
      ultimoSha: snap.commits[0]?.sha ?? this.upstream.ultimoSha,
      ultimaVersaoNpm: snap.versaoNpm ?? this.upstream.ultimaVersaoNpm,
      verificadoEm: new Date(agora).toISOString(),
    };
    logger.info(
      { commitsNovos: novidades.commitsNovos.length, versaoNova: novidades.versaoNova },
      'radar: upstream do Baileys verificado',
    );
  }

  /** Varre os diretórios de chat (grupos e DMs) e monta as entradas do core. */
  private async coletarEntradas(): Promise<EntradaRadar[]> {
    const muted = await this.lerMuted();
    const out: EntradaRadar[] = [];
    let dirs: string[] = [];
    try {
      dirs = (await readdir(this.deps.dataDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => d.name);
    } catch {
      return out;
    }
    for (const slug of dirs) {
      const ultima = await this.ultimaMensagem(slug);
      if (!ultima) continue;
      const lastActivityS = this.deps.lastActivityOf(slug);
      out.push({
        slug,
        nome: this.resolverNome(slug, ultima.nome),
        ultimaMsg: { fromMe: ultima.fromMe, timestampMs: ultima.timestampMs },
        lastActivityMs: lastActivityS !== null ? lastActivityS * 1000 : null,
        muted: Boolean(muted[slug]),
      });
    }
    return out;
  }

  /**
   * Nome de exibição da pendência: nome legível do rabo → senão, pro DM,
   * traduz LID→fone pelo sidecar e formata como telefone → senão o slug.
   */
  private resolverNome(slug: string, nomeDoRabo: string): string {
    if (ehNomeLegivel(nomeDoRabo)) return nomeDoRabo;
    const m = /^dm-(\d+)$/.exec(slug);
    if (m?.[1]) {
      const fone = this.deps.phoneOf(m[1]) ?? m[1];
      return formatarFone(fone);
    }
    return slug;
  }

  private async lerMuted(): Promise<Record<string, boolean>> {
    try {
      const raw = JSON.parse(await readFile(join(this.deps.dataDir, '.triage.json'), 'utf8')) as {
        muted?: Record<string, boolean>;
      };
      return raw.muted ?? {};
    } catch {
      return {};
    }
  }

  /** Última mensagem real (ignora chamadas) do rabo do jsonl do chat. */
  private async ultimaMensagem(
    slug: string,
  ): Promise<{ fromMe: boolean; timestampMs: number; nome: string } | null> {
    const path = join(this.deps.dataDir, slug, 'messages.jsonl');
    try {
      const { size } = await stat(path);
      if (size === 0) return null;
      const inicio = Math.max(0, size - TAIL_BYTES);
      const fh = await open(path, 'r');
      let texto: string;
      try {
        const buf = Buffer.alloc(size - inicio);
        await fh.read(buf, 0, buf.length, inicio);
        texto = buf.toString('utf8');
      } finally {
        await fh.close();
      }
      const linhas = texto.split('\n').filter(Boolean);
      // Última mensagem real define fromMe/timestamp; o NOME vem do último
      // senderName legível de mensagem RECEBIDA no rabo (número cru não serve).
      let ultima: { fromMe: boolean; timestampMs: number; grupo: string | null } | null = null;
      let nomeCliente: string | null = null;
      for (let i = linhas.length - 1; i >= 0; i--) {
        try {
          const m = JSON.parse(linhas[i] ?? '') as {
            fromMe?: boolean;
            timestamp?: string;
            type?: string;
            group?: string;
            senderName?: string;
          };
          if (m.type === 'call' || !m.timestamp) continue;
          const ts = Date.parse(m.timestamp);
          if (Number.isNaN(ts)) continue;
          ultima ??= {
            fromMe: Boolean(m.fromMe),
            timestampMs: ts,
            grupo: ehNomeLegivel(m.group) ? (m.group ?? null) : null,
          };
          if (!nomeCliente && !m.fromMe && ehNomeLegivel(m.senderName)) {
            nomeCliente = m.senderName ?? null;
          }
          if (ultima && (nomeCliente || ultima.grupo)) break;
        } catch {
          // linha cortada pelo recorte do tail — segue pra anterior
        }
      }
      if (!ultima) return null;
      return {
        fromMe: ultima.fromMe,
        timestampMs: ultima.timestampMs,
        nome: ultima.grupo ?? nomeCliente ?? '',
      };
    } catch {
      return null;
    }
  }
}
