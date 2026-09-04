import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tratamentoErrado } from '../humano/tratamento.js';
import { logger } from '../logger.js';
import { writeJsonAtomicNode } from '../storage/atomic.js';
import {
  type ArquivoDespacho,
  acharItem,
  type Comando,
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

/** Resultado de uma execução: `texto` é a linha pro operador, `ok` diz se foi
 * uma execução válida (sucesso ou descarte) — usado pra montar a contagem do
 * `ok todos`. Só falha real (❌) conta como não-ok. */
interface ResultadoExecucao {
  texto: string;
  ok: boolean;
}

/**
 * Fila de decisões do operador: envia cada despacho novo pro self-chat e executa
 * os comandos que ele responde ali (`ok N`, `não N`, `edita N: texto`, `ok todos`).
 * Vive no coletor porque precisa da sessão pra enviar e do fluxo de mensagens
 * pra ouvir. Estado é o próprio arquivo em `data/despacho/`.
 */
export class Despacho {
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * `tick()` e `onMensagem()` fazem leitura-modificação-escrita nos mesmos
   * arquivos (o painel também escreve, mas isso é outro processo — aqui é
   * dentro do MESMO Despacho). Sem serializar, os dois disputam a mesma
   * escrita atômica (`writeJsonAtomicNode` usa um nome de tmp por
   * pid+timestamp — duas escritas no mesmo milissegundo colidem) e, pior,
   * cada um pode gravar por cima do outro com uma cópia em memória obsoleta
   * (ex.: onMensagem() grava sua cópia sem o `enviadoEm` que um tick()
   * concorrente acabou de escrever, apagando o envio). A fila encadeia toda
   * chamada nesta promise: cada `tick()`/`onMensagem()` só roda depois que o
   * anterior terminou (sucesso ou erro), nunca dois ao mesmo tempo.
   */
  private fila: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: DespachoDeps) {}

  private serializar<T>(fn: () => Promise<T>): Promise<T> {
    const resultado = this.fila.then(fn, fn);
    // Encadeia o PRÓXIMO passo da fila nesta chamada, mas sem deixar uma
    // rejeição travar as chamadas seguintes — o `.catch(() => {})` aqui é só
    // pra fila continuar andando; o erro real ainda propaga em `resultado`,
    // que é o que o chamador recebe e pode tratar/logar.
    this.fila = resultado.catch(() => {});
    return resultado;
  }

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
    return this.serializar(() => this.tickImpl());
  }

  private async tickImpl(): Promise<{ enviados: number }> {
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
    return this.serializar(() => this.onMensagemImpl(self, cmd));
  }

  private async onMensagemImpl(self: string, cmd: Comando): Promise<string> {
    const agora = Date.now();
    const recentes = (await this.listar()).filter(
      ({ arquivo }) => agora - Date.parse(arquivo.criadoEm) <= JANELA_COMANDOS_MS,
    );
    const arquivos = recentes.map((r) => r.arquivo);
    // Só grava de volta o(s) arquivo(s) cujo item foi de fato tocado nesta
    // chamada — nunca todo `recentes`. O mutex serializa tick()/onMensagem()
    // ENTRE SI, mas o painel (outro processo) pode escrever num desses
    // arquivos entre o `listar()` acima e a gravação abaixo; regravar um
    // arquivo que não mudou nesta chamada arriscaria sobrescrever essa
    // escrita externa com a cópia obsoleta que só lemos de passagem.
    const tocados = new Set<string>();
    const marcarTocado = (arquivoAlvo: ArquivoDespacho): void => {
      const achado = recentes.find((r) => r.arquivo === arquivoAlvo);
      if (achado) tocados.add(achado.nome);
    };
    let resposta: string;

    if (cmd.tipo === 'edita') {
      const achado = acharItem(arquivos, cmd.n);
      if (achado) {
        marcarTocado(achado.arquivo);
        resposta = (await this.executar(achado.item, 'ok', cmd.texto)).texto;
      } else {
        resposta = `não achei o item ${cmd.n}.`;
      }
    } else if (cmd.alvo === 'todos') {
      const ultimo = recentes.at(-1);
      const alvos = ultimo ? pendentes(ultimo.arquivo) : [];
      if (alvos.length === 0) {
        resposta = 'nada pendente no último despacho.';
      } else {
        if (ultimo) marcarTocado(ultimo.arquivo);
        const resultados: ResultadoExecucao[] = [];
        for (const item of alvos) resultados.push(await this.executar(item, cmd.tipo));
        const executados = resultados.filter((r) => r.ok).length;
        const falhas = resultados.length - executados;
        const tally =
          falhas > 0
            ? `${executados} executado${executados === 1 ? '' : 's'}, ${falhas} falhou${falhas === 1 ? '' : 'ram'}:\n`
            : '';
        resposta = tally + resultados.map((r) => r.texto).join('\n');
      }
    } else {
      const achado = acharItem(arquivos, cmd.alvo);
      if (achado) {
        marcarTocado(achado.arquivo);
        resposta = (await this.executar(achado.item, cmd.tipo)).texto;
      } else {
        resposta = `não achei o item ${cmd.alvo}.`;
      }
    }

    for (const nome of tocados) {
      const achado = recentes.find((r) => r.nome === nome);
      if (achado) await this.gravar(achado.nome, achado.arquivo);
    }
    await this.deps.sendText(self, resposta);
    return resposta;
  }

  /** Executa um item e registra o resultado no próprio objeto (gravado pelo chamador). */
  private async executar(
    item: ItemDespacho,
    decisao: 'ok' | 'nao',
    textoNovo?: string,
  ): Promise<ResultadoExecucao> {
    if (item.executadoEm) {
      return {
        texto: `${item.n} já foi resolvido (${item.resultado ?? 'sem detalhe'}).`,
        ok: true,
      };
    }
    const marcar = (resultado: string): ResultadoExecucao => {
      item.executadoEm = new Date().toISOString();
      item.resultado = resultado;
      return { texto: resultado, ok: true };
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
        if (!texto) return { texto: `${item.n} não tem texto pra enviar.`, ok: true };
        const errado = tratamentoErrado(texto);
        if (errado.length) {
          return {
            texto: `❌ ${item.n} não enviado: troque "${errado.join('", "')}" por você/vc e mande de novo.`,
            ok: false,
          };
        }
        const jid = this.deps.jidDoSlug(item.slug);
        if (!jid) return { texto: `❌ ${item.n}: não sei o jid do chat ${item.slug}.`, ok: false };
        if (textoNovo) item.texto = texto;
        await this.deps.sendHumano(jid, texto, item.slug);
        return marcar(`✅ ${item.n} enviada pra ${item.cliente}.`);
      }
      if (item.acao === 'label') {
        if (!item.issue || !item.label) {
          return { texto: `${item.n} não tem issue ou label pra aplicar.`, ok: true };
        }
        if (!this.deps.github) {
          return {
            texto: `❌ ${item.n}: sem token do GitHub no coletor (AGENTE_GITHUB_TOKEN).`,
            ok: false,
          };
        }
        await this.deps.github.adicionarLabel(item.issue.repo, item.issue.numero, item.label);
        return marcar(`✅ ${item.n} marcado com ${item.label} (#${item.issue.numero}).`);
      }
      return { texto: `${item.n} não tem ação pra executar.`, ok: true };
    } catch (err) {
      logger.error({ err, item: item.id }, 'despacho: falha ao executar');
      return {
        texto: `❌ ${item.n} falhou: ${err instanceof Error ? err.message : String(err)}`,
        ok: false,
      };
    }
  }
}
