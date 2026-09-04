import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tratamentoErrado } from '../humano/tratamento.js';
import { logger } from '../logger.js';
import { writeJsonAtomicNode } from '../storage/atomic.js';
import {
  type ArquivoDespacho,
  acharItem,
  formatarDespacho,
  type ItemDespacho,
  parseComando,
  pendentes,
} from './despacho-core.js';
import type { GitHubIssues } from './github-issues.js';

export interface DespachoDeps {
  dataDir: string;
  connected(): boolean;
  selfJid(): string | null;
  sendText(jid: string, text: string): Promise<void>;
  /** Envio humanizado pro chat do cliente (mesmo caminho do /send com humano). */
  sendHumano(jid: string, texto: string, slug: string): Promise<void>;
  jidDoSlug(slug: string): string | null;
  github: GitHubIssues | null;
  intervaloMs?: number;
}

/** Despachos dos últimos N dias aceitam comando; o resto é histórico. */
const JANELA_COMANDOS_MS = 7 * 24 * 60 * 60_000;

const normalizar = (jid: string): string => jid.replace(/:\d+(?=@)/, '').toLowerCase();

/**
 * Fila de decisões do operador: envia cada despacho novo pro self-chat e executa
 * os comandos que ele responde ali (`ok N`, `não N`, `edita N: texto`, `ok todos`).
 * Vive no coletor porque precisa da sessão pra enviar e do fluxo de mensagens
 * pra ouvir. Estado é o próprio arquivo em `data/despacho/`.
 */
export class Despacho {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: DespachoDeps) {}

  async start(): Promise<void> {
    await this.tick().catch((err) => logger.error({ err }, 'despacho: tick falhou'));
    this.agendar();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private agendar(): void {
    this.timer = setTimeout(() => {
      void this.tick()
        .catch((err) => logger.error({ err }, 'despacho: tick falhou'))
        .finally(() => this.agendar());
    }, this.deps.intervaloMs ?? 30_000);
    this.timer.unref?.();
  }

  private dir(): string {
    return join(this.deps.dataDir, 'despacho');
  }

  private async listar(): Promise<Array<{ nome: string; arquivo: ArquivoDespacho }>> {
    let nomes: string[];
    try {
      nomes = (await readdir(this.dir())).filter((n) => n.endsWith('.json')).sort();
    } catch {
      return [];
    }
    const out: Array<{ nome: string; arquivo: ArquivoDespacho }> = [];
    for (const nome of nomes) {
      try {
        const arquivo = JSON.parse(
          await readFile(join(this.dir(), nome), 'utf8'),
        ) as ArquivoDespacho;
        if (typeof arquivo.passada === 'string' && Array.isArray(arquivo.itens))
          out.push({ nome, arquivo });
      } catch {
        // arquivo em escrita ou corrompido: ignora nesta rodada
      }
    }
    return out;
  }

  private async gravar(nome: string, arquivo: ArquivoDespacho): Promise<void> {
    await writeJsonAtomicNode(join(this.dir(), nome), arquivo);
  }

  /** Envia os despachos ainda não enviados pro self-chat do operador. */
  async tick(): Promise<{ enviados: number }> {
    let enviados = 0;
    const self = this.deps.selfJid();
    if (!self || !this.deps.connected()) return { enviados };
    for (const { nome, arquivo } of await this.listar()) {
      if (arquivo.enviadoEm) continue;
      await this.deps.sendText(self, formatarDespacho(arquivo));
      arquivo.enviadoEm = new Date().toISOString();
      await this.gravar(nome, arquivo);
      enviados++;
      logger.info({ passada: arquivo.passada, itens: arquivo.itens.length }, 'despacho: enviado');
    }
    return { enviados };
  }

  /** Trata uma mensagem do fluxo; só age em comando do operador no self-chat. */
  async onMensagem(msg: {
    fromMe: boolean;
    isDirect: boolean;
    groupJid: string;
    text: string;
  }): Promise<string | null> {
    const self = this.deps.selfJid();
    if (!msg.fromMe || !msg.isDirect || !self || normalizar(msg.groupJid) !== normalizar(self))
      return null;
    const cmd = parseComando(msg.text ?? '');
    if (!cmd) return null;

    const agora = Date.now();
    const recentes = (await this.listar()).filter(
      ({ arquivo }) => agora - Date.parse(arquivo.criadoEm) <= JANELA_COMANDOS_MS,
    );
    const arquivos = recentes.map((r) => r.arquivo);
    let resposta: string;

    if (cmd.tipo === 'edita') {
      const achado = acharItem(arquivos, cmd.n);
      resposta = achado
        ? await this.executar(achado.item, 'ok', cmd.texto)
        : `não achei o item ${cmd.n}.`;
    } else if (cmd.alvo === 'todos') {
      const ultimo = recentes.at(-1);
      const alvos = ultimo ? pendentes(ultimo.arquivo) : [];
      if (alvos.length === 0) resposta = 'nada pendente no último despacho.';
      else {
        const linhas: string[] = [];
        for (const item of alvos) linhas.push(await this.executar(item, cmd.tipo));
        resposta = linhas.join('\n');
      }
    } else {
      const achado = acharItem(arquivos, cmd.alvo);
      resposta = achado
        ? await this.executar(achado.item, cmd.tipo)
        : `não achei o item ${cmd.alvo}.`;
    }

    for (const { nome, arquivo } of recentes) await this.gravar(nome, arquivo);
    await this.deps.sendText(self, resposta);
    return resposta;
  }

  /** Executa um item e registra o resultado no próprio objeto (gravado pelo chamador). */
  private async executar(
    item: ItemDespacho,
    decisao: 'ok' | 'nao',
    textoNovo?: string,
  ): Promise<string> {
    if (item.executadoEm) return `${item.n} já foi resolvido (${item.resultado ?? 'sem detalhe'}).`;
    const marcar = (resultado: string): string => {
      item.executadoEm = new Date().toISOString();
      item.resultado = resultado;
      return resultado;
    };
    try {
      if (decisao === 'nao') {
        if (item.issue && this.deps.github) {
          await this.deps.github.comentar(
            item.issue.repo,
            item.issue.numero,
            'Descartada pelo operador no despacho.',
          );
          await this.deps.github.fechar(item.issue.repo, item.issue.numero);
        }
        return marcar(`🚫 ${item.n} descartado.`);
      }
      if (item.acao === 'enviar') {
        const texto = (textoNovo ?? item.texto ?? '').trim();
        if (!texto) return `${item.n} não tem texto pra enviar.`;
        const errado = tratamentoErrado(texto);
        if (errado.length)
          return `❌ ${item.n} não enviado: troque "${errado.join('", "')}" por você/vc e mande de novo.`;
        const jid = this.deps.jidDoSlug(item.slug);
        if (!jid) return `❌ ${item.n}: não sei o jid do chat ${item.slug}.`;
        if (textoNovo) item.texto = texto;
        await this.deps.sendHumano(jid, texto, item.slug);
        return marcar(`✅ ${item.n} enviada pra ${item.cliente}.`);
      }
      if (item.acao === 'label') {
        if (!item.issue || !item.label) return `${item.n} não tem issue ou label pra aplicar.`;
        if (!this.deps.github)
          return `❌ ${item.n}: sem token do GitHub no coletor (AGENTE_GITHUB_TOKEN).`;
        await this.deps.github.adicionarLabel(item.issue.repo, item.issue.numero, item.label);
        return marcar(`✅ ${item.n} marcado com ${item.label} (#${item.issue.numero}).`);
      }
      return `${item.n} não tem ação pra executar.`;
    } catch (err) {
      logger.error({ err, item: item.id }, 'despacho: falha ao executar');
      return `❌ ${item.n} falhou: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
