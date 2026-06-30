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

/** Interruptor do modo remoto do MCP. Só liga se a flag estiver em '1' E a nuvem
 * configurada (cinto de segurança: remoto sem URL cairia em erro). Lido na hora. */
export function mcpRemote(): boolean {
  return process.env.WAC_MCP_REMOTE === '1' && cloudEnabled();
}

/** GET autenticado + parse JSON. Reusa o cloudFetch (Basic Auth + timeout). */
export async function cloudJson<T>(path: string): Promise<T> {
  const res = await cloudFetch(path);
  return (await res.json()) as T;
}

/** POST autenticado com corpo JSON. cloudFetch é GET-only, então fazemos aqui o
 * fetch com método POST reusando o mesmo header de auth e timeout.
 *
 * PREMISSA: só lança em HTTP não-2xx — NÃO inspeciona o `ok` do corpo. Toda rota
 * /api/* que este helper chama DEVE mapear falha lógica para status não-2xx (e
 * não devolver `200 {ok:false}`), senão a escrita remota engoliria o erro em
 * silêncio. As rotas atuais (/api/send, /api/send-media-json, /api/profile,
 * /api/triage) respeitam isso. */
export async function cloudPost(path: string, body: unknown): Promise<Response> {
  const base = cloudUrl();
  if (!base) throw new Error('WAC_CLOUD_URL não configurado');
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`nuvem ${path} -> HTTP ${res.status}`);
  return res;
}
