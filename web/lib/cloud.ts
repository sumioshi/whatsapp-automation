// Acesso READ-ONLY à instância da nuvem (sync de texto + mídia sob demanda).

/** Base da nuvem (sem barra final). Lida NA HORA da chamada, não no carregamento do
 * módulo: o MCP server carrega o .env no boot, então este módulo pode ser importado
 * antes das envs existirem. Vazio = recursos de nuvem desligados. */
export function cloudUrl(): string {
  return (process.env.WAC_CLOUD_URL ?? '').replace(/\/+$/, '');
}

export function cloudEnabled(): boolean {
  return cloudUrl().length > 0;
}

function authHeaders(): Record<string, string> {
  const user = process.env.WAC_CLOUD_USER;
  const pass = process.env.WAC_CLOUD_PASS;
  if (!user || !pass) return {};
  return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` };
}

/** GET num caminho da nuvem (ex.: "/api/sync/manifest"). Lança se !ok. Timeout 120s
 * (Tailscale userspace é lento; o texto vai gzipado, mas mídia sob demanda pode ser
 * maior). */
export async function cloudFetch(path: string): Promise<Response> {
  const base = cloudUrl();
  if (!base) throw new Error('WAC_CLOUD_URL não configurado');
  const res = await fetch(`${base}${path}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`nuvem ${path} -> HTTP ${res.status}`);
  return res;
}
