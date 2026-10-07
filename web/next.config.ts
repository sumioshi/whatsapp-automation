import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa a raiz de tracing nesta pasta (há lockfiles fora que confundem o Next).
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    // O proxy guarda o corpo do pedido pra repassar à rota, com teto padrão de
    // 10 MB (acima disso trunca). Anexo vai até 64 MB nas rotas de envio.
    proxyClientMaxBodySize: "70mb",
  },
};

export default nextConfig;
