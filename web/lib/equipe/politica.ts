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

export function decidir(quem: Quem | null, pathname: string, ehDocumento: boolean): Decisao {
  if (!quem) return ehDocumento ? { tipo: 'login' } : { tipo: 'negar', status: 401 };
  if (quem.papel === 'dono') return { tipo: 'seguir' };
  if (areaDoAtendente(pathname)) return { tipo: 'seguir' };
  return ehDocumento ? { tipo: 'redirecionar', para: '/atendimento' } : { tipo: 'negar', status: 403 };
}
