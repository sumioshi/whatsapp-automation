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

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readGroupsConfig } from "../lib/config";
import { buildContacts, numberFromJid, roleOf, sendableDmJid } from "../lib/contacts";
import { compact } from "../lib/context";
import { listGroups, type MessageView, readGroupMessages } from "../lib/data";
import { ensureLocalMedia } from "../lib/cloud-media";
import { extractDocumentText } from "../lib/documents";
import { CONTROL_URL, safeDataPath } from "../lib/paths";
import { marcarRajadas } from "../lib/rajada";
import { matchGrupo } from "../lib/resolve-grupo";
import { transcribe, transcribeBatch } from "../lib/transcribe";
import { ultimaMidiaPath } from "../lib/ultima-midia";
import { isAutonomo, readTriage, setAlert, setAutonomo, setMuted, setNote, setResolved } from "../lib/triage";
import { readAgentSeen, setAgentSeenMany } from "../lib/agent-seen";
import { selectNew } from "../lib/novidades";

// O MCP server é lançado pelo Claude Code (não pelo `npm run dev`), então não herda o
// .env. Carregamos o .env da raiz aqui pra ter o WAC_CLOUD_* (mídia sob demanda da
// nuvem). loadEnvFile NÃO sobrescreve o que já veio do registro do MCP (ex.: WAC_DATA_DIR).
try {
  process.loadEnvFile(resolve(__dirname, "../../.env"));
} catch {
  // Sem .env (ou Node < 20.12): segue sem nuvem, comportamento de antes.
}

/**
 * contacts() varre TODOS os messages.jsonl pra montar o índice de ~18k
 * contatos — caro. Cada tool chamava do zero (atrito #15: pesava no envio DM e
 * no modo autônomo). O MCP server fica vivo durante a sessão MCP, então cacheamos
 * com TTL curto: várias tools na mesma sessão reusam, mas contatos novos entram
 * em até CONTACTS_TTL_MS. Invalida sozinho — sem stale eterno.
 */
const CONTACTS_TTL_MS = 60_000;
let contactsCache: { at: number; value: Awaited<ReturnType<typeof buildContacts>> } | null = null;
async function contacts(): Promise<Awaited<ReturnType<typeof buildContacts>>> {
  const now = Date.now();
  if (contactsCache && now - contactsCache.at < CONTACTS_TTL_MS) return contactsCache.value;
  const value = await buildContacts();
  contactsCache = { at: now, value };
  return value;
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
  const ultima = ultimaMidiaPath(await readGroupMessages(grupo), tipos);
  return ultima
    ? { path: ultima }
    : { erro: `nenhuma mídia (${tipos.join("/")}) encontrada em "${grupo}"` };
}

/**
 * MCP server local sobre os dados do coletor de WhatsApp.
 * Reaproveita as mesmas libs do painel (lib/data, lib/config, lib/transcribe).
 * Comunica via stdio — só roda quando o cliente (Claude) chama uma ferramenta.
 */
const server = new McpServer({
  name: "whatsapp-collector",
  version: "0.1.0",
});

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
    const grupos = await listGroups();
    const config = await readGroupsConfig();
    return text({ grupos, monitorados: config.filter((g) => g.watch).map((g) => g.name) });
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
      grupo: z.string().describe("slug do grupo (de listar_grupos)"),
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
      let msgs = await readGroupMessages(grupo);
      const totalGrupo = msgs.length;
      if (desde) msgs = msgs.filter((m) => m.timestamp >= desde);
      // Default de 50 só quando nenhum filtro foi dado — senão respeita o que o
      // agente pediu (desde sem limite traz tudo do período; limite explícito manda).
      const teto = limite ?? (desde ? undefined : 50);
      if (teto) msgs = msgs.slice(-teto);
      const c = await contacts();
      return text({
        grupo,
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
      const slugs = grupo ? [grupo] : (await listGroups()).map((g) => g.slug);
      const hits: Array<{ grupo: string; ts: string } & ReturnType<typeof compact>> = [];
      for (const slug of slugs) {
        const msgs = await readGroupMessages(slug);
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
      "COM mediaPath: transcreve só aquele (baixa da nuvem se preciso). SEM mediaPath: transcreve " +
      "um lote dos pendentes que JÁ estão locais (até 10 por chamada, modelo morno = rápido); o " +
      "retorno avisa quantos faltam (chame de novo) e quantos só estão na nuvem (transcreva esses " +
      "passando o mediaPath). Esse teto evita travar a chamada baixando/transcrevendo dezenas de uma vez.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo"),
      mediaPath: z
        .string()
        .optional()
        .describe("mediaPath relativo (campo 'midia') de UMA mídia; ausente = lote dos pendentes locais"),
    },
  },
  async ({ grupo, mediaPath }) => {
    try {
      if (mediaPath) return text(await transcribe(grupo, mediaPath));
      // Sem mediaPath: lote dos pendentes LOCAIS, com teto (absorve o antigo
      // transcrever_lote). Pula os que só estão na nuvem e limita por chamada pra
      // não pendurar a chamada baixando/transcrevendo dezenas em série.
      const pend = pendingMedia(await readGroupMessages(grupo));
      if (!pend.length) return text("Nenhum áudio/vídeo pendente de transcrição.");
      const { textos, puladosNuvem, restantesLocais } = await transcribeBatch(grupo, pend);
      return text({
        pendentes: pend.length,
        transcritos: textos.length,
        textos: textos.map(([midia, texto]) => ({ midia, texto })),
        ...(restantesLocais > 0
          ? { restantes_locais: restantesLocais, nota: "chame de novo pra transcrever o resto" }
          : {}),
        ...(puladosNuvem > 0
          ? {
              pulados_na_nuvem: puladosNuvem,
              nota_nuvem:
                "esses só estão na nuvem; pra transcrever um, chame transcrever com o mediaPath dele (baixa sob demanda)",
            }
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
      let msgs = (await readGroupMessages(grupo)).filter((m) => m.timestamp.startsWith(dia));
      // Transcreve os áudios/vídeos LOCAIS do dia que faltam (modelo morno, com
      // teto — não pendura a chamada nos que só estão na nuvem nem em lotes grandes).
      const pend = pendingMedia(msgs);
      let restantes = 0;
      let naNuvem = 0;
      if (pend.length) {
        const r = await transcribeBatch(grupo, pend);
        restantes = r.restantesLocais;
        naNuvem = r.puladosNuvem;
        msgs = (await readGroupMessages(grupo)).filter((m) => m.timestamp.startsWith(dia));
      }
      const c = await contacts();
      return text({
        grupo,
        dia,
        ...(restantes > 0 || naNuvem > 0
          ? { faltam_transcrever: restantes + naNuvem, nota: "rode resumo_do_dia de novo pra transcrever mais" }
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
      "Mostra um vídeo ou GIF pra IA enxergar, amostrando alguns frames (via ffmpeg). Use pra entender o conteúdo visual de um GIF (reação/meme) ou de um vídeo mudo. Para o áudio do vídeo, use 'transcrever'. " +
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
      "Lista quem já apareceu nas conversas: id -> nome e papel (me = você, team = seu time, client = cliente). Útil para saber quem é quem ao resumir.",
    inputSchema: {},
  },
  async () => {
    const c = await contacts();
    const contatos = [...c.names.entries()]
      .map(([id, nome]) => ({
        id,
        nome,
        papel: roleOf(c, id),
        // jid de DM pra usar no 'responder', resolvido pelo sidecar (LID→telefone).
        dmJid: sendableDmJid(c, id),
      }))
      .sort((a, b) => a.papel.localeCompare(b.papel) || a.nome.localeCompare(b.nome));
    return text({ total: contatos.length, contatos });
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
async function resolveDestino(grupo: string): Promise<{ jid: string | null; label: string }> {
  const g = grupo.trim();
  if (g.endsWith("@g.us")) return { jid: g, label: g };
  if (g.includes("@") || /^\d{8,}$/.test(g)) {
    const userPart = numberFromJid(g);
    const jid = sendableDmJid(await contacts(), userPart);
    return jid ? { jid, label: jid } : { jid: null, label: g };
  }
  // Grupo: casa por jid, nome exato OU slug (ver matchGrupo / resolve-grupo.ts).
  const match = matchGrupo(g, await readGroupsConfig());
  return match ? { jid: match.id, label: match.name } : { jid: null, label: g };
}

server.registerTool(
  "responder",
  {
    description:
      "Envia uma mensagem de texto no WhatsApp — para um GRUPO (slug/nome/jid) ou um CONTATO em DM " +
      "(jid '<numero>@s.whatsapp.net', de listar_contatos). " +
      "CONFIRMAÇÃO: cada chat tem um modo (definir_modo). No modo 'confirmar' (DEFAULT), você DEVE " +
      "ter mostrado o texto e recebido OK do operador antes de chamar — passe pela skill humanizer + " +
      "comunicacao-cliente. No modo 'autonomo', pode enviar direto. O retorno traz o `modo` do chat. " +
      "(Isto é convenção que você respeita, não trava de código — não burle o 'confirmar'.)",
    inputSchema: {
      grupo: z
        .string()
        .describe(
          "slug do grupo (o mesmo de ler_mensagens/listar_grupos), nome exato, OU um jid " +
            "(grupo @g.us / DM '<numero>@s.whatsapp.net'). Slug é o jeito mais seguro.",
        ),
      texto: z.string().describe("mensagem a enviar"),
    },
  },
  async ({ grupo, texto }) => {
    try {
      const { jid, label } = await resolveDestino(grupo);
      if (!jid) return fail(`destino não encontrado: ${grupo}`);
      const res = await fetch(`${CONTROL_URL}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid, text: texto }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) return fail(data.error ?? "falha no envio");
      const modo = (await isAutonomo(grupo)) ? "autonomo" : "confirmar";
      return ok({ destino: label, jid, modo }, `Mensagem enviada para "${label}".`);
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
      "REGRA: só chame DEPOIS de confirmar com o usuário o destinatário e o arquivo. Se houver legenda (caption), o texto deve passar pelo humanizer e ser confirmado, igual ao 'responder'. " +
      "O 'path' pode ser absoluto (arquivo novo no disco) OU o mediaPath de uma mensagem já recebida (campo 'midia') para reenviar.",
    inputSchema: {
      grupo: z.string().describe("nome exato do grupo OU o jid"),
      kind: z.enum(["image", "document", "audio", "video"]).describe("tipo do arquivo"),
      path: z.string().describe("caminho absoluto do arquivo OU mediaPath relativo (de uma mensagem recebida)"),
      caption: z.string().optional().describe("legenda (ignorada em audio); passe pelo humanizer antes"),
      fileName: z.string().optional().describe("obrigatório para document — nome exibido"),
      mimetype: z.string().optional().describe("opcional (document); inferido pela extensão se ausente"),
    },
  },
  async ({ grupo, kind, path, caption, fileName, mimetype }) => {
    try {
      const { jid, label } = await resolveDestino(grupo);
      if (!jid) return fail(`destino não encontrado: ${grupo}`);
      // path absoluto = arquivo no disco; relativo = mediaPath dentro de DATA_DIR.
      const abs = path.startsWith("/") ? path : safeDataPath(path);
      if (kind === "document" && !fileName) return fail("fileName é obrigatório para document");
      const res = await fetch(`${CONTROL_URL}/send-media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid, kind, path: abs, caption, fileName, mimetype }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) return fail(data.error ?? "falha no envio");
      return ok({ destino: label, jid, kind }, `Arquivo (${kind}) enviado para "${label}".`);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "coletor offline?");
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
      await setResolved(grupo, iso);
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
      await setMuted(grupo, silenciar);
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
      await setNote(grupo, nota);
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
      const { notes } = await readTriage();
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
      await setAlert(grupo, ativar);
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
      "convenção respeitada pela IA, não trava de código.",
    inputSchema: {
      grupo: z.string().describe("slug do grupo ou DM (de listar_grupos; DM = dm-<id>)"),
      autonomo: z.boolean().describe("true = IA envia direto; false = volta pro padrão 'confirmar antes'"),
    },
  },
  async ({ grupo, autonomo }) => {
    try {
      await setAutonomo(grupo, autonomo);
      return ok(
        { grupo, modo: autonomo ? "autonomo" : "confirmar" },
        `"${grupo}" agora em modo ${autonomo ? "AUTÔNOMO (envia direto)" : "CONFIRMAR (mostra antes)"}.`,
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
      const triage = await readTriage();
      const alertados = grupo
        ? [grupo]
        : Object.keys(triage.alertar).filter((s) => triage.alertar[s]);
      if (alertados.length === 0) {
        return text({ chats: [], total: 0, nota: "Nenhum chat com alerta ligado (use alertar_chat)." });
      }
      const [c, seen] = await Promise.all([contacts(), readAgentSeen()]);
      const chats: unknown[] = [];
      const updates: Record<string, string> = {};
      let total = 0;
      let ignoradas = 0;
      for (const slug of alertados) {
        const msgs = await readGroupMessages(slug);
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
      if (marcar !== false) await setAgentSeenMany(updates);
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
  "estado_triagem",
  {
    description:
      "Retorna o estado de triagem inteiro (resolved/muted/notes/lastSeen/copilot/alertar/autonomo) pra " +
      "IA saber o que já foi tratado, quais chats acompanha (copilot), quais alertam, e o modo de envio " +
      "de cada um (autonomo: true = envia direto; ausente = confirmar antes).",
    inputSchema: {},
  },
  async () => {
    try {
      return text(await readTriage());
    } catch (e) {
      return fail(e instanceof Error ? e.message : "falha ao ler triagem");
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
