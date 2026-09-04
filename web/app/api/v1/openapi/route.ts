import { NextResponse } from "next/server";
import { preflight, rota } from "@/lib/api-v1";

export const runtime = "nodejs";

const CHAT = {
  type: "object",
  properties: {
    slug: { type: "string" },
    name: { type: "string" },
    jid: { type: "string", nullable: true },
    messageCount: { type: "integer" },
    lastTimestamp: { type: "string", nullable: true },
    lastPreview: { type: "string", nullable: true },
    unread: { type: "integer" },
    muted: { type: "boolean" },
  },
} as const;

const MENSAGEM = {
  type: "object",
  properties: {
    id: { type: "string" },
    timestamp: { type: "string", format: "date-time" },
    fromMe: { type: "boolean" },
    senderName: { type: "string" },
    type: { type: "string", description: "text, image, audio, video, document, poll, call" },
    text: { type: "string", nullable: true },
    quotedText: { type: "string", nullable: true },
    mediaPath: { type: "string", nullable: true, description: "use em GET /media/{path}" },
    transcript: { type: "string", nullable: true },
    reactions: { type: "array", items: { type: "object" } },
  },
} as const;

const ERRO = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: { code: { type: "string" }, message: { type: "string" } },
    },
  },
} as const;

const respostaErroRef = { description: "erro", content: { "application/json": { schema: ERRO } } };

/** Especificação da API, para gerar cliente ou abrir num visualizador. */
export const GET = rota("read", async ({ req }) => {
  const base = new URL(req.url).origin;
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "WhatsApp Collector API",
      version: "1.0.0",
      description:
        "Leitura e escrita nas conversas coletadas. Autenticação Bearer com escopo " +
        "(read/write). Envio aceita Idempotency-Key para evitar duplicata em retry.",
    },
    servers: [{ url: `${base}/api/v1` }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      schemas: { Chat: CHAT, Message: MENSAGEM, Error: ERRO },
    },
    security: [{ bearer: [] }],
    paths: {
      "/health": { get: { summary: "Estado da conexão", responses: { 200: { description: "ok" } } } },
      "/chats": {
        get: {
          summary: "Lista os chats",
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 500 } },
            { name: "offset", in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "lista", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: CHAT } } } } } }, 401: respostaErroRef },
        },
      },
      "/chats/{slug}": {
        get: { summary: "Detalhe do chat e triagem", responses: { 200: { description: "ok" }, 404: respostaErroRef } },
        patch: {
          summary: "Atualiza triagem (mode, muted, note, tags, resolvedAt)",
          responses: { 200: { description: "ok" }, 403: respostaErroRef },
        },
      },
      "/chats/{slug}/messages": {
        get: {
          summary: "Histórico, paginado para trás",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 500 } },
            { name: "before", in: "query", schema: { type: "string" }, description: "id vindo de page.next" },
          ],
          responses: { 200: { description: "mensagens", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: MENSAGEM } } } } } } },
        },
        post: {
          summary: "Envia texto ou mídia por URL",
          parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string" } }],
          responses: { 200: { description: "enviado" }, 400: respostaErroRef },
        },
      },
      "/chats/{slug}/events": { get: { summary: "SSE das mensagens novas", responses: { 200: { description: "text/event-stream" } } } },
      "/messages/{id}": { patch: { summary: "Edita mensagem própria", responses: { 200: { description: "ok" } } } },
      "/messages/{id}/reaction": {
        put: { summary: "Define reação", responses: { 200: { description: "ok" } } },
        delete: { summary: "Remove reação", responses: { 200: { description: "ok" } } },
      },
      "/contacts": { get: { summary: "Contatos conhecidos", responses: { 200: { description: "ok" } } } },
      "/media/{path}": { get: { summary: "Arquivo de mídia", responses: { 200: { description: "binário" } } } },
      "/radar": { get: { summary: "Quem está sem resposta", responses: { 200: { description: "ok" } } } },
      "/agente/fila": { get: { summary: "Chats com mensagem nova pra triagem (passo zero do workflow)", parameters: [{ name: "slug", in: "query", required: false, schema: { type: "string" } }], responses: { 200: { description: "lista de {slug, cliente, github, brainDir, agente, executor, novas, desde, ate}" } } } },
      "/agente/checkpoint": { post: { summary: "Avança o checkpoint da triagem de um chat", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["slug", "ate"], properties: { slug: { type: "string" }, ate: { type: "string", format: "date-time" } } } } } }, responses: { 200: { description: "{slug, ate, avancou}" } } } },
      "/agente/despacho": { post: { summary: "Grava a fila de decisões de uma passada", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["passada", "itens"], properties: { passada: { type: "string", example: "2026-09-04T0610" }, itens: { type: "array" } } } } } }, responses: { 200: { description: "{passada, arquivo, itens}" } } } },
      "/features": { get: { summary: "Entregas registradas (filtros slug, desde)", responses: { 200: { description: "lista de {id, slug, nome, ref, origem, em, por}" } } }, post: { summary: "Registra uma entrega (idempotente por ref dentro do mesmo chat)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["slug", "nome"], properties: { slug: { type: "string" }, nome: { type: "string" }, ref: { type: "string" }, origem: { type: "string", enum: ["mcp", "pr"] }, por: { type: "string" }, em: { type: "string", format: "date-time", description: "instante ISO da entrega; padrão agora (o workflow manda o merged_at do PR)" } } } } } }, responses: { 200: { description: "{feature, duplicada}" } } } },
    },
  });
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
