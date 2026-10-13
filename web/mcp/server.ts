/*
 * Copyright 2026 Rodrigo Sumioshi
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Primeiro de todos: fixa WAC_DATA_DIR e carrega o .env antes de `../lib/paths` avaliar.
import "./env";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
// Imports do painel entram por caminho RELATIVO, nunca pelo alias "@/": este
// arquivo roda sob tsx (fora do Next), que não resolve os paths do tsconfig —
// o alias passa no tsc e no next build e só quebra na hora de subir o MCP.
import { compact } from "../lib/context";
import { type MessageView } from "../lib/data";
import { ensureLocalMedia } from "../lib/cloud-media";
import { extractDocumentText } from "../lib/documents";
import { DATA_DIR, safeDataPath } from "../lib/paths";
import { marcarRajadas } from "../lib/rajada";
import { canonicalSlug, matchGrupo } from "../lib/resolve-grupo";
import { slugify } from "../lib/slug";
import { skillDeVoz } from "../lib/skill-voz";
import { filtrarContatos } from "../lib/contatos-filtro";
import { fundirMensagens, slugsIrmaosDeDm } from "../lib/dm-irmaos";
import { mediaPathPorId, transcribe, transcribeBatch } from "../lib/transcribe";
import { assistirVideo } from "../lib/assistir-video";
import { ultimaMidiaPath } from "../lib/ultima-midia";
import { selectNew } from "../lib/novidades";
import { baselineDoChat, carregarBaselinePadrao, contextoDeEscrita, type ContextoEscrita } from "../lib/estilo/contexto";
import { resumirEstilo } from "../lib/estilo/resumo";
import { revisar, type Revisao } from "../lib/estilo/revisar";
import { INSTRUCAO_PRIMEIRA_PESSOA, travaAutonoma, type Trava } from "../lib/estilo/identidade";
import { escolherCandidato } from "../lib/estilo/escolher";
import { registrarRevisao } from "../lib/estilo/registro";
import {
  dsGroupMessages,
  dsListGroups,
  dsGroupsConfig,
  dsContacts,
  dsTriage,
  dsAgentSeen,
  dsSetAgentSeen,
  dsSetResolved,
  dsSetMuted,
  dsSetNote,
  dsSetAlert,
  dsSetAutonomo,
  dsCancelarEnvio,
  dsStatusEntrega,
  dsSetLatenciaMaxima,
  dsSend,
  dsSendMedia,
  dsEditarPerfil,
  dsEditMessage,
  dsReact,
  dsSetTypos,
  dsSetEtiquetas,
  dsSetAgente,
  dsSetExecutor,
  dsSetContrato,
  dsRegistrarFeature,
  dsDashboard,
  dsAgendaApagar,
  dsAgendaCriar,
  dsAgendaEditar,
  dsAgendaEstado,
  dsAgendaEventos } from "../lib/data-source";
import type { EntregaResumo } from "../lib/data-source";
import { diaBrt, resumoParaIa, somarDias } from "../lib/agenda-semana";
import { numberFromJid, roleOf, sendableDmJid } from "../lib/contacts";
import { patchDaTool } from "../lib/contrato-mcp";
import { explicarSinal } from "../lib/dashboard";

// Ambiente (.env da raiz, WAC_DATA_DIR fixo neste repo) é resolvido em ./env, importado
// antes de qualquer lib pra chegar em `paths` já definido.

/**
 * contacts() varre TODOS os messages.jsonl pra montar o índice de ~18k
 * contatos — caro. Cada tool chamava do zero (atrito #15: pesava no envio DM e
 * no modo autônomo). O MCP server fica vivo durante a sessão MCP, então cacheamos
 * com TTL curto: várias tools na mesma sessão reusam, mas contatos novos entram
 * em até CONTACTS_TTL_MS. Invalida sozinho — sem stale eterno.
 */
const CONTACTS_TTL_MS = 60_000;
let contactsCache: { at: number; value: Awaited<ReturnType<typeof dsContacts>> } | null = null;
async function contacts(): Promise<Awaited<ReturnType<typeof dsContacts>>> {
  const now = Date.now();
  if (contactsCache && now - contactsCache.at < CONTACTS_TTL_MS) return contactsCache.value;
  const value = await dsContacts();
  contactsCache = { at: now, value };
  return value;
}

/**
 * Mensagens de uma conversa. Pra DM, funde os slugs irmãos (telefone e LID da
 * mesma pessoa) — senão quem lê um só perde metade da conversa até o
 * reconciliador do coletor fundir os diretórios.
 */
async function mensagensDaConversa(slug: string): Promise<{ msgs: MessageView[]; slugs: string[] }> {
  if (!/^dm-\d+$/.test(slug)) return { msgs: await dsGroupMessages(slug), slugs: [slug] };
  const existentes = new Set((await dsListGroups()).map((g) => g.slug));
  const slugs = slugsIrmaosDeDm(slug, await contacts(), existentes);
  if (slugs.length === 1) return { msgs: await dsGroupMessages(slugs[0] ?? slug), slugs };
  const listas = await Promise.all(slugs.map((sl) => dsGroupMessages(sl)));
  return { msgs: fundirMensagens(listas), slugs };
}

/**
 * Contexto de escrita de um chat: últimas mensagens da conta e do cliente,
 * estado da conversa e baseline do operador. Falha em qualquer ponto degrada
 * para "sem janela" (o guard ainda roda nos bloqueios), nunca para pular.
 */
async function contextoDoChat(
  grupo: string,
): Promise<{
  slug: string;
  label: string;
  jid: string | null;
  ctx: ContextoEscrita;
  modo: "confirmar" | "autonomo";
  typos: boolean;
  latenciaMaxima_s: number | undefined;
  trava: Trava | null;
}> {
  const destino = await resolveDestino(grupo);
  const slug = destino.slug ?? slugify(grupo);
  const padrao = await carregarBaselinePadrao(DATA_DIR);
  let ctx: ContextoEscrita;
  let trava: Trava | null = null;
  try {
    const { msgs } = await mensagensDaConversa(slug);
    const c = await contacts();
    ctx = contextoDeEscrita(msgs, c, new Date(), baselineDoChat(slug, msgs, padrao));
    trava = travaAutonoma(msgs, c, new Date());
  } catch {
    ctx = contextoDeEscrita([], { names: new Map(), ownIds: new Set(), teamIds: new Set(), phones: new Map(), lids: new Set(), hasSidecar: false } as never, new Date(), padrao);
  }
  // Um único fetch de triagem serve modo E typos — evitar um 2º dsTriage() no
  // handler de responder, que em modo remoto seria uma ida a mais pra nuvem.
  const t = await dsTriage().catch(() => ({
    autonomo: {} as Record<string, boolean>,
    typos: {} as Record<string, boolean>,
    latenciaMaxima: {} as Record<string, number>,
  }));
  const modo = t.autonomo?.[slug] === true ? "autonomo" : "confirmar";
  const typos = t.typos?.[slug] === true;
  const latenciaMaxima_s = t.latenciaMaxima?.[slug];
  return { slug, label: destino.label, jid: destino.jid, ctx, modo, typos, latenciaMaxima_s, trava };
}

/**
 * No modo autônomo, o agente sai de cena quando o operador assume na mão ou
 * quando o contato pergunta se é IA. No `confirmar` o operador vê o texto antes.
 */
function recusaAutonoma(modo: "confirmar" | "autonomo", trava: Trava | null, acao: string) {
  if (modo !== "autonomo" || !trava) return null;
  return fail(`modo autônomo travado (${trava.regra}); nada foi ${acao}. ${trava.motivo}.`);
}

/**
 * Quando o agente leu cada chat pela última vez (preparar_resposta/ler_mensagens).
 * O responder manda `decorrido_s` = tempo desde essa leitura: a latência humana
 * desconta o que o agente já gastou pensando, senão a espera soma duas vezes.
 */
const ultimaLeitura = new Map<string, number>();

function decorridoDesdeLeitura(slug: string): number | undefined {
  const t = ultimaLeitura.get(slug);
  return t ? Math.round((Date.now() - t) / 1000) : undefined;
}

function formatarPrevisao(s: number | undefined): string {
  if (s === undefined) return "?";
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 5400) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1).replace(/\.0$/, "")} h`;
}

/**
 * Frase de status pro agente com o tempo que a entrega de fato leva: "0/3" no
 * meio da digitação é normal, não travamento — sem isso o agente conclui que o
 * serviço caiu e reenvia.
 */
export function descreverEntrega(e: EntregaResumo, agora: number = Date.now()): string {
  const base = `Ticket ${e.ticket}: ${e.estado}${e.motivo ? ` (${e.motivo})` : ""}, ${e.enviados}/${e.total} balões`;
  if (e.estado === "agendado") {
    const falta = Math.max(0, (new Date(e.entregarEm).getTime() - agora) / 1000);
    return `${base}. Começa a digitar em ~${formatarPrevisao(falta)}` + (e.duracao_s !== undefined ? ` e leva mais ~${formatarPrevisao(e.duracao_s)} pra sair inteira.` : ".");
  }
  if (e.estado === "entregando") {
    const ha = e.iniciadoEm ? Math.max(0, (agora - new Date(e.iniciadoEm).getTime()) / 1000) : undefined;
    const resta = e.duracao_s !== undefined && ha !== undefined ? Math.max(0, e.duracao_s - ha) : undefined;
    return (
      `${base}. Digitando${ha !== undefined ? ` há ${formatarPrevisao(ha)}` : ""}` +
      (resta !== undefined ? `, deve terminar em ~${formatarPrevisao(resta)}` : "") +
      ". É o ritmo humano da entrega, não travamento; espere antes de reenviar."
    );
  }
  return `${base}.`;
}

function pendingMedia(msgs: MessageView[]): string[] {
  return msgs
    .filter((m) => (m.type === "audio" || m.type === "video") && !m.transcript && m.mediaPath)
    .map((m) => m.mediaPath as string);
}

/**
 * Resolve o mediaPath de uma tool de mídia: usa `mediaPath` se veio, senão pega
 * a última mídia do grupo entre `tipos` (quando `ultima` ou nenhum path foi
 * dado). Devolve {path} ou {erro} pra a tool falhar com mensagem clara.
 */
async function resolverMidia(
  grupo: string,
  mediaPath: string | undefined,
  tipos: readonly string[],
): Promise<{ path: string } | { erro: string }> {
  if (mediaPath) return { path: mediaPath };
  const ultima = ultimaMidiaPath((await mensagensDaConversa(grupo)).msgs, tipos);
  return ultima
    ? { path: ultima }
    : { erro: `nenhuma mídia (${tipos.join("/")}) encontrada em "${grupo}"` };
}

/**
 * `instructions` do servidor: o cliente MCP carrega este texto no início da sessão,
 * junto com os nomes das tools (antes mesmo dos schemas, quando o tool search está
 * ligado). É o único lugar que garante que a regra chegue ao agente ANTES de ele
 * decidir enviar. Teto de 2KB no Claude Code — o que passar disso é truncado.
 */
const VOZ = skillDeVoz();

const INSTRUCTIONS = [
  "Coletor de WhatsApp: ler histórico, acompanhar chats e responder por eles.",
  "",
  "ANTES DE ESCREVER QUALQUER MENSAGEM que vá pro WhatsApp (responder,",
  "responder_midia, editar_mensagem), CARREGUE a skill de voz do operador (tool",
  VOZ.preenchida
    ? `Skill): \`${VOZ.nome}\`.`
    : "Skill): `voz-do-operador`, ou a versão já preenchida que existir nesta máquina.",
  "Ela define a grafia, o registro e a camada de venda do operador, medidos no texto",
  "real dele. Escrever sem ela produz mensagem com cara de IA — que é exatamente o",
  "que o operador não quer que o cliente receba. Se ainda estiver com placeholders,",
  "ou não existir aqui, siga com cuidado normal e avise o operador.",
  "",
  "Depois dela, `comunicacao-cliente` (conduta: o que responder, modos, erro sem se",
  "rebaixar, urgencia). Nunca `humanizer` em balão de conversa.",
  "",
  "ANTES DE REDIGIR: preparar_resposta(grupo) — devolve o que a conta já usou nas",
  "últimas msgs do chat e o que o cliente deixou em aberto. O responder REVISA o",
  "texto (repetição, dois-pontos, culpa, desculpa) e RECUSA o que estourar, com o",
  "que trocar; mande 2-3 `candidatos` e o código escolhe o que menos destoa.",
  "",
  "MODO POR CHAT: cada chat tem um modo (estado_triagem / definir_modo). No modo",
  "'confirmar' (o default) MOSTRE o texto e espere o OK do operador antes de chamar",
  "as tools de envio. Convenção respeitada, não trava de código — não burle.",
  "",
  "REGISTRE ENTREGAS: ao concluir uma funcionalidade pra cliente, chame",
  "registrar_feature(grupo, nome, ref).",
  "",
  "ENTREGA: responder devolve um TICKET na hora; a mensagem sai depois, com latência",
  "humana (segundos numa conversa ativa, minutos a horas numa fria). status_envio",
  "acompanha; cancelar_envio cancela agendado ou em andamento — se o operador disser",
  "'cancela', chame NA HORA, sem confirmar. Se o plantão avisar 'Entrega interrompida',",
  "releia o chat e responda de novo. `urgencia: 'agora'` só quando o cliente espera um",
  "ok. Depois de cancelar ou interromper, ler_mensagens antes de reenviar.",
].join("\n");

/**
 * MCP server local sobre os dados do coletor de WhatsApp.
 * Reaproveita as mesmas libs do painel (lib/data, lib/config, lib/transcribe).
 * Comunica via stdio — só roda quando o cliente (Claude) chama uma ferramenta.
 */
const server = new McpServer(
  {
    name: "whatsapp-collector",
    version: "0.1.0",
  },
  { instructions: INSTRUCTIONS },
);

function text(value: unknown) {
  const body = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text: body }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: `Erro: ${message}` }], isError: true };
}

/**
 * Retorno padronizado das tools de ESCRITA (responder, marcar_resolvido, etc.).
 * Antes elas devolviam só uma frase PT, enquanto as de leitura devolviam JSON —
 * difícil de encadear ("enviei → agora marca resolvido"). Agora devolve
 * `{ ok: true, ...campos, msg }`: campos estáveis pra encadear + a frase amigável
 * em `msg`. `text()` já serializa o objeto.
 */
function ok(fields: Record<string, unknown>, msg: string) {
  return text({ ok: true, ...fields, msg });
}

server.registerTool(
  "listar_grupos",
  {
    description:
      "Lista os grupos coletados (slug, nome, nº de mensagens, data da última). Use o slug nas outras ferramentas.",
    inputSchema: {},
  },
  async () => {
    const grupos = await dsListGroups();
    const config = await dsGroupsConfig();
    // Grupo renomeado: o nome atual não bate mais com o slug do diretório.
    // Avisa pro agente continuar usando o slug estável (o histórico está lá).
    const renomeados = config
      .filter((g) => g.slug && slugify(g.name) !== g.slug)
      .map((g) => ({ slug: g.slug, nome_atual: g.name }));
    return text({
      grupos,
      monitorados: config.filter((g) => g.watch).map((g) => g.name),
      ...(renomeados.length
        ? { renomeados, nota: "grupos renomeados: use o `slug` (estável); o nome mudou mas o histórico segue no mesmo diretório" }
        : {}),
    });
  },
);

server.registerTool(
  "ler_mensagens",
  {
    description:
      "Lê as mensagens de um grupo (texto + transcrições já feitas). Filtra por data inicial e limita " +
      "a quantidade. Default: as 50 mais recentes (passe 'limite' maior, ou 'desde', pra ir além) — " +
      "evita despejar o grupo inteiro quando você só quer o contexto recente. " +
      "Cada msg traz `timestamp` (UTC) e `hora_brt` (hora de Brasília já convertida) — use a hora_brt " +
      "pra falar de horário com o operador, NÃO leia o UTC como se fosse local. Mídia com texto junto traz " +
      "esse texto em `legenda` (descreve a mídia), não em `texto` (que é msg de texto solta) — assim você " +
      "sabe que a legenda se refere ÀQUELE vídeo/imagem, e não confunde com um texto enviado depois. " +
      "Mensagens coladas do mesmo remetente (rajada: vídeo+texto+áudio numa tacada) compartilham um " +
      "`rajada` (id) — trate-as como um bloco do mesmo assunto, não itens soltos.",
    inputSchema: {
      grupo: z
        .string()
        .describe(
          "slug do grupo (de listar_grupos) OU de uma DM: `dm-<55DDDnúmero>` (o número que você já tem, " +
            "só dígitos) ou o jid. Telefone e LID da mesma pessoa são fundidos na leitura.",
        ),
      desde: z.string().optional().describe("ISO date/datetime; só mensagens a partir daí"),
      limite: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("máximo de mensagens (mais recentes); default 50 quando 'desde' também é ausente"),
    },
  },
  async ({ grupo, desde, limite }) => {
    try {
      // Canonicaliza: se o agente passou nome/jid/slug-do-nome-novo de um grupo
      // renomeado, lê do diretório estável em vez de falhar num dir vazio.
      const match = matchGrupo(grupo, await dsGroupsConfig());
      const slug = match ? canonicalSlug(match) : grupo;
      const notaRename =
        slug !== grupo ? { nota_slug: `lendo "${slug}" (slug estável de "${grupo}")` } : {};
      const conversa = await mensagensDaConversa(slug);
      let msgs = conversa.msgs;
      const totalGrupo = msgs.length;
      const notaFusao =
        conversa.slugs.length > 1
          ? { nota_fusao: `DM lida de ${conversa.slugs.length} slugs da mesma pessoa: ${conversa.slugs.join(", ")}` }
          : {};
      if (desde) msgs = msgs.filter((m) => m.timestamp >= desde);
      // Default de 50 só quando nenhum filtro foi dado — senão respeita o que o
      // agente pediu (desde sem limite traz tudo do período; limite explícito manda).
      const teto = limite ?? (desde ? undefined : 50);
      if (teto) msgs = msgs.slice(-teto);
      const c = await contacts();
      ultimaLeitura.set(slug, Date.now());
      return text({
        grupo: slug,
        ...notaRename,
        ...notaFusao,
        total: msgs.length,
        ...(msgs.length < totalGrupo && !desde && !limite
          ? { nota: `mostrando as ${msgs.length} mais recentes de ${totalGrupo}; passe limite/desde p/ mais` }
          : {}),
        // marcarRajadas agrupa msgs coladas do mesmo remetente (vídeo+texto+áudio
        // numa tacada só ganham o mesmo `rajada` — a IA não mistura assuntos).
        mensagens: marcarRajadas(msgs.map((m) => compact(m, c))),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao ler mensagens");
    }
  },
);

server.registerTool(
  "buscar",
  {
    description:
      "Busca um texto nas mensagens e transcrições. Sem 'grupo', procura em todos. Retorna os trechos " +
      "que casam (mais recentes primeiro), limitado a 'limite' (default 50) pra não estourar — se " +
      "truncar, o retorno avisa em 'truncado'.",
    inputSchema: {
      texto: z.string().describe("termo a procurar (case-insensitive)"),
      grupo: z.string().optional().describe("slug para restringir a um grupo"),
      limite: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("máx. de resultados (default 50); evita varrer todos os grupos e estourar"),
    },
  },
  async ({ texto, grupo, limite }) => {
    try {
      const teto = limite ?? 50;
      const alvo = texto.toLowerCase();
      const c = await contacts();
      const slugs = grupo ? [grupo] : (await dsListGroups()).map((g) => g.slug);
      const hits: Array<{ grupo: string; ts: string } & ReturnType<typeof compact>> = [];
      for (const slug of slugs) {
        const msgs = grupo ? (await mensagensDaConversa(slug)).msgs : await dsGroupMessages(slug);
        for (const m of msgs) {
          const haystack = `${m.text}\n${m.transcript ?? ""}`.toLowerCase();
          if (haystack.includes(alvo)) hits.push({ grupo: slug, ts: m.timestamp, ...compact(m, c) });
        }
      }
      // Mais recentes primeiro, depois aplica o teto.
      hits.sort((a, b) => (a.ts < b.ts ? 1 : -1));
      const total = hits.length;
      const resultados = hits.slice(0, teto).map(({ ts: _ts, ...r }) => r);
      return text({
        termo: texto,
        encontrados: total,
        resultados,
        ...(total > teto ? { truncado: `mostrando ${teto} de ${total}; refine o termo ou passe limite` } : {}),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha na busca");
    }
  },
);

server.registerTool(
  "transcrever",
  {
    description:
      "Transcreve áudio/vídeo (MLX local, large-v3) e devolve o texto; reusa cache. " +
      "UMA mídia específica: passe `mediaPath` (campo 'midia' de ler_mensagens) OU `id` (campo 'id' " +
      "da mensagem) — os dois funcionam; qualquer outro nome de parâmetro é ignorado. " +
      "SEM os dois: transcreve um lote dos pendentes do grupo (até 8 NOVOS por chamada; o que já " +
      "tem transcrição não ocupa vaga e vem em `em_cache`; os que só estão na nuvem baixam em " +
      "paralelo). Se sobrar além do teto, o retorno traz `restantes` — chame de novo e o lote AVANÇA. " +
      "Em modo remoto a transcrição é publicada na nuvem, então ler_mensagens passa a trazer `transcricao`.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo"),
      mediaPath: z
        .string()
        .optional()
        .describe("mediaPath relativo (campo 'midia') de UMA mídia"),
      id: z
        .string()
        .optional()
        .describe("id da mensagem (campo 'id' de ler_mensagens) de UMA mídia — alternativa ao mediaPath"),
    },
  },
  async ({ grupo, mediaPath, id }) => {
    try {
      if (!mediaPath && id) {
        const r = mediaPathPorId((await mensagensDaConversa(grupo)).msgs, id);
        if (!r.ok) return fail(r.motivo);
        mediaPath = r.mediaPath;
      }
      if (mediaPath) return text(await transcribe(grupo, mediaPath));
      // Sem mediaPath: lote dos pendentes LOCAIS, com teto (absorve o antigo
      // transcrever_lote). Pula os que só estão na nuvem e limita por chamada pra
      // não pendurar a chamada baixando/transcrevendo dezenas em série.
      const pend = pendingMedia((await mensagensDaConversa(grupo)).msgs);
      if (!pend.length) return text("Nenhum áudio/vídeo pendente de transcrição.");
      const { textos, restantes, emCache } = await transcribeBatch(grupo, pend);
      return text({
        pendentes: pend.length,
        transcritos: textos.length,
        textos: textos.map(([midia, texto]) => ({ midia, texto })),
        ...(emCache.length
          ? { em_cache: emCache.length, nota_cache: "já transcritas antes — ler_mensagens traz o texto; não contam no lote" }
          : {}),
        ...(restantes > 0
          ? { restantes, nota: "chame de novo pra transcrever o resto (teto por chamada; o lote avança)" }
          : {}),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha na transcrição");
    }
  },
);

server.registerTool(
  "resumo_do_dia",
  {
    description:
      "Retorna todo o conteúdo de um grupo num dia (texto + transcrições) para a IA resumir. Default: hoje (UTC).",
    inputSchema: {
      grupo: z.string().describe("slug do grupo"),
      data: z.string().optional().describe("YYYY-MM-DD; default = hoje"),
    },
  },
  async ({ grupo, data }) => {
    try {
      const dia = data ?? new Date().toISOString().slice(0, 10);
      let msgs = (await mensagensDaConversa(grupo)).msgs.filter((m) => m.timestamp.startsWith(dia));
      // Transcreve os áudios/vídeos LOCAIS do dia que faltam (modelo morno, com
      // teto — não pendura a chamada nos que só estão na nuvem nem em lotes grandes).
      const pend = pendingMedia(msgs);
      let restantes = 0;
      if (pend.length) {
        const r = await transcribeBatch(grupo, pend);
        restantes = r.restantes;
        msgs = (await mensagensDaConversa(grupo)).msgs.filter((m) => m.timestamp.startsWith(dia));
      }
      const c = await contacts();
      return text({
        grupo,
        dia,
        ...(restantes > 0
          ? { faltam_transcrever: restantes, nota: "rode resumo_do_dia de novo pra transcrever mais" }
          : {}),
        total: msgs.length,
        mensagens: msgs.map((m) => compact(m, c)),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao montar o dia");
    }
  },
);

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

server.registerTool(
  "ver_imagem",
  {
    description:
      "Mostra de fato uma imagem (print/screenshot/sticker) de um grupo para a IA enxergar. Use quando precisar entender o conteúdo visual — ex.: print de um bug que o cliente mandou. " +
      "Sem mediaPath, mostra a ÚLTIMA imagem/figurinha do grupo (atalho pra 'vê a imagem que acabou de chegar', sem precisar de ler_mensagens antes).",
    inputSchema: {
      grupo: z.string().describe("slug do grupo"),
      mediaPath: z
        .string()
        .optional()
        .describe("mediaPath da mensagem (campo 'midia'); ausente = última imagem/figurinha do grupo"),
    },
  },
  async ({ grupo, mediaPath }) => {
    try {
      const r = await resolverMidia(grupo, mediaPath, ["image", "sticker"]);
      if ("erro" in r) return fail(r.erro);
      const buf = await readFile(await ensureLocalMedia(r.path));
      const mimeType = IMAGE_MIME[extname(r.path).toLowerCase()] ?? "image/jpeg";
      return { content: [{ type: "image" as const, data: buf.toString("base64"), mimeType }] };
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao ler imagem");
    }
  },
);

const pexec = promisify(execFile);

/** Amostra até `count` frames de um vídeo/GIF (via ffmpeg) e devolve como JPEGs base64. */
async function sampleVideoFrames(absPath: string, count: number): Promise<string[]> {
  let duration = 0;
  try {
    const { stdout } = await pexec("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      absPath,
    ]);
    duration = Number.parseFloat(stdout.trim()) || 0;
  } catch {
    duration = 0;
  }
  const dir = await mkdtemp(join(tmpdir(), "wac-frames-"));
  try {
    const frames: string[] = [];
    const n = Math.max(1, count);
    for (let i = 0; i < n; i++) {
      const t = duration > 0 ? (duration * (i + 0.5)) / n : 0;
      const out = join(dir, `f${i}.jpg`);
      try {
        await pexec("ffmpeg", [
          "-ss",
          t.toFixed(3),
          "-i",
          absPath,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          "-y",
          out,
        ]);
        frames.push((await readFile(out)).toString("base64"));
      } catch {
        // frame específico falhou; segue para o próximo
      }
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

server.registerTool(
  "ver_video",
  {
    description:
      "Mostra um vídeo ou GIF pra IA enxergar, amostrando alguns frames (via ffmpeg). Use pra entender o conteúdo visual de um GIF (reação/meme) ou de um vídeo mudo. Para o áudio do vídeo, use 'transcrever'; pra entender imagem e fala juntos (ex.: cliente mostrando um erro), use 'assistir_video'. " +
      "Sem mediaPath, mostra o ÚLTIMO vídeo/GIF do grupo.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo"),
      mediaPath: z
        .string()
        .optional()
        .describe("mediaPath da mensagem (campo 'midia'); ausente = último vídeo/GIF do grupo"),
      frames: z
        .number()
        .int()
        .min(1)
        .max(8)
        .optional()
        .describe("nº de frames a amostrar (default 3)"),
    },
  },
  async ({ grupo, mediaPath, frames }) => {
    try {
      const r = await resolverMidia(grupo, mediaPath, ["video", "gif"]);
      if ("erro" in r) return fail(r.erro);
      const imgs = await sampleVideoFrames(await ensureLocalMedia(r.path), frames ?? 3);
      if (!imgs.length) return fail("não consegui extrair frames (ffmpeg disponível?)");
      return {
        content: imgs.map((data) => ({ type: "image" as const, data, mimeType: "image/jpeg" })),
      };
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao ler vídeo");
    }
  },
);

server.registerTool(
  "assistir_video",
  {
    description:
      "Assiste um vídeo com o Gemini (imagem e áudio juntos) e devolve o que aparece e o que é falado, com tempos MM:SS. " +
      "Use quando o conteúdo do vídeo importa: cliente mostrando erro na tela, explicando algo em vídeo, ou mandando LINK " +
      "de vídeo (YouTube, Instagram, TikTok). Custa ~US$ 0,003–0,01 por vídeo (OpenRouter): chame sob demanda, nunca em " +
      "lote. GIF/meme ou só uma olhada rápida: prefira 'ver_video' (grátis). " +
      "Vídeo do chat: `grupo` + `id` (campo 'id' de ler_mensagens) ou `mediaPath`; sem os dois, o ÚLTIMO vídeo do grupo. " +
      "Link: `url` (grupo opcional). `pergunta` foca a resposta. Teto: 20 min de vídeo.",
    inputSchema: {
      grupo: z.string().optional().describe("slug do grupo (obrigatório quando não há url)"),
      id: z.string().optional().describe("id da mensagem de vídeo (campo 'id' de ler_mensagens)"),
      mediaPath: z.string().optional().describe("mediaPath do vídeo (campo 'midia')"),
      url: z.string().optional().describe("link do vídeo (YouTube, Instagram, TikTok…) em vez de um anexo do chat"),
      pergunta: z.string().optional().describe("o que você quer saber do vídeo; ausente = descrição completa"),
    },
  },
  async ({ grupo, id, mediaPath, url, pergunta }) => {
    try {
      if (url) {
        const r = await assistirVideo({ url: url.trim(), pergunta });
        return text({ fonte: r.fonte, url, modelo: r.modelo, custo_usd: r.custoUsd, resposta: r.texto });
      }
      if (!grupo) return fail("passe `grupo` (vídeo do chat) ou `url` (link de vídeo)");
      if (!mediaPath && id) {
        const p = mediaPathPorId((await mensagensDaConversa(grupo)).msgs, id);
        if (!p.ok) return fail(p.motivo);
        mediaPath = p.mediaPath;
      }
      const m = await resolverMidia(grupo, mediaPath, ["video", "gif"]);
      if ("erro" in m) return fail(m.erro);
      const r = await assistirVideo({ arquivo: await ensureLocalMedia(m.path), pergunta });
      return text({ fonte: "anexo do chat", midia: m.path, modelo: r.modelo, custo_usd: r.custoUsd, resposta: r.texto });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao assistir o vídeo");
    }
  },
);

server.registerTool(
  "ler_documento",
  {
    description:
      "Lê o conteúdo de texto de um documento que o cliente mandou (PDF, .docx, .txt, .csv...). Use quando precisar entender o que diz um arquivo recebido — ex.: contrato, orçamento, planilha exportada. " +
      "Se vier 'note' avisando que não há texto extraível (PDF escaneado), tente 'ver_imagem' no mesmo arquivo. " +
      "Sem mediaPath, lê o ÚLTIMO documento do grupo.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo"),
      mediaPath: z
        .string()
        .optional()
        .describe("mediaPath da mensagem (campo 'midia'); ausente = último documento do grupo"),
    },
  },
  async ({ grupo, mediaPath }) => {
    try {
      const r = await resolverMidia(grupo, mediaPath, ["document"]);
      if ("erro" in r) return fail(r.erro);
      return text(await extractDocumentText(r.path));
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao ler documento");
    }
  },
);

server.registerTool(
  "listar_contatos",
  {
    description:
      "Acha QUEM é quem: nome, papel (me = você, team = seu time, client = cliente), jid de DM e o " +
      "slug da DM pronto pra ler_mensagens. Telefone e LID da mesma pessoa vêm numa linha só. " +
      "PASSE `busca` (pedaço do nome ou o número, com ou sem formatação/nono dígito) — a conta pode ter " +
      "milhares de contatos e sem filtro só vêm os 100 primeiros. Se você JÁ TEM o número, nem precisa: " +
      "a DM é o slug `dm-<55DDDnúmero>` direto em ler_mensagens/responder.",
    inputSchema: {
      busca: z.string().optional().describe("pedaço do nome ou número (ex.: 'paulo', '+55 11 98765-4321')"),
      limite: z.number().int().positive().max(500).optional().describe("máximo de pessoas (default 100)"),
    },
  },
  async ({ busca, limite }) => {
    const c = await contacts();
    const linhas = [...c.names.entries()].map(([id, nome]) => ({
      id,
      nome,
      papel: roleOf(c, id),
      // jid de DM pra usar no 'responder', resolvido pelo sidecar (LID→telefone).
      dmJid: sendableDmJid(c, id),
    }));
    const r = filtrarContatos(linhas, busca, limite ?? 100);
    return text({
      total: r.total,
      mostrados: r.mostrados.length,
      ...(r.truncado ? { truncado: true, nota: "passe `busca` (nome ou número) pra achar alguém específico" } : {}),
      contatos: r.mostrados,
    });
  },
);

/**
 * Resolve o destino de envio a partir de `grupo`:
 *  - jid `@g.us`           → grupo, direto;
 *  - DM (jid c/ @, ou número/LID puro) → SEMPRE re-resolve o user-part pelo sidecar
 *    via `sendableDmJid`, pra um LID (ex.: `212...@s.whatsapp.net`) virar o telefone
 *    real em vez de destino inexistente (a antiga causa das "mensagens fantasma");
 *  - senão                 → nome/id de grupo em groups.config.json.
 */
async function resolveDestino(
  grupo: string,
): Promise<{ jid: string | null; label: string; slug?: string }> {
  const g = grupo.trim();
  if (g.endsWith("@g.us")) {
    const match = matchGrupo(g, await dsGroupsConfig());
    return { jid: g, label: match?.name ?? g, ...(match ? { slug: canonicalSlug(match) } : {}) };
  }
  // Slug de DM (`dm-<telefone>` ou `dm-<lid>`): resolve pelo sidecar; o slug
  // canônico (perfil/typos/modo) é o do telefone quando ele é conhecido.
  const dm = /^dm-(\d+)$/.exec(g);
  if (dm?.[1]) {
    const jid = sendableDmJid(await contacts(), dm[1]);
    if (!jid) return { jid: null, label: g };
    const slug = jid.endsWith("@s.whatsapp.net") ? `dm-${numberFromJid(jid)}` : g;
    return { jid, label: jid, slug };
  }
  if (g.includes("@") || /^\d{8,}$/.test(g)) {
    const userPart = numberFromJid(g);
    const jid = sendableDmJid(await contacts(), userPart);
    return jid ? { jid, label: jid } : { jid: null, label: g };
  }
  // Grupo: casa por jid, nome exato OU slug (ver matchGrupo / resolve-grupo.ts).
  // O slug devolvido é o CANÔNICO (persistido) — estável mesmo se renomearem o grupo.
  const match = matchGrupo(g, await dsGroupsConfig());
  return match
    ? { jid: match.id, label: match.name, slug: canonicalSlug(match) }
    : { jid: null, label: g };
}

server.registerTool(
  "preparar_resposta",
  {
    description:
      "Chame ANTES de redigir qualquer mensagem pra um chat. Devolve o que a conta já usou nas últimas 5 mensagens " +
      "ali (aberturas, verbos, pontuação, tamanhos), o estado da conversa (ativa/fria, o que o cliente deixou em " +
      "aberto, se o operador já respondeu na mão) e `instrucoes` numéricas pra variar. Escreva seguindo as " +
      "instruções; o `responder` revisa e recusa o que estourar.",
    inputSchema: { grupo: z.string().describe("slug, nome exato ou jid do chat") },
  },
  async ({ grupo }) => {
    try {
      const { slug, label, jid, ctx, modo } = await contextoDoChat(grupo);
      const estilo = resumirEstilo(ctx.ultimasMinhas, ctx.baseline);
      const e = ctx.estado;
      const instrucoes = [INSTRUCAO_PRIMEIRA_PESSOA, ...estilo.instrucoes];
      if (e.estado === "fria" && (ctx.intervaloDesdeMinhaUltima_s ?? Infinity) > 4 * 3600) instrucoes.push("conversa fria há horas: saudação curta cabe");
      if (e.estado === "ativa") instrucoes.push("conversa ativa: entra direto no assunto, sem saudação");
      if (e.perguntasAbertas.length) instrucoes.push(`cliente deixou ${e.perguntasAbertas.length} pergunta(s) em aberto: responde uma e, se precisar, diz quando vem o resto`);
      if (e.operadorRespondeuNaMao) instrucoes.push("o operador respondeu na mão há pouco: não repita nem responda por cima");
      if (e.rajadaDoClienteEmAndamento) instrucoes.push("o cliente ainda está mandando: espera a rajada terminar antes de responder");
      const pendente = jid ? await dsStatusEntrega({ jid }).catch(() => null) : null;
      const entrega_pendente =
        pendente && (pendente.estado === "agendado" || pendente.estado === "entregando") ? pendente : null;
      if (entrega_pendente) {
        instrucoes.push(
          `já existe uma entrega ${entrega_pendente.estado} pra esse chat (ticket ${entrega_pendente.ticket}, ${entrega_pendente.enviados}/${entrega_pendente.total} balões já saíram): um novo responder cancela só o que falta; não repita os que saíram`,
        );
      }
      ultimaLeitura.set(slug, Date.now());
      return text({
        destino: label,
        modo,
        estado_conversa: e,
        estilo_recente: estilo,
        baseline: { origem: ctx.baseline.origem, n: ctx.baseline.n },
        entrega_pendente,
        instrucoes,
      });
    } catch (err) {
      return fail(err instanceof Error ? err.message : "falha ao montar o contexto");
    }
  },
);

server.registerTool(
  "revisar_texto",
  {
    description:
      "Revisa um rascunho SEM enviar: repetição contra as últimas mensagens do chat, dois-pontos e outros tells, " +
      "auto-incriminação, desculpa, tratamento. Devolve ok/score/hits/sugestoes. No modo 'confirmar', revise, " +
      "corrija e só então mostre o texto ao operador.",
    inputSchema: {
      grupo: z.string().describe("slug, nome exato ou jid do chat"),
      baloes: z.array(z.string().min(1)).min(1).max(8).describe("rascunho, um item por balão"),
    },
  },
  async ({ grupo, baloes }) => {
    try {
      const { ctx } = await contextoDoChat(grupo);
      return text(revisar({ ...ctx, baloes: baloes.map((b) => b.trim()).filter(Boolean) }));
    } catch (err) {
      return fail(err instanceof Error ? err.message : "falha ao revisar");
    }
  },
);

server.registerTool(
  "responder",
  {
    description:
      "Envia uma mensagem de texto no WhatsApp — para um GRUPO (slug/nome/jid) ou um CONTATO em DM " +
      "(`dm-<55DDDnúmero>`). PRIMEIRO CONTATO funciona: o número NÃO precisa estar em listar_contatos nem ter " +
      "conversa anterior — passe `dm-<55DDDnúmero>` do jeito que o número veio (com ou sem o nono dígito) e o " +
      "coletor confirma no WhatsApp qual é a conta antes de enviar. Se o retorno trouxer `jid_corrigido_de`, " +
      "use o `slug_correto` dali em diante; número fora do WhatsApp é recusado com motivo, nada sai. " +
      "Primeiro contato SEMPRE passa pelo OK do operador no texto, mesmo se outros chats rodam em modo autônomo " +
      "(conduta na skill `comunicacao-cliente`). " +
      `VOZ: carregue a skill de voz do operador (${VOZ.preenchida ? `\`${VOZ.nome}\`` : "`voz-do-operador` ou a preenchida desta máquina"}) ` +
      "ANTES de redigir — ela define grafia, registro e a camada " +
      "de venda do operador, medidos no texto real dele. Depois `comunicacao-cliente` (conduta: o que " +
      "responder, três modos, erro sem se rebaixar, urgencia). " +
      "CONFIRMAÇÃO: cada chat tem um modo (definir_modo). No modo 'confirmar' (DEFAULT), você DEVE " +
      "ter mostrado o texto e recebido OK do operador antes de chamar. " +
      "No modo 'autonomo', pode enviar direto. O retorno traz o `modo` do chat. " +
      "(Isto é convenção que você respeita, não trava de código — não burle o 'confirmar'.) " +
      "BALÕES: por default o texto é fatiado em até 3 balões (parágrafos em branco = quebras " +
      "explícitas suas). Use `um_balao: true` quando a mensagem deve chegar INTEIRA num balão só — " +
      "texto coeso/técnico (changelog, lista, instruções passo a passo), ou quando o operador pedir " +
      "'manda numa mensagem só'. Quando VOCÊ já decidiu a quebra (4, 5 balões…), passe `baloes` " +
      "(lista, um item = um balão, até 8) em UMA chamada — NUNCA chame responder várias vezes pra " +
      "simular balões: cada chamada é uma entrega separada com visto/digitando. Conversa curta e " +
      "informal fica melhor em balões. " +
      "REVISÃO: antes de enviar, o texto passa por revisão (repetição contra as últimas mensagens do chat, " +
      "dois-pontos e tells, auto-incriminação, desculpa). Recusa devolve hits e sugestões; reescreva e " +
      "chame de novo. Chame preparar_resposta ANTES de redigir. " +
      "ENTREGA: devolve um TICKET na hora; a mensagem sai depois com latência humana (segundos numa " +
      "conversa ativa, minutos a horas numa fria), visto antes do digitando, digitação na velocidade do " +
      "operador. Novo responder no mesmo chat SUBSTITUI o ticket anterior. Acompanhe com status_envio; " +
      "cancelar_envio cancela. Se o plantão avisar 'Entrega interrompida', releia o chat e responda de novo.",
    inputSchema: {
      grupo: z
        .string()
        .describe(
          "slug do grupo (o mesmo de ler_mensagens/listar_grupos), nome exato, `dm-<55DDDnúmero>` pra DM " +
            "(vale pra número novo, sem conversa anterior), OU um jid (grupo @g.us / DM " +
            "'<numero>@s.whatsapp.net'). Slug é o jeito mais seguro.",
        ),
      texto: z.string().optional().describe("mensagem a enviar (obrigatório se não passar `baloes`)"),
      baloes: z
        .array(z.string().min(1))
        .min(1)
        .max(8)
        .optional()
        .describe(
          "balões já decididos por você, na ordem (um item = um balão). Substitui `texto`/`um_balao`; " +
            "tudo sai numa entrega humanizada só.",
        ),
      um_balao: z
        .boolean()
        .optional()
        .describe(
          "true = envia o texto INTEIRO num único balão (sem fatiar), mantendo a entrega " +
            "humanizada (visto/digitando). Default false = quebra em até 3 balões.",
        ),
      candidatos: z
        .array(z.array(z.string().min(1)).min(1).max(8))
        .min(2)
        .max(3)
        .optional()
        .describe(
          "2 ou 3 versões alternativas da MESMA resposta (cada uma = lista de balões). O código revisa todas e " +
            "envia só a que menos destoa do operador. Exclusivo com texto/baloes. Use quando a mensagem " +
            "for mais que um 'ok'.",
        ),
      revisao: z
        .enum(["ignorar"])
        .optional()
        .describe(
          "'ignorar' pula APENAS o score de estilo (nunca bloqueios de tratamento/culpa). Só quando o operador " +
            "aprovou o texto exatamente assim e a revisão recusou.",
        ),
      urgencia: z
        .enum(["agora", "normal", "calma"])
        .optional()
        .describe(
          "'agora' = cliente esperando um ok (só a janela de 5 s); 'normal' (default) = latência humana pelo " +
            "estado da conversa; 'calma' = update sem pressa (força o regime frio: minutos a horas).",
        ),
      citar: z
        .string()
        .optional()
        .describe("id da mensagem recebida a responder (reply): o 1º balão sai citando ela"),
      aguardar: z
        .boolean()
        .optional()
        .describe(
          "true = segura a chamada até a entrega terminar (comportamento antigo; Esc cancela). " +
            "Default false: devolve o ticket na hora.",
        ),
    },
  },
  async ({ grupo, texto: textoArg, baloes, um_balao, candidatos, revisao, urgencia, citar, aguardar }, extra) => {
    try {
      const listaBase = (baloes ?? []).map((b) => b.trim()).filter(Boolean);
      const textoBase = listaBase.length ? listaBase.join("\n\n") : (textoArg ?? "").trim();
      if (!candidatos && !textoBase) return fail("passe `texto`, `baloes` ou `candidatos`");
      if (candidatos && textoBase) return fail("`candidatos` é exclusivo com `texto`/`baloes`");

      const { slug, label, jid, ctx, modo, typos, latenciaMaxima_s, trava } = await contextoDoChat(grupo);
      if (!jid) return fail(`destino não encontrado: ${grupo}`);
      const travado = recusaAutonoma(modo, trava, "enviado");
      if (travado) return travado;
      const ignorarScore = revisao === "ignorar";

      let lista = listaBase;
      let texto = textoBase;
      let rev: Revisao | undefined;
      let escolhido: number | undefined;
      let descartados: Array<{ indice: number; score: number; sugestao?: string }> | undefined;

      if (candidatos) {
        const cands = candidatos.map((c) => c.map((b) => b.trim()).filter(Boolean));
        // Candidato vazio é recusado de saída: descartar em silêncio desalinharia os
        // índices de `escolhido`/`descartados` e o registro de calibração.
        const vazio = cands.findIndex((c) => !c.length);
        if (vazio >= 0) return fail(`candidato ${vazio} está vazio; mande só candidatos com texto`);
        const r = escolherCandidato(cands, { ...ctx, ignorarScore });
        if (r.indice < 0) {
          void registrarRevisao(DATA_DIR, {
            ts: new Date().toISOString(),
            slug,
            tool: "responder",
            score: Math.min(...r.todas.map((t) => t.score)),
            hits: [],
            bloqueios: r.todas.flatMap((t) => t.bloqueios.map((b) => b.regra)),
            enviado: false,
            candidatos: cands.length,
          });
          return fail(
            `nenhum candidato passou; nada foi enviado. ${r.todas.map((t, i) => `[${i}] ${t.resumo}`).join(" | ")}. ` +
              `Sugestões: ${[...new Set(r.todas.flatMap((t) => t.sugestoes))].join("; ")}. Reescreva e chame de novo.`,
          );
        }
        escolhido = r.indice;
        rev = r.revisao!;
        lista = cands[r.indice]!;
        texto = lista.join("\n\n");
        descartados = r.todas
          .map((t, i) => ({ indice: i, score: t.score, sugestao: t.sugestoes[0] }))
          .filter((d) => d.indice !== r.indice);
      } else {
        const baloesRascunho = lista.length ? lista : [texto];
        rev = revisar({ ...ctx, baloes: baloesRascunho, ignorarScore });
        if (!rev.ok) {
          void registrarRevisao(DATA_DIR, {
            ts: new Date().toISOString(),
            slug,
            tool: "responder",
            score: rev.score,
            hits: rev.hits.map((h) => h.regra),
            bloqueios: rev.bloqueios.map((b) => b.regra),
            enviado: false,
          });
          return fail(
            `revisão recusou (${rev.resumo}); nada foi enviado. ` +
              `${[...rev.bloqueios, ...rev.hits].map((h) => `${h.regra}: ${h.motivo}`).join(" | ")}. ` +
              `Sugestões: ${rev.sugestoes.join("; ")}. Reescreva seguindo as sugestões e chame de novo.`,
          );
        }
      }

      if (!rev) return fail("revisão não produzida");

      // extra.signal aborta quando o cliente cancela a tool (Esc do operador):
      // viaja até o coletor, que segura o próximo balão.
      const decorrido_s = decorridoDesdeLeitura(slug);
      const r = await dsSend(
        jid,
        texto,
        {
          humano: true,
          slug,
          typos,
          umBalao: um_balao === true,
          ...(lista.length ? { baloes: lista } : {}),
          ...(urgencia ? { urgencia } : {}),
          ...(citar ? { citar } : {}),
          ...(aguardar === true ? { aguardar: true } : {}),
          ...(decorrido_s !== undefined ? { decorrido_s } : {}),
          ...(latenciaMaxima_s !== undefined ? { latenciaMaxima_s } : {}),
        },
        { signal: extra.signal },
      );
      void registrarRevisao(DATA_DIR, {
        ts: new Date().toISOString(),
        slug,
        tool: "responder",
        score: rev.score,
        hits: rev.hits.map((h) => h.regra),
        bloqueios: [],
        enviado: !r.cancelado,
        ...(candidatos ? { candidatos: candidatos.length, escolhido } : {}),
      });
      const campos = {
        destino: label,
        jid,
        modo,
        baloes: r.baloes ?? (lista.length || 1),
        revisao: { score: rev.score, hits: rev.hits.map((h) => h.regra) },
        ...(escolhido !== undefined ? { escolhido, descartados } : {}),
      };
      if (r.ticket && aguardar !== true) {
        return ok(
          {
            ...campos,
            ticket: r.ticket,
            previsao_s: r.previsao_s,
            estado: r.estado,
            entregarEm: r.entregarEm,
            regime: r.regime,
            ...(r.duracao_s !== undefined ? { duracao_s: r.duracao_s } : {}),
            ...(r.substituiu
              ? {
                  substituiu: r.substituiu,
                  substituiu_enviados: r.substituiu_enviados ?? 0,
                  substituiu_baloes_enviados: r.substituiu_baloes_enviados ?? [],
                }
              : {}),
            ...(r.descartados?.length ? { descartados: r.descartados } : {}),
            ...(r.jid_corrigido_de && r.jid
              ? { jid: r.jid, jid_corrigido_de: r.jid_corrigido_de, slug_correto: `dm-${r.jid.split("@")[0]}` }
              : {}),
          },
          `Entrega agendada pra "${label}": ticket ${r.ticket}, começa a digitar em ~${formatarPrevisao(r.previsao_s)} (regime ${r.regime ?? "?"})` +
            (r.duracao_s !== undefined
              ? ` e leva mais ~${formatarPrevisao(r.duracao_s)} pra sair inteira (${r.baloes ?? (lista.length || 1)} balão(ões), no ritmo de digitação do operador). Não conclua que travou antes disso.`
              : ".") +
            (r.substituiu
              ? ` Substituiu o ticket ${r.substituiu}, que JÁ TINHA ENVIADO ${r.substituiu_enviados ?? 0} balão(ões)` +
                (r.substituiu_baloes_enviados?.length ? `: ${r.substituiu_baloes_enviados.map((b) => `«${b}»`).join(" | ")}. O cliente já recebeu esses; não repita.` : ".")
              : "") +
            (r.descartados?.length
              ? ` ${r.descartados.length} balão(ões) do seu pedido NÃO entraram por repetir mensagem já enviada há pouco: ${r.descartados.map((b) => `«${b}»`).join(" | ")}.`
              : "") +
            (r.jid_corrigido_de && r.jid
              ? ` O WhatsApp corrigiu o destino: a conta desse número é ${r.jid} (o pedido foi ${r.jid_corrigido_de}). Daqui pra frente use o chat \`dm-${r.jid.split("@")[0]}\` pra ler e responder.`
              : "") +
            (escolhido !== undefined ? ` Candidato ${escolhido} escolhido (score ${rev.score}).` : "") +
            " Acompanhe com status_envio; cancelar_envio cancela. Se o plantão avisar 'Entrega interrompida', releia o chat.",
        );
      }
      if (r.cancelado) {
        const enviados = r.enviados ?? 0;
        return ok(
          { ...campos, cancelado: true, enviados },
          `Envio CANCELADO: ${enviados} de ${r.baloes ?? "?"} balões saíram antes. Confira com ler_mensagens o que chegou no chat antes de reenviar.`,
        );
      }
      return ok(
        campos,
        `Mensagem enviada para "${label}".${escolhido !== undefined ? ` Candidato ${escolhido} escolhido (score ${rev.score}).` : ""}`,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : "coletor offline?");
    }
  },
);

server.registerTool(
  "responder_midia",
  {
    description:
      "Envia um arquivo para um grupo no WhatsApp: imagem com legenda, documento/PDF, áudio (nota de voz) ou vídeo. " +
      "REGRA: só chame DEPOIS de confirmar com o usuário o destinatário e o arquivo. Se houver legenda (caption), o texto deve passar pela skill de voz do operador e ser confirmado, igual ao 'responder'. " +
      "O 'path' pode ser absoluto (arquivo novo no disco) OU o mediaPath de uma mensagem já recebida (campo 'midia') para reenviar.",
    inputSchema: {
      grupo: z.string().describe("nome exato do grupo OU o jid"),
      kind: z.enum(["image", "document", "audio", "video"]).describe("tipo do arquivo"),
      path: z.string().describe("caminho absoluto do arquivo OU mediaPath relativo (de uma mensagem recebida)"),
      caption: z.string().optional().describe("legenda (ignorada em audio); escreva na voz do operador, é revisada como o responder"),
      fileName: z.string().optional().describe("obrigatório para document — nome exibido"),
      mimetype: z.string().optional().describe("opcional (document); inferido pela extensão se ausente"),
    },
  },
  async ({ grupo, kind, path, caption, fileName, mimetype }, extra) => {
    try {
      const { ctx, modo, trava } = await contextoDoChat(grupo);
      const travado = recusaAutonoma(modo, trava, "enviado");
      if (travado) return travado;
      if (caption?.trim()) {
        const rev = revisar({ ...ctx, baloes: [caption.trim()] });
        if (!rev.ok) return fail(`revisão recusou a legenda (${rev.resumo}); nada foi enviado. Sugestões: ${rev.sugestoes.join("; ")}.`);
      }
      const { jid, label } = await resolveDestino(grupo);
      if (!jid) return fail(`destino não encontrado: ${grupo}`);
      // path absoluto = arquivo no disco; relativo = mediaPath dentro de DATA_DIR.
      const abs = path.startsWith("/") ? path : safeDataPath(path);
      if (kind === "document" && !fileName) return fail("fileName é obrigatório para document");
      await dsSendMedia({ jid, kind, path: abs, caption, fileName, mimetype }, { signal: extra.signal });
      return ok({ destino: label, jid, kind }, `Arquivo (${kind}) enviado para "${label}".`);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "coletor offline?");
    }
  },
);

server.registerTool(
  "cancelar_envio",
  {
    description:
      "Cancela uma entrega humanizada AGENDADA ou EM ANDAMENTO: o balão que ainda não saiu não sai; " +
      "o que já saiu fica. Use na hora, SEM confirmar, quando o operador disser 'cancela'/'para'/'não manda'. " +
      "Por chat (grupo) ou por ticket. Depois chame ler_mensagens no chat pra ver o que chegou a sair antes de reenviar.",
    inputSchema: {
      grupo: z.string().optional().describe("slug, nome exato ou jid do chat cujo envio deve parar"),
      ticket: z.string().optional().describe("id do ticket devolvido pelo responder"),
    },
  },
  async ({ grupo, ticket }) => {
    try {
      if (!grupo && !ticket) return fail("passe grupo ou ticket");
      let jid: string | undefined;
      let label = ticket ?? "";
      if (grupo) {
        const d = await resolveDestino(grupo);
        if (!d.jid) return fail(`destino não encontrado: ${grupo}`);
        jid = d.jid;
        label = d.label;
      }
      const r = await dsCancelarEnvio(ticket ? { ticket } : { jid });
      return ok(
        { destino: label, jid, cancelado: r.cancelado, ...(r.ticket ? { ticket: r.ticket } : {}), ...(r.enviados !== undefined ? { enviados: r.enviados } : {}) },
        r.cancelado
          ? `Entrega ${r.ticket ?? ""}${grupo ? ` pra "${label}"` : ""} cancelada (${r.enviados ?? 0} balão(ões) já tinham saído) — confira com ler_mensagens.`
          : `Nenhuma entrega agendada ou em andamento${grupo ? ` pra "${label}"` : ` com ticket ${ticket}`} (já terminou ou nem começou).`,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : "coletor offline?");
    }
  },
);

server.registerTool(
  "status_envio",
  {
    description:
      "Estado de uma entrega humanizada: por chat (grupo) ou por ticket. Devolve estado (agendado/entregando/" +
      "entregue/cancelado/interrompido), motivo, balões enviados/total e previsão.",
    inputSchema: {
      grupo: z.string().optional().describe("slug, nome exato ou jid"),
      ticket: z.string().optional().describe("id do ticket devolvido pelo responder"),
    },
  },
  async ({ grupo, ticket }) => {
    try {
      if (!grupo && !ticket) return fail("passe grupo ou ticket");
      let jid: string | undefined;
      if (!ticket && grupo) {
        const d = await resolveDestino(grupo);
        if (!d.jid) return fail(`destino não encontrado: ${grupo}`);
        jid = d.jid;
      }
      const e = await dsStatusEntrega(ticket ? { ticket } : { jid });
      if (!e) return ok({ entrega: null }, "Nenhuma entrega registrada pra esse chat/ticket.");
      return ok({ entrega: e }, descreverEntrega(e));
    } catch (e) {
      return fail(e instanceof Error ? e.message : "coletor offline?");
    }
  },
);

server.registerTool(
  "editar_mensagem",
  {
    description:
      "Edita uma mensagem JÁ ENVIADA por você/pela IA (o WhatsApp marca 'editada'). Use pra corrigir " +
      "erro ou atualizar info numa msg recente. Só funciona em mensagem PRÓPRIA (fromMe) — ATENÇÃO: " +
      "mensagens que o OPERADOR mandou do celular também são fromMe (mesma conta) e são editáveis por " +
      "esta tool. Por isso NUNCA escolha o msgId por posição ('a última'): pegue via ler_mensagens e " +
      "CONFIRA que o texto da msg alvo é exatamente o que você quer substituir antes de chamar. " +
      "CONFIRMAÇÃO: mesma convenção do responder — no modo 'confirmar', mostre o texto novo e espere " +
      "OK antes de chamar.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo/DM, nome exato, OU jid"),
      msgId: z.string().describe("id da mensagem a editar (de ler_mensagens)"),
      texto: z.string().describe("texto NOVO completo (substitui o anterior)"),
    },
  },
  async ({ grupo, msgId, texto }) => {
    try {
      const { ctx, modo, trava } = await contextoDoChat(grupo);
      const travado = recusaAutonoma(modo, trava, "editado");
      if (travado) return travado;
      const rev = revisar({ ...ctx, baloes: [texto.trim()] });
      if (!rev.ok) return fail(`revisão recusou (${rev.resumo}); nada foi editado. Sugestões: ${rev.sugestoes.join("; ")}.`);
      const { jid, label } = await resolveDestino(grupo);
      if (!jid) return fail(`destino não encontrado: ${grupo}`);
      await dsEditMessage(jid, msgId, texto);
      return ok({ destino: label, msgId }, `Mensagem editada em "${label}".`);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "coletor offline?");
    }
  },
);

server.registerTool(
  "reagir",
  {
    description:
      "Reage com um emoji a uma mensagem (👍, ❤️, 😂...). Às vezes a resposta humana é SÓ uma reação — " +
      "prefira isso a um balão de 'ok!' quando couber. Emoji vazio ('') REMOVE a reação. O msgId vem do " +
      "ler_mensagens. A tool resolve sozinha a key completa (autor/fromMe) pelo histórico — " +
      "participant/fromMe manuais só como override raro.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo/DM, nome exato, OU jid"),
      msgId: z.string().describe("id da mensagem alvo (de ler_mensagens)"),
      emoji: z.string().describe("emoji da reação; '' remove"),
      participant: z.string().optional().describe("override raro: jid do autor da msg"),
      fromMe: z.boolean().optional().describe("override raro: true se a msg alvo é do coletor"),
    },
  },
  async ({ grupo, msgId, emoji, participant, fromMe }) => {
    try {
      const { jid, label } = await resolveDestino(grupo);
      if (!jid) return fail(`destino não encontrado: ${grupo}`);
      // A key da reação precisa de fromMe (e, em grupo, do participant autor) —
      // sem eles o WhatsApp descarta a reação em silêncio no aparelho. O
      // histórico sabe de quem é a msg, então resolvemos aqui em vez de exigir
      // do chamador. Override manual só quando o chamador passa explicitamente.
      if (participant === undefined && fromMe === undefined) {
        const alvo = (await mensagensDaConversa(slugify(grupo))).msgs.find((m) => m.id === msgId);
        if (alvo) {
          fromMe = alvo.fromMe === true;
          participant = fromMe ? undefined : (alvo.sender ?? undefined);
        }
      }
      await dsReact(jid, msgId, emoji, participant, fromMe);
      return ok({ destino: label, msgId, emoji }, emoji ? `Reação ${emoji} enviada.` : "Reação removida.");
    } catch (e) {
      return fail(e instanceof Error ? e.message : "coletor offline?");
    }
  },
);

server.registerTool(
  "editar_perfil",
  {
    description:
      "Edita o PERFIL do WhatsApp do operador: nome, recado/'sobre' (status) e/ou foto. " +
      "Passe só os campos que quer mudar. 'foto' é caminho absoluto de imagem OU o mediaPath de uma mensagem recebida. " +
      "CONFIRMAÇÃO: o perfil é PÚBLICO (todo contato vê). Você DEVE mostrar ao operador o que vai mudar e ter o OK ANTES de chamar — " +
      "mesma convenção do 'responder'. Não é trava de código; não burle. " +
      "LIMITE: catálogo, localização, link e horário-oficial do business são read-only no WhatsApp (não editáveis por aqui).",
    inputSchema: {
      nome: z.string().optional().describe("novo nome do perfil (push name)"),
      recado: z.string().optional().describe("novo recado/'sobre' (status do perfil)"),
      foto: z
        .string()
        .optional()
        .describe("caminho absoluto de uma imagem OU mediaPath relativo (de uma mensagem recebida)"),
    },
  },
  async ({ nome, recado, foto }) => {
    if (!nome && !recado && !foto) {
      return fail("nada para editar: passe nome, recado e/ou foto");
    }
    const aplicado: string[] = [];
    try {
      const picturePath = foto ? (foto.startsWith("/") ? foto : safeDataPath(foto)) : undefined;
      await dsEditarPerfil({
        name: nome,
        status: recado,
        picturePath,
      });
      if (nome) aplicado.push("nome");
      if (recado) aplicado.push("recado");
      if (foto) aplicado.push("foto");
      return ok({ aplicado }, `Perfil atualizado (${aplicado.join(", ")}).`);
    } catch (e) {
      const falha = e instanceof Error ? e.message : "coletor offline?";
      return fail(
        aplicado.length
          ? `parcial — aplicado: ${aplicado.join(", ")}; falhou no resto: ${falha}`
          : falha,
      );
    }
  },
);

server.registerTool(
  "marcar_resolvido",
  {
    description:
      "Marca o grupo como resolvido (tira da fila de pendências) até o momento dado. Sem 'ate', usa agora.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo (de listar_grupos)"),
      ate: z
        .string()
        .optional()
        .describe("ISO timestamp 'resolvido até aqui'; default = agora"),
    },
  },
  async ({ grupo, ate }) => {
    try {
      const iso = ate ?? new Date().toISOString();
      await dsSetResolved(grupo, iso);
      return ok({ grupo, ate: iso }, `Grupo "${grupo}" marcado como resolvido até ${iso}.`);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao marcar resolvido");
    }
  },
);

server.registerTool(
  "silenciar_grupo",
  {
    description: "Silencia/dessilencia um grupo (coleta mas não alerta).",
    inputSchema: {
      grupo: z.string().describe("slug do grupo (de listar_grupos)"),
      silenciar: z.boolean().describe("true = silencia; false = dessilencia"),
    },
  },
  async ({ grupo, silenciar }) => {
    try {
      await dsSetMuted(grupo, silenciar);
      return ok({ grupo, silenciado: silenciar }, `Grupo "${grupo}" ${silenciar ? "silenciado" : "dessilenciado"}.`);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao silenciar grupo");
    }
  },
);

server.registerTool(
  "anotar",
  {
    description: "Salva/atualiza a nota livre (mini-CRM) de um grupo. Nota vazia remove a nota.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo (de listar_grupos)"),
      nota: z.string().describe("texto da nota; vazio remove a entrada"),
    },
  },
  async ({ grupo, nota }) => {
    try {
      await dsSetNote(grupo, nota);
      return ok({ grupo, removida: nota.trim() === "" }, `Nota do grupo "${grupo}" salva.`);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao anotar");
    }
  },
);

server.registerTool(
  "ler_notas",
  {
    description: "Lê as notas dos grupos. Com 'grupo', traz só a dele; sem, traz todas.",
    inputSchema: {
      grupo: z.string().optional().describe("slug para restringir a um grupo"),
    },
  },
  async ({ grupo }) => {
    try {
      const { notes } = await dsTriage();
      if (grupo) return text({ grupo, nota: notes[grupo] ?? null });
      return text({ notas: notes });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao ler notas");
    }
  },
);

server.registerTool(
  "alertar_chat",
  {
    description:
      "Liga/desliga a NOTIFICAÇÃO NO MAC (pro humano) quando chega mensagem de cliente num chat — " +
      "grupo OU DM — por slug. NÃO acorda o agente nem faz o Claude reagir sozinho: é só um aviso de " +
      "tela pro operador. (Pra o AGENTE ser acordado por mensagem nova — modo monitor/autônomo — arme " +
      "um Monitor no `data/<slug>/messages.jsonl`, ver CLAUDE.md.) Opt-in por conversa. Depois de " +
      "notificado, use `novidades` pra puxar o que chegou.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo ou DM (de listar_grupos; DM = dm-<id>)"),
      ativar: z.boolean().describe("true = passa a te notificar; false = para"),
    },
  },
  async ({ grupo, ativar }) => {
    try {
      await dsSetAlert(grupo, ativar);
      return ok({ grupo, alertando: ativar }, `Alerta de "${grupo}" ${ativar ? "ligado" : "desligado"}.`);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao definir alerta");
    }
  },
);

server.registerTool(
  "definir_modo",
  {
    description:
      "Define se um chat está em modo AUTÔNOMO (a IA envia sem confirmar) ou CONFIRMAR (default: a IA " +
      "mostra o texto e espera OK do operador antes de enviar). Persiste por chat — você liga uma vez e " +
      "vale até desligar, sem depender de re-combinar a cada msg. O `responder` lê esse modo. É " +
      "convenção respeitada pela IA, não trava de código. Também liga o agente de triagem do chat " +
      "(agente: off/issue/pr) e escolhe o executor (claude/copilot).",
    inputSchema: {
      grupo: z.string().describe("slug do grupo ou DM (de listar_grupos; DM = dm-<id>)"),
      autonomo: z
        .boolean()
        .optional()
        .describe("true = IA envia direto; false = volta pro padrão 'confirmar antes'; ausente = não mexe"),
      typos: z
        .boolean()
        .optional()
        .describe(
          "liga/desliga typo proposital (raro, ~3%) corrigido com um balão '*palavra' — humanização; default OFF",
        ),
      latencia_maxima_s: z
        .number()
        .int()
        .positive()
        .nullable()
        .optional()
        .describe("teto (segundos) da latência humana das entregas desse chat; null = padrão (4 h)"),
      agente: z
        .enum(["off", "issue", "pr"])
        .optional()
        .describe(
          "agente de triagem do chat: off (não lê), issue (cria issue e espera seu ok), pr (issue já sai marcada pro executor)",
        ),
      executor: z
        .enum(["claude", "copilot"])
        .optional()
        .describe("quem executa a issue aprovada; default claude"),
    },
  },
  async ({ grupo, autonomo, typos, agente, executor, latencia_maxima_s }) => {
    try {
      if (autonomo !== undefined) await dsSetAutonomo(grupo, autonomo);
      if (typos !== undefined) await dsSetTypos(grupo, typos);
      if (latencia_maxima_s !== undefined) await dsSetLatenciaMaxima(grupo, latencia_maxima_s);
      if (agente !== undefined) await dsSetAgente(grupo, agente);
      if (executor !== undefined) await dsSetExecutor(grupo, executor);
      const partes: string[] = [];
      if (autonomo !== undefined) partes.push(`modo ${autonomo ? "AUTÔNOMO" : "CONFIRMAR"}`);
      if (agente !== undefined) partes.push(`agente ${agente}`);
      if (executor !== undefined) partes.push(`executor ${executor}`);
      if (typos !== undefined) partes.push(`typos ${typos ? "on" : "off"}`);
      if (latencia_maxima_s !== undefined) partes.push(`latência máxima ${latencia_maxima_s === null ? "padrão" : `${latencia_maxima_s} s`}`);
      return ok(
        { grupo, modo: autonomo === undefined ? undefined : autonomo ? "autonomo" : "confirmar", typos, agente, executor, latencia_maxima_s },
        partes.length ? `"${grupo}": ${partes.join(", ")}.` : `"${grupo}": nada alterado.`,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao definir modo");
    }
  },
);

server.registerTool(
  "novidades",
  {
    description:
      "Puxa as mensagens novas dos chats marcados com alerta desde a última vez que você viu. " +
      "FILTRA só mensagens de CLIENTE (descarta as suas e as do time) — em grupo interno isso pode " +
      "voltar vazio mesmo tendo msg nova; nesse caso o retorno traz `ignoradas_por_papel` e uma nota " +
      "sugerindo ler_mensagens. Use ao ser notificado de mensagem nova. Avança o checkpoint (não " +
      "repete na próxima) a menos que marcar=false. Com 'grupo', restringe a um chat.",
    inputSchema: {
      grupo: z.string().optional().describe("slug pra restringir a um chat; ausente = todos os alertados"),
      marcar: z
        .boolean()
        .optional()
        .describe("default true (avança o checkpoint); false = só espia, não marca como visto"),
    },
  },
  async ({ grupo, marcar }) => {
    try {
      const triage = await dsTriage();
      const alertados = grupo
        ? [grupo]
        : Object.keys(triage.alertar).filter((s) => triage.alertar[s]);
      if (alertados.length === 0) {
        return text({ chats: [], total: 0, nota: "Nenhum chat com alerta ligado (use alertar_chat)." });
      }
      const [c, seen] = await Promise.all([contacts(), dsAgentSeen()]);
      const chats: unknown[] = [];
      const updates: Record<string, string> = {};
      let total = 0;
      let ignoradas = 0;
      for (const slug of alertados) {
        const msgs = await dsGroupMessages(slug);
        const { mensagens, latest, ignoradasNaoCliente } = selectNew(msgs, seen[slug], c);
        if (latest) updates[slug] = latest;
        ignoradas += ignoradasNaoCliente;
        if (mensagens.length === 0) continue;
        total += mensagens.length;
        chats.push({
          grupo: slug,
          nome: msgs.at(-1)?.group ?? slug,
          novas: mensagens.length,
          mensagens: mensagens.slice(-30), // teto de apresentação
        });
      }
      if (marcar !== false) await dsSetAgentSeen(updates);
      // Vazio silencioso era atrito: distinguir "nada novo" de "tinha coisa nova
      // mas filtrei tudo por papel" (comum em grupo interno onde todos são team).
      if (total === 0 && ignoradas > 0) {
        return text({
          chats: [],
          total: 0,
          ignoradas_por_papel: ignoradas,
          nota: `${ignoradas} msg(s) nova(s), mas nenhuma de cliente (são de team/você). Pra ver mesmo assim, use ler_mensagens.`,
        });
      }
      return text({ chats, total });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao buscar novidades");
    }
  },
);

server.registerTool(
  "etiquetar",
  {
    description:
      "Define as ETIQUETAS de um chat (empresa/contrato/pessoal — ex.: 'Empresa A', 'Freelance'). " +
      "É o rótulo que diz de qual contexto de trabalho aquele grupo/contato é — use pra saber COM QUEM " +
      "está falando antes de redigir. Lista vazia remove todas. Pra LER as etiquetas de todos os chats, " +
      "use estado_triagem (campo `etiquetas`).",
    inputSchema: {
      grupo: z.string().describe("slug do grupo ou DM (de listar_grupos; DM = dm-<id>)"),
      etiquetas: z
        .array(z.string())
        .describe("lista completa de etiquetas do chat (substitui as atuais; [] remove)"),
    },
  },
  async ({ grupo, etiquetas }) => {
    try {
      await dsSetEtiquetas(grupo, etiquetas);
      return ok({ grupo, etiquetas }, `Etiquetas de "${grupo}": ${etiquetas.join(", ") || "(nenhuma)"}.`);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao etiquetar");
    }
  },
);

server.registerTool(
  "definir_contrato",
  {
    description:
      "Define o estado comercial de um chat: estado (ativo/encerrado/pausado/sem), início e fim (YYYY-MM-DD), " +
      "valor mensal e nota. Só os campos passados mudam. O dashboard cruza isso com a atividade pra apontar " +
      "cliente ativo demais pro contrato, renovação próxima e custo por entrega. Pra ler, use a tool dashboard. " +
      "limite_mensagens = mensagens do cliente em 30 dias que o plano comporta (null tira o limite); acima dele o dashboard aponta acima-do-contrato.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo ou DM"),
      estado: z.enum(["ativo", "encerrado", "pausado", "sem"]).optional(),
      inicio: z.string().nullable().optional().describe("YYYY-MM-DD ou null"),
      fim: z.string().nullable().optional().describe("YYYY-MM-DD ou null"),
      valorMensal: z.number().nullable().optional().describe("reais por mês, ou null"),
      limite_mensagens: z
        .number()
        .int()
        .min(1)
        .nullable()
        .optional()
        .describe("mensagens do cliente em 30 dias que o plano comporta (inteiro ≥ 1); null tira o limite"),
      nota: z.string().optional(),
    },
  },
  async ({ grupo, ...args }) => {
    try {
      const contrato = await dsSetContrato(grupo, patchDaTool(args));
      return ok({ grupo, contrato }, `Contrato de "${grupo}": ${contrato.estado}${contrato.fim ? ` até ${contrato.fim}` : ""}.`);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao definir contrato");
    }
  },
);

server.registerTool(
  "registrar_feature",
  {
    description:
      "Registra uma funcionalidade ENTREGUE pra um cliente (chame ao concluir uma entrega). Alimenta o contador " +
      "de entregas por cliente do dashboard. Se passar `ref` (URL do PR/issue) e ela já estiver registrada NESTE " +
      "chat, não duplica (a mesma ref em outro cliente é outra entrega). PRs mergeados que fecham issues da " +
      "triagem entram sozinhos; use esta tool pro que não passou por PR.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo ou DM do cliente"),
      nome: z.string().describe("nome curto da funcionalidade, em pt-BR"),
      ref: z.string().optional().describe("URL do PR, issue ou commit (opcional; deduplica)"),
    },
  },
  async ({ grupo, nome, ref }) => {
    try {
      const r = await dsRegistrarFeature({ slug: grupo, nome, ref: ref ?? null, origem: "mcp", por: "mcp" });
      return ok(
        { grupo, feature: r.feature, duplicada: r.duplicada },
        r.duplicada ? `Já registrada: "${r.feature.nome}" (${r.feature.em}).` : `Entrega registrada pra "${grupo}": ${nome}.`,
      );
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao registrar entrega");
    }
  },
);

server.registerTool(
  "dashboard",
  {
    description:
      "Visão de negócio por cliente: atividade 30 d, contrato, entregas 30 d/total, mensagens e valor por entrega, " +
      "e SINAIS (encerrado-ativo, sem-contrato-ativo, pausado-ativo, renovacao-30d, sem-entrega-30d) com uma frase " +
      "explicando cada um. Use pra responder 'quem está ativo demais pro contrato', 'quem renova este mês', " +
      "'quantas entregas o cliente X recebeu'. `so_sinais: true` devolve só as linhas com sinal. Contratos e " +
      "entregas refletem na hora; atividade de mensagens pode ter até 60 s de atraso.",
    inputSchema: {
      so_sinais: z.boolean().optional().describe("true = só clientes com algum sinal"),
    },
  },
  async ({ so_sinais }) => {
    try {
      const d = await dsDashboard();
      const linhas = (so_sinais ? d.linhas.filter((l) => l.sinais.length > 0) : d.linhas).map((l) => ({
        ...l,
        sinais_explicados: l.sinais.map((s) => `${s}: ${explicarSinal(s)}`),
      }));
      return text({ geradoEm: d.geradoEm, totais: d.totais, linhas });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao montar dashboard");
    }
  },
);

server.registerTool(
  "estado_triagem",
  {
    description:
      "Retorna o estado de triagem inteiro (resolved/muted/notes/lastSeen/copilot/alertar/autonomo/etiquetas/agente/executor) pra " +
      "IA saber o que já foi tratado, quais chats acompanha (copilot), quais alertam, e o modo de envio " +
      "de cada um (autonomo: true = envia direto; ausente = confirmar antes). Contrato de cliente não vem aqui: " +
      "ele fica nas tools dashboard e definir_contrato.",
    inputSchema: {},
  },
  async () => {
    try {
      return text(await dsTriage());
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao ler triagem");
    }
  },
);

const AVISO_CONVIDADOS =
  "CONVIDADOS: o Google manda e-mail de convite na hora. Só inclua convidados quando o operador pedir, " +
  "e antes mostre a ele o evento (título, quando, quem) e espere o OK. Sem convidados, ninguém recebe nada.";

server.registerTool(
  "agenda_ver",
  {
    description:
      "Lê o Google Agenda do operador (todas as agendas da conta) numa janela de datas; padrão hoje até daqui a 7 dias. " +
      "Cada evento traz `agenda` e `id` (use em agenda_editar/agenda_apagar) e `hora_brt` em horário de Brasília; `organizador` = reunião de outra pessoa, que só ela altera. " +
      "Desconectado = erro pedindo para reconectar em /agenda no painel.",
    inputSchema: {
      de: z.string().optional().describe("início: YYYY-MM-DD ou data-hora ISO (sem fuso = Brasília)"),
      ate: z.string().optional().describe("fim exclusivo: YYYY-MM-DD ou data-hora ISO; no máximo 62 dias depois de `de`"),
      agendas: z.array(z.string()).optional().describe("ids de agenda para filtrar; omitido = todas"),
    },
  },
  async ({ de, ate, agendas }) => {
    try {
      const inicio = de ?? diaBrt(Date.now());
      const fim = ate ?? somarDias(inicio.slice(0, 10), 7);
      const [estado, eventos] = await Promise.all([dsAgendaEstado(), dsAgendaEventos(inicio, fim, agendas)]);
      const nomes = new Map(estado.agendas.map((a) => [a.id, a.nome]));
      return text({
        conta: estado.email,
        de: inicio,
        ate: fim,
        total: eventos.length,
        eventos: eventos.map((ev) => resumoParaIa(ev, nomes.get(ev.agenda))),
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao ler a agenda");
    }
  },
);

server.registerTool(
  "agenda_marcar",
  {
    description:
      "Cria um evento no Google Agenda do operador. Marque só o que foi combinado de fato (data e hora claras) ou o que " +
      `o operador pediu. ${AVISO_CONVIDADOS} Devolve o evento criado com \`id\`, \`agenda\`, \`hora_brt\`, \`link\` e o link do Meet.`,
    inputSchema: {
      titulo: z.string().describe("título do evento"),
      inicio: z.string().describe("data-hora ISO (sem fuso = Brasília) ou YYYY-MM-DD com dia_inteiro"),
      fim: z.string().optional().describe("fim; sem ele vale duracao_min"),
      duracao_min: z.number().int().optional().describe("duração em minutos quando não há fim; padrão 30"),
      dia_inteiro: z.boolean().optional().describe("true = evento de dia inteiro"),
      agenda: z.string().optional().describe("id da agenda; padrão a principal"),
      descricao: z.string().optional(),
      local: z.string().optional(),
      convidados: z.array(z.string()).optional().describe("e-mails; o Google manda convite por e-mail"),
      meet: z.boolean().optional().describe("true = cria link do Google Meet"),
    },
  },
  async ({ titulo, inicio, fim, duracao_min, dia_inteiro, agenda, descricao, local, convidados, meet }) => {
    try {
      const ev = await dsAgendaCriar({
        titulo,
        inicio,
        fim,
        duracaoMin: duracao_min,
        diaInteiro: dia_inteiro,
        agenda,
        descricao,
        local,
        convidados,
        meet,
      });
      return text({ criado: resumoParaIa(ev) });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao criar o evento");
    }
  },
);

server.registerTool(
  "agenda_editar",
  {
    description:
      "Altera um evento (só os campos passados). Início sem fim mantém a duração. `convidados` SUBSTITUI a lista. " +
      `${AVISO_CONVIDADOS} Em evento recorrente, muda só esta ocorrência.`,
    inputSchema: {
      agenda: z.string().describe("id da agenda (vem do agenda_ver)"),
      id: z.string().describe("id do evento (vem do agenda_ver)"),
      titulo: z.string().optional(),
      inicio: z.string().optional(),
      fim: z.string().optional(),
      duracao_min: z.number().int().optional(),
      dia_inteiro: z.boolean().optional(),
      descricao: z.string().optional().describe("'' apaga"),
      local: z.string().optional().describe("'' apaga"),
      convidados: z.array(z.string()).optional().describe("lista nova completa de e-mails"),
      meet: z.boolean().optional().describe("true = cria link do Meet se ainda não houver"),
    },
  },
  async ({ agenda, id, titulo, inicio, fim, duracao_min, dia_inteiro, descricao, local, convidados, meet }) => {
    try {
      const ev = await dsAgendaEditar(agenda, id, {
        titulo,
        inicio,
        fim,
        duracaoMin: duracao_min,
        diaInteiro: dia_inteiro,
        descricao,
        local,
        convidados,
        meet,
      });
      return text({ editado: resumoParaIa(ev) });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao editar o evento");
    }
  },
);

server.registerTool(
  "agenda_apagar",
  {
    description:
      "Apaga um evento do Google Agenda. Só apague o que o operador pediu explicitamente. Se o evento tiver convidados, " +
      "o Google avisa o cancelamento por e-mail.",
    inputSchema: {
      agenda: z.string().describe("id da agenda (vem do agenda_ver)"),
      id: z.string().describe("id do evento (vem do agenda_ver)"),
    },
  },
  async ({ agenda, id }) => {
    try {
      await dsAgendaApagar(agenda, id);
      return text({ ok: true, apagado: id });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao apagar o evento");
    }
  },
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.stderr.write(`MCP server falhou: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
