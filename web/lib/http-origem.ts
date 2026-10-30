/**
 * Origem de um pedido HTTP, pelos cabeçalhos `Sec-Fetch-*` que o navegador manda.
 * Serve para rotas que agem no Mac do operador sem login (o painel local roda sem
 * PANEL_USER/PASS): uma página de outro site não pode disparar comandos nelas.
 */

/**
 * `true` quando o pedido veio do próprio site (ou de um cliente que não manda
 * `Sec-Fetch-Site`, como fetch do Node, curl e o relay — esses passam pelo Basic Auth
 * da nuvem). `cross-site` e `same-site` (outro subdomínio) são recusados.
 */
export function origemDoProprioSite(headers: Headers): boolean {
  const site = headers.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}

/** `true` quando o corpo declarado é JSON (o que um formulário cross-site não consegue mandar sem preflight). */
export function corpoEhJson(headers: Headers): boolean {
  const tipo = (headers.get('content-type') ?? '').toLowerCase();
  return tipo.startsWith('application/json');
}
