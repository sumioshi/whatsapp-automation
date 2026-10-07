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

/** Monta o erro de uma resposta não-2xx incluindo o corpo `{error}` da rota, quando
 * houver — senão só o status. Sem isso, o "HTTP 400" chega ao operador sem a causa
 * (ex.: "arquivo não encontrado"). */
async function cloudHttpError(path: string, res: Response): Promise<Error> {
  let detail = '';
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j?.error === 'string' && j.error) detail = `: ${j.error}`;
  } catch {
    // corpo não-JSON — fica só com o status
  }
  return new Error(`nuvem ${path} -> HTTP ${res.status}${detail}`);
}

/** POST autenticado com corpo JSON. cloudFetch é GET-only, então fazemos aqui o
 * fetch com método POST reusando o mesmo header de auth e timeout.
 *
 * PREMISSA: só lança em HTTP não-2xx — NÃO inspeciona o `ok` do corpo. Toda rota
 * /api/* que este helper chama DEVE mapear falha lógica para status não-2xx (e
 * não devolver `200 {ok:false}`), senão a escrita remota engoliria o erro em
 * silêncio. As rotas atuais (/api/send, /api/send-media-json, /api/profile,
 * /api/triage, /api/edit-message, /api/react) respeitam isso. */
export interface CloudReqOpts {
  /** Sinal de quem chama (ex.: o cancelamento da tool MCP): aborta a chamada
   *  junto com o timeout. É o que faz o Esc do agente chegar até o coletor. */
  signal?: AbortSignal;
}

/** Timeout da chamada combinado com o sinal de quem chama, se houver. */
function sinalDaChamada(opts: CloudReqOpts): AbortSignal {
  const timeout = AbortSignal.timeout(120_000);
  return opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
}

export async function cloudPost(path: string, body: unknown, opts: CloudReqOpts = {}): Promise<Response> {
  const base = cloudUrl();
  if (!base) throw new Error('WAC_CLOUD_URL não configurado');
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: sinalDaChamada(opts),
  });
  if (!res.ok) throw await cloudHttpError(path, res);
  return res;
}

/** POST multipart (upload de bytes). NÃO seta Content-Type: o fetch define o
 * boundary sozinho. Mesma auth/timeout/premissa de erro do cloudPost. Usado pra
 * subir arquivo novo do operador (imagem/vídeo) sem inflar em base64/JSON. */
export async function cloudPostForm(
  path: string,
  form: FormData,
  opts: CloudReqOpts = {},
): Promise<Response> {
  const base = cloudUrl();
  if (!base) throw new Error('WAC_CLOUD_URL não configurado');
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    signal: sinalDaChamada(opts),
  });
  if (!res.ok) throw await cloudHttpError(path, res);
  return res;
}

/** Chamada autenticada com qualquer método (a agenda usa PATCH e DELETE). Mesma
 *  auth, timeout e premissa de erro do cloudPost: lança em HTTP não-2xx com o
 *  `{error}` da rota na mensagem. */
export async function cloudRequest(
  metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts: CloudReqOpts = {},
): Promise<Response> {
  const base = cloudUrl();
  if (!base) throw new Error('WAC_CLOUD_URL não configurado');
  const res = await fetch(`${base}${path}`, {
    method: metodo,
    headers: { ...authHeaders(), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: sinalDaChamada(opts),
  });
  if (!res.ok) throw await cloudHttpError(path, res);
  return res;
}
