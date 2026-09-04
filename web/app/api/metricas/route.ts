import { NextResponse } from "next/server";
import { readGroupsConfig } from "@/lib/config";
import { readGroupRecords } from "@/lib/data";
import { type EntradaMetrica, type Janela, JANELAS_MS, calcularMetricas, type Metricas } from "@/lib/metricas";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 60_000;
const cache = new Map<Janela, { emMs: number; valor: Metricas }>();

/** Métricas de atividade dos grupos monitorados; cache de 60 s por janela. */
export async function GET(req: Request) {
  const bruto = new URL(req.url).searchParams.get("janela") ?? "7d";
  const janela: Janela = bruto in JANELAS_MS ? (bruto as Janela) : "7d";
  const agora = Date.now();
  const hit = cache.get(janela);
  if (hit && agora - hit.emMs < CACHE_MS) return NextResponse.json(hit.valor);

  const config = await readGroupsConfig().catch(() => []);
  const entradas: EntradaMetrica[] = [];
  for (const g of config) {
    if (!g.watch) continue;
    const slug = g.slug ?? slugify(g.name);
    const registros = await readGroupRecords(slug);
    entradas.push({
      slug,
      nome: g.name,
      mensagens: registros.map((r) => ({ timestamp: r.timestamp, fromMe: Boolean(r.fromMe) })),
    });
  }
  const valor = calcularMetricas(entradas, agora, janela);
  cache.set(janela, { emMs: agora, valor });
  return NextResponse.json(valor);
}
