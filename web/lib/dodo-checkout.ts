import { readFileSync } from "node:fs";
import path from "node:path";

export type PlanoBalcao = "solo" | "pro" | "scale";

export interface DefinicaoPlanoBalcao {
  codigo: PlanoBalcao;
  nome: string;
  precoCentavos: number;
  liveProductId: string;
  testProductId: string;
}

export const PLANOS_BALCAO: Record<PlanoBalcao, DefinicaoPlanoBalcao> = {
  solo: {
    codigo: "solo",
    nome: "Balcão Solo Mensal",
    precoCentavos: 29_700,
    liveProductId: "pdt_0NpjI7JcjzKldEZU54XU5",
    testProductId: "pdt_0NpjI6wmymaPR5kTQNBxj",
  },
  pro: {
    codigo: "pro",
    nome: "Balcão Pro · Autônomo Mensal",
    precoCentavos: 69_700,
    liveProductId: "pdt_0NpjI7QfOWjtlfUbjUDSx",
    testProductId: "pdt_0NpjI720J3MCSvF4XrgAV",
  },
  scale: {
    codigo: "scale",
    nome: "Balcão Scale · Equipe & Nuvem Mensal",
    precoCentavos: 149_000,
    liveProductId: "pdt_0NpjI7X4mwwWI8EtqVBd5",
    testProductId: "pdt_0NpjI76bszJx7Z8TLXqM1",
  },
};

export function ehPlanoBalcao(valor: string | null | undefined): valor is PlanoBalcao {
  return valor === "solo" || valor === "pro" || valor === "scale";
}

function lerEnvFallback(chave: string): string | undefined {
  if (process.env[chave]) return process.env[chave];
  for (const candidato of [
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env"),
  ]) {
    try {
      const conteudo = readFileSync(candidato, "utf-8");
      for (const linha of conteudo.split(/\r?\n/)) {
        const limpa = linha.trim();
        if (!limpa || limpa.startsWith("#")) continue;
        const idx = limpa.indexOf("=");
        if (idx <= 0) continue;
        const k = limpa.slice(0, idx).trim();
        if (k === chave) {
          return limpa.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
        }
      }
    } catch {
      // ignora arquivo inexistente
    }
  }
  return undefined;
}

export async function criarSessaoCheckoutDodo(
  plano: PlanoBalcao,
  origemUrl: string,
): Promise<{ checkoutUrl: string; sessionId: string; ambiente: "live_mode" | "test_mode"; productId: string }> {
  const def = PLANOS_BALCAO[plano];
  const envBruto = lerEnvFallback("DODO_PAYMENTS_ENVIRONMENT");
  const ambiente: "live_mode" | "test_mode" = envBruto === "test_mode" ? "test_mode" : "live_mode";

  const apiKey =
    ambiente === "test_mode"
      ? lerEnvFallback("DODO_PAYMENTS_API_KEY_TEST") || lerEnvFallback("DODO_PAYMENTS_API_KEY")
      : lerEnvFallback("DODO_PAYMENTS_API_KEY_LIVE") || lerEnvFallback("DODO_PAYMENTS_API_KEY");

  if (!apiKey) {
    throw new Error("DODO_PAYMENTS_API_KEY não configurada");
  }

  const baseUrl = ambiente === "test_mode" ? "https://test.dodopayments.com" : "https://live.dodopayments.com";
  const productId = ambiente === "test_mode" ? def.testProductId : def.liveProductId;

  const resp = await fetch(`${baseUrl}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "Balcao/1.0",
    },
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      return_url: `${origemUrl}/login?assinatura=${plano}`,
      metadata: {
        produto: "balcao",
        plano,
      },
    }),
  });

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(`Falha ao criar sessão no Dodo Payments (${resp.status}): ${detalhe}`);
  }

  const dados = (await resp.json()) as { checkout_url?: string; session_id?: string };
  if (!dados.checkout_url) {
    throw new Error("Dodo Payments não retornou checkout_url");
  }

  return {
    checkoutUrl: dados.checkout_url,
    sessionId: dados.session_id ?? "",
    ambiente,
    productId,
  };
}
