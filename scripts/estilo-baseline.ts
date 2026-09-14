/**
 * Calibra o baseline de estilo a partir do corpus do operador e mede a taxa
 * de falso positivo do guard nas janelas reais dele, POR CHAT (o guard roda
 * por chat). Grava data/.estilo-baseline.json (o MCP lê no boot) e imprime
 * uma tabela: a configuração atual e os passos de afrouxamento em ordem.
 *
 * Uso: npm run estilo-baseline [caminho.json | messages.jsonl]
 * Default: .private/voz/corpus-profissional.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// web/lib/paths.ts resolve DATA_DIR relativo ao cwd (pensado pra rodar de
// dentro de web/). Da raiz, fixa WAC_DATA_DIR ANTES do import — precisa de
// import DINÂMICO, porque import estático é hoisted acima deste statement.
process.env.WAC_DATA_DIR ??= resolve(process.cwd(), "data");

export interface MsgCorpus {
  slug: string;
  ts: string;
  t: string;
}

export async function lerCorpusAgrupado(caminho: string): Promise<MsgCorpus[]> {
  const { elegivelParaBaseline } = await import("../web/lib/estilo/baseline");
  const raw = await readFile(caminho, "utf8");
  if (caminho.endsWith(".jsonl")) {
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as { fromMe?: boolean; type?: string; text?: string; timestamp: string; origem?: string };
        } catch {
          return null;
        }
      })
      .filter((m): m is NonNullable<typeof m> => Boolean(m) && elegivelParaBaseline(m!))
      .map((m) => ({ slug: "chat", ts: m.timestamp, t: m.text! }));
  }
  const lista = JSON.parse(raw) as Array<{ slug?: string; ts?: string; t?: string; text?: string }>;
  return lista
    .map((m) => ({ slug: m.slug ?? "chat", ts: m.ts ?? "", t: (m.t ?? m.text ?? "").trim() }))
    .filter((m) => m.t);
}

export async function lerCorpus(caminho: string): Promise<string[]> {
  return (await lerCorpusAgrupado(caminho)).map((m) => m.t);
}

interface Janela {
  rascunho: string;
  ultimas: string[];
}

/** Janelas reais: 5 mensagens anteriores do MESMO chat + a 6ª como rascunho (só rascunho com ≥ 4 palavras), sem registros duplicados. */
export function janelasPorChat(msgs: MsgCorpus[]): Janela[] {
  const porChat = new Map<string, MsgCorpus[]>();
  for (const m of msgs) {
    const lista = porChat.get(m.slug);
    if (lista) lista.push(m);
    else porChat.set(m.slug, [m]);
  }
  const out: Janela[] = [];
  for (const lista of porChat.values()) {
    if (lista.length < 6) continue;
    lista.sort((a, b) => (a.ts < b.ts ? -1 : 1));
    // Registro duplicado (mesmo texto repetido no chat em sequência curta) é
    // artefato de coleta, não repetição humana: fica fora da janela.
    const limpa: MsgCorpus[] = [];
    for (const m of lista) {
      if (limpa.slice(-5).some((x) => x.t === m.t)) continue;
      limpa.push(m);
    }
    for (let i = 5; i < limpa.length; i++) {
      const t = limpa[i]!.t;
      if (t.split(/\s+/).length < 4) continue;
      out.push({ rascunho: t, ultimas: limpa.slice(i - 5, i).map((m) => m.t) });
    }
  }
  return out;
}

async function main() {
  const { BASELINE_PADRAO, calcularBaseline } = await import("../web/lib/estilo/baseline");
  const { CONFIG_REVISAO, LIMIAR, revisar } = await import("../web/lib/estilo/revisar");
  const { AJUSTES } = await import("../web/lib/estilo/repeticao");
  const { DATA_DIR } = await import("../web/lib/paths");

  const caminho = process.argv[2] ?? ".private/voz/corpus-profissional.json";
  const msgs = await lerCorpusAgrupado(caminho);
  const textos = msgs.map((m) => m.t);
  if (textos.length < 100) throw new Error(`corpus pequeno demais: ${textos.length} mensagens`);
  const baseline = calcularBaseline(textos, "padrao");
  await writeFile(join(DATA_DIR, ".estilo-baseline.json"), JSON.stringify(baseline, null, 2));
  const janelas = janelasPorChat(msgs);

  const medir = () => {
    const scores: number[] = [];
    const porRegra = new Map<string, number>();
    let recusadas = 0;
    for (const j of janelas) {
      const r = revisar({ baloes: [j.rascunho], ultimasMinhas: j.ultimas, ultimasDoCliente: [], baseline });
      scores.push(r.score);
      if (!r.ok) recusadas++;
      for (const h of [...r.hits, ...r.bloqueios]) porRegra.set(h.regra, (porRegra.get(h.regra) ?? 0) + 1);
    }
    const n = scores.length || 1;
    const s = [...scores].sort((a, b) => a - b);
    const top = [...porRegra.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${((v / n) * 100).toFixed(1)}%`).join(", ");
    return { recusadas: (recusadas / n) * 100, p95: s[Math.floor(0.95 * (n - 1))] ?? 0, zero: (scores.filter((x) => x === 0).length / n) * 100, top };
  };

  const original = { ...AJUSTES, limiar: CONFIG_REVISAO.limiar };
  const passos: Array<{ nome: string; aplicar: () => void }> = [
    { nome: "atual (defaults calibrados)", aplicar: () => {} },
    { nome: "alt: z-score com k ≥ 1 (sem calibrar)", aplicar: () => { AJUSTES.excessoMinK = 1; } },
    { nome: "alt: + exclamação no excesso", aplicar: () => { AJUSTES.excessoSemExclamacao = false; } },
    { nome: "alt: + ritmo peso 1", aplicar: () => { AJUSTES.ritmoPeso = 1; } },
    { nome: "alt: voltar aos defaults, paráfrase peso 2", aplicar: () => { Object.assign(AJUSTES, original); AJUSTES.parafrasePeso = 2; } },
    { nome: "alt: defaults, limiar 5", aplicar: () => { Object.assign(AJUSTES, original); CONFIG_REVISAO.limiar = 5; } },
  ];

  console.log(`corpus: ${textos.length} msgs em ${new Set(msgs.map((m) => m.slug)).size} chats; janelas por chat: ${janelas.length}; baseline gravado em ${join(DATA_DIR, ".estilo-baseline.json")}`);
  console.log("p por feature:", Object.fromEntries(Object.entries(baseline.p).map(([k, v]) => [k, `${(v * 100).toFixed(1)}%`])));
  console.log("padrão embutido vs medido (dois_pontos_intro):", BASELINE_PADRAO.p.dois_pontos_intro, "→", baseline.p.dois_pontos_intro.toFixed(3));
  console.log(`\ncritério: recusadas ≤ 6% e p95 ≤ limiar (${LIMIAR} na spec). Linha 1 = o que vale; as demais são alternativas medidas:`);
  for (const p of passos) {
    p.aplicar();
    const m = medir();
    console.log(`${p.nome.padEnd(38)} recusadas ${m.recusadas.toFixed(1).padStart(5)}%  p95 ${String(m.p95).padStart(2)}  score0 ${m.zero.toFixed(1).padStart(5)}%  | ${m.top}`);
  }
  Object.assign(AJUSTES, original);
  CONFIG_REVISAO.limiar = original.limiar;
}

if (process.argv[1] && /estilo-baseline\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
