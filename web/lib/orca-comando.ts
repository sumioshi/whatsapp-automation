import type { OrcaPendingCommand } from './orca-bridge';

/**
 * Validação de formato dos comandos da ponte Orca antes de executar ou enfileirar.
 * Os valores viram argumentos da CLI do Orca e vão parar em arquivo de fila na nuvem,
 * então o que não casa com o formato esperado é recusado aqui, com mensagem legível.
 */

const RE_TERMINAL = /^[\w.:-]{1,200}$/;
const RE_SLUG = /^[a-z0-9-]{1,100}$/;
const RE_AGENTE = /^[a-z0-9-]{1,40}$/;
export const TAMANHO_MAX_TEXTO = 64 * 1024;

const vazio = (v?: string) => !v || !v.trim();
const grande = (v?: string) => typeof v === 'string' && Buffer.byteLength(v, 'utf8') > TAMANHO_MAX_TEXTO;

/** Devolve a mensagem de erro ou `null` quando o comando está em ordem. */
export function validarComandoOrca(cmd: OrcaPendingCommand): string | null {
  if (cmd.terminalHandle !== undefined && !RE_TERMINAL.test(cmd.terminalHandle)) {
    return 'terminalHandle inválido';
  }
  if (cmd.slug !== undefined && !RE_SLUG.test(cmd.slug)) return 'slug inválido';
  if (cmd.agentType !== undefined && !RE_AGENTE.test(cmd.agentType)) return 'agentType inválido';
  if (grande(cmd.text)) return 'text acima de 64 KB';
  if (grande(cmd.data)) return 'data acima de 64 KB';

  switch (cmd.acao) {
    case 'enviar_teclas':
      return vazio(cmd.terminalHandle) || !cmd.data ? 'terminalHandle e data obrigatórios' : null;
    case 'vincular_repo':
      return vazio(cmd.slug) || vazio(cmd.folder) ? 'slug e folder obrigatórios' : null;
    case 'desvincular_repo':
      return vazio(cmd.slug) ? 'slug obrigatório' : null;
    case 'parear_ambiente':
      return vazio(cmd.pairingCode) ? 'pairingCode obrigatório' : null;
    case 'remover_ambiente':
      return vazio(cmd.environmentId) ? 'id do ambiente obrigatório' : null;
    default:
      return null;
  }
}
