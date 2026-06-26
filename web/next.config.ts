import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa a raiz de tracing nesta pasta (há lockfiles fora que confundem o Next).
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
