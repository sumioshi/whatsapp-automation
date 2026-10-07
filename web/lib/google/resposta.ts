import { type CodigoErroAgenda, ErroAgenda } from './evento';

const STATUS: Record<CodigoErroAgenda, number> = {
  nao_configurado: 503,
  desconectado: 409,
  entrada_invalida: 400,
  somente_leitura: 403,
  nao_existe: 404,
  google_indisponivel: 502,
};

/** Erro de rota da agenda: código estável e mensagem curta; erro inesperado não vaza detalhe. */
export function respostaDeErroAgenda(e: unknown): {
  status: number;
  corpo: { error: string; codigo: CodigoErroAgenda | 'erro_interno' };
} {
  if (e instanceof ErroAgenda) return { status: STATUS[e.codigo], corpo: { error: e.message, codigo: e.codigo } };
  return { status: 500, corpo: { error: 'erro interno', codigo: 'erro_interno' } };
}
