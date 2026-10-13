/**
 * Argumentos da tool definir_contrato do MCP para o patch do contrato. A tool usa
 * `limite_mensagens`; o contrato guarda `limiteMensagens`. A validação é a da lib.
 */
import type { Contrato, EstadoContrato } from './contratos';

export interface ArgsDefinirContrato {
  estado?: EstadoContrato;
  inicio?: string | null;
  fim?: string | null;
  valorMensal?: number | null;
  /** Mensagens do cliente em 30 dias que o plano comporta; null tira o limite. */
  limite_mensagens?: number | null;
  nota?: string;
}

/** Só o que veio entra no patch: campo ausente não mexe no contrato. */
export function patchDaTool({ limite_mensagens, ...resto }: ArgsDefinirContrato): Partial<Contrato> {
  return limite_mensagens === undefined ? resto : { ...resto, limiteMensagens: limite_mensagens };
}
