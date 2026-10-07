import type { Quem } from './autenticar';

export type Decisao =
  | { tipo: 'seguir' }
  | { tipo: 'login' }
  | { tipo: 'negar'; status: 401 | 403 }
  | { tipo: 'redirecionar'; para: string };

/** Únicos caminhos que um atendente alcança. Todo o resto nasce fechado pra ele. */
export function areaDoAtendente(pathname: string): boolean {
  if (pathname.split('/').some((s) => s === '..' || s === '.')) return false;
  return (
    pathname === '/atendimento' ||
    pathname.startsWith('/atendimento/') ||
    pathname.startsWith('/api/atendimento/') ||
    pathname === '/api/logout'
  );
}

/**
 * Pedido de página (vai pro login/redirecionamento) ou de dado (leva status).
 * Navegador sem Sec-Fetch-Dest (antigo, ou fora de contexto seguro) cai na
 * heurística de sempre: GET que aceita HTML.
 */
export function ehNavegacao(headers: Headers, metodo: string): boolean {
  const dest = headers.get('sec-fetch-dest');
  if (dest) return dest === 'document';
  return metodo === 'GET' && (headers.get('accept') ?? '').includes('text/html');
}

export function decidir(quem: Quem | null, pathname: string, ehDocumento: boolean): Decisao {
  if (!quem) return ehDocumento ? { tipo: 'login' } : { tipo: 'negar', status: 401 };
  if (quem.papel === 'dono') return { tipo: 'seguir' };
  if (areaDoAtendente(pathname)) return { tipo: 'seguir' };
  return ehDocumento ? { tipo: 'redirecionar', para: '/atendimento' } : { tipo: 'negar', status: 403 };
}
