import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { DATA_DIR } from "@/lib/paths";

/**
 * Núcleo da API pública v1: autenticação por Bearer com escopo, CORS opcional,
 * limite de taxa, idempotência de escrita e formato único de resposta.
 *
 * Por que existir, se o painel já tem rotas: as rotas do painel nasceram para o
 * próprio painel — autenticam por Basic/cookie, têm nomes de verbo (`/api/send`,
 * `/api/edit-message`) e formatos que mudam conforme a tela precisou. Isto aqui é
 * a superfície estável para consumo externo, com contrato versionado.
 */

export type Escopo = "read" | "write";

interface TokenRegistrado {
  id: string;
  nome: string;
  /** sha256 do token em hex — o valor cru só existe no momento em que é gerado. */
  hash: string;
  escopos: Escopo[];
  criadoEm: string;
  revogadoEm?: string | null;
}

const ARQUIVO_TOKENS = join(DATA_DIR, "api-tokens.json");

// Cache dos tokens com invalidação por conteúdo: reler o arquivo a cada request
// seria I/O à toa, mas segurar em memória para sempre faria uma revogação só
// valer no próximo deploy.
let cacheTokens: { emMs: number; lista: TokenRegistrado[] } | null = null;
const TTL_CACHE_MS = 10_000;

async function carregarTokens(): Promise<TokenRegistrado[]> {
  const agora = Date.now();
  if (cacheTokens && agora - cacheTokens.emMs < TTL_CACHE_MS) return cacheTokens.lista;
  let lista: TokenRegistrado[] = [];
  try {
    const bruto = JSON.parse(await readFile(ARQUIVO_TOKENS, "utf8")) as {
      tokens?: TokenRegistrado[];
    };
    lista = (bruto.tokens ?? []).filter((t) => !t.revogadoEm);
  } catch {
    lista = []; // sem arquivo = nenhuma credencial válida (fail closed)
  }
  cacheTokens = { emMs: agora, lista };
  return lista;
}

export function hashDeToken(cru: string): string {
  return createHash("sha256").update(cru, "utf8").digest("hex");
}

/** Comparação em tempo constante — evita distinguir tokens pelo tempo de resposta. */
function iguais(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

async function autenticar(req: Request): Promise<TokenRegistrado | null> {
  const header = req.headers.get("authorization") ?? "";
  const [esquema, valor] = header.split(" ");
  if (esquema !== "Bearer" || !valor) return null;
  const hash = hashDeToken(valor);
  for (const t of await carregarTokens()) {
    if (iguais(t.hash, hash)) return t;
  }
  return null;
}

// ── Limite de taxa ────────────────────────────────────────────────────────────
// Janela fixa por token, em memória. Suficiente para conter cliente com laço
// desgovernado; não pretende ser defesa contra abuso distribuído.
const JANELA_MS = 60_000;
const TETO_PADRAO = Number(process.env.WAC_API_RATE_LIMIT ?? 120);
const contadores = new Map<string, { ate: number; usos: number }>();

function dentroDoLimite(tokenId: string): { ok: boolean; restante: number; resetEm: number } {
  const agora = Date.now();
  const atual = contadores.get(tokenId);
  if (!atual || agora > atual.ate) {
    contadores.set(tokenId, { ate: agora + JANELA_MS, usos: 1 });
    return { ok: true, restante: TETO_PADRAO - 1, resetEm: agora + JANELA_MS };
  }
  atual.usos += 1;
  return {
    ok: atual.usos <= TETO_PADRAO,
    restante: Math.max(0, TETO_PADRAO - atual.usos),
    resetEm: atual.ate,
  };
}

// ── Idempotência ──────────────────────────────────────────────────────────────
// Envio duplicado é o erro caro desta API: um retry cego coloca a mesma mensagem
// duas vezes no chat de um cliente. Com Idempotency-Key, a segunda chamada
// devolve a resposta da primeira em vez de enviar de novo.
const TTL_IDEMPOTENCIA_MS = 24 * 60 * 60_000;
const respostasIdempotentes = new Map<string, { emMs: number; corpo: unknown; status: number }>();

function limparIdempotencia(agora: number): void {
  for (const [k, v] of respostasIdempotentes) {
    if (agora - v.emMs > TTL_IDEMPOTENCIA_MS) respostasIdempotentes.delete(k);
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// Desligado por padrão. Só faz sentido quando o consumidor é front puro chamando
// direto do navegador; com backend próprio no meio, CORS não entra na conta.
function origensPermitidas(): string[] {
  return (process.env.WAC_API_CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function aplicarCors(req: Request, res: NextResponse): NextResponse {
  const origem = req.headers.get("origin");
  if (!origem) return res;
  const permitidas = origensPermitidas();
  if (!permitidas.includes(origem) && !permitidas.includes("*")) return res;
  res.headers.set("access-control-allow-origin", origem);
  res.headers.set("vary", "origin");
  res.headers.set("access-control-allow-methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.headers.set("access-control-allow-headers", "authorization,content-type,idempotency-key");
  res.headers.set("access-control-max-age", "86400");
  return res;
}

// ── Respostas ─────────────────────────────────────────────────────────────────

export type CodigoErro =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "rate_limited"
  | "conflict"
  | "internal";

const STATUS_DE: Record<CodigoErro, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  rate_limited: 429,
  conflict: 409,
  internal: 500,
};

export class ErroApi extends Error {
  constructor(
    readonly codigo: CodigoErro,
    message: string,
    readonly detalhes?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function respostaErro(codigo: CodigoErro, message: string, detalhes?: unknown) {
  return NextResponse.json(
    { error: { code: codigo, message, ...(detalhes ? { details: detalhes } : {}) } },
    { status: STATUS_DE[codigo] },
  );
}

/** Envelope de sucesso. Lista sempre em `data`; paginação em `page`. */
export function respostaOk(
  data: unknown,
  extra?: { page?: { next: string | null; hasMore: boolean } },
) {
  return NextResponse.json({ data, ...(extra?.page ? { page: extra.page } : {}) });
}

// ── Wrapper ───────────────────────────────────────────────────────────────────

export interface Contexto {
  req: Request;
  token: TokenRegistrado;
  /** Chave de idempotência da requisição, quando enviada. */
  chaveIdempotencia: string | null;
}

/**
 * Embrulha um handler com autenticação, escopo, limite de taxa, CORS e
 * tratamento de erro. Handlers só cuidam da regra de negócio.
 */
export function rota(
  escopoExigido: Escopo,
  handler: (ctx: Contexto) => Promise<NextResponse>,
) {
  return async (req: Request): Promise<NextResponse> => {
    try {
      const token = await autenticar(req);
      if (!token) {
        return aplicarCors(req, respostaErro("unauthorized", "token ausente ou inválido"));
      }
      if (!token.escopos.includes(escopoExigido)) {
        return aplicarCors(
          req,
          respostaErro("forbidden", `este token não tem escopo "${escopoExigido}"`),
        );
      }
      const limite = dentroDoLimite(token.id);
      if (!limite.ok) {
        const res = respostaErro("rate_limited", "limite de requisições excedido");
        res.headers.set("retry-after", String(Math.ceil((limite.resetEm - Date.now()) / 1000)));
        return aplicarCors(req, res);
      }

      const chave = req.headers.get("idempotency-key");
      if (chave && escopoExigido === "write") {
        const agora = Date.now();
        limparIdempotencia(agora);
        const anterior = respostasIdempotentes.get(`${token.id}:${chave}`);
        if (anterior) {
          const res = NextResponse.json(anterior.corpo, { status: anterior.status });
          res.headers.set("idempotent-replay", "true");
          return aplicarCors(req, res);
        }
      }

      const res = await handler({ req, token, chaveIdempotencia: chave });

      if (chave && escopoExigido === "write" && res.status < 400) {
        const corpo = await res.clone().json().catch(() => null);
        respostasIdempotentes.set(`${token.id}:${chave}`, {
          emMs: Date.now(),
          corpo,
          status: res.status,
        });
      }
      res.headers.set("x-ratelimit-remaining", String(limite.restante));
      return aplicarCors(req, res);
    } catch (e) {
      if (e instanceof ErroApi) {
        return aplicarCors(req, respostaErro(e.codigo, e.message, e.detalhes));
      }
      const message = e instanceof Error ? e.message : "erro inesperado";
      return aplicarCors(req, respostaErro("internal", message));
    }
  };
}

/** Responde ao preflight do navegador. Sem CORS configurado, vira 204 sem headers. */
export function preflight(req: Request): NextResponse {
  return aplicarCors(req, new NextResponse(null, { status: 204 }));
}

/** Valida slug de chat — o mesmo formato aceito pelas rotas do painel. */
export function slugValido(slug: string): boolean {
  return /^[A-Za-z0-9._-]{1,120}$/.test(slug);
}

/**
 * Resolve o slug de um chat no jid usado para enviar. Grupo vem do
 * groups.config (slug estável por jid); DM é derivada do próprio slug.
 */
export async function jidDoSlug(slug: string): Promise<string | null> {
  const dm = /^dm-(\d+)$/.exec(slug);
  if (dm?.[1]) return `${dm[1]}@s.whatsapp.net`;
  const { readGroupsConfig } = await import("@/lib/config");
  const { slugify } = await import("@/lib/slug");
  const config = await readGroupsConfig().catch(() => []);
  const achado = config.find((g) => (g.slug ?? slugify(g.name)) === slug);
  return achado?.id ?? null;
}

export async function corpoJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ErroApi("invalid_request", "corpo não é JSON válido");
  }
}
