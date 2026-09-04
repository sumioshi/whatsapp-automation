import { NextResponse } from "next/server";
import { type FilaEntrada, JANELA_INICIAL_MS, selecionarFila } from "@/lib/agente-fila";
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
    const seenDoSlug = forcar ? null : (seen[slug] ?? null);
    const desde = seenDoSlug ?? new Date(Date.now() - JANELA_INICIAL_MS).toISOString();
    const registros = await readGroupRecords(slug);
    // registros é o histórico inteiro do chat (pode ser milhares de mensagens),
    // mas selecionarFila só usa o que é mais novo que `desde` — mapear tudo
    // a cada chamada desperdiça trabalho a cada poll do workflow. Como o
    // arquivo é append-only (ordem cronológica), basta andar de trás pra
    // frente até achar algo <= desde e parar; o resto (mais antigo) não
    // entraria na fila de qualquer forma.
    const cauda: Array<{ timestamp: string; fromMe: boolean }> = [];
    for (let i = registros.length - 1; i >= 0; i--) {
      const r = registros[i];
      if (!r || r.timestamp <= desde) break;
      cauda.push({ timestamp: r.timestamp, fromMe: Boolean(r.fromMe) });
    }
    cauda.reverse();
    entradas.push({
      slug,
      cliente: link.cliente || slug,
      github: link.github,
      brainDir: link.brainDir,
      agente,
      executor: triagem.executor[slug] ?? "claude",
      seen: seenDoSlug,
      mensagens: cauda,
    });
  }
  return respostaOk(selecionarFila(entradas, Date.now()));
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
