import { NextResponse } from "next/server";
import { type FilaEntrada, selecionarFila } from "@/lib/agente-fila";
import { preflight, respostaOk, rota } from "@/lib/api-v1";
import { readGroupRecords } from "@/lib/data";
import { readLinks } from "@/lib/links";
import { readTriage } from "@/lib/triage";
import { readTriagemSeen } from "@/lib/triagem-seen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Passo zero do workflow de triagem, sem IA: quais chats vinculados a repositório
 * têm mensagem nova de terceiro desde o último checkpoint. `?slug=` força um chat
 * (workflow_dispatch manual): ignora o checkpoint e trata agente ausente como
 * `issue`, mas continua exigindo o vínculo com repositório.
 */
export const GET = rota("read", async ({ req }) => {
  const forcar = new URL(req.url).searchParams.get("slug")?.trim() || null;
  const [links, triagem, seen] = await Promise.all([readLinks(), readTriage(), readTriagemSeen()]);
  const entradas: FilaEntrada[] = [];
  for (const [slug, link] of Object.entries(links)) {
    if (forcar && slug !== forcar) continue;
    const agente = forcar ? (triagem.agente[slug] ?? "issue") : (triagem.agente[slug] ?? "off");
    if (agente === "off" || !link.github) continue;
    const registros = await readGroupRecords(slug);
    entradas.push({
      slug,
      cliente: link.cliente || slug,
      github: link.github,
      brainDir: link.brainDir,
      agente,
      executor: triagem.executor[slug] ?? "claude",
      seen: forcar ? null : (seen[slug] ?? null),
      mensagens: registros.map((r) => ({ timestamp: r.timestamp, fromMe: Boolean(r.fromMe) })),
    });
  }
  return respostaOk(selecionarFila(entradas, Date.now()));
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
