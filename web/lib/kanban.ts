
/**
 * Kanban do /clientes: colunas 100% do operador, cartão = chat.
 * Atribuição por exceção: cartão sem entrada em `cartoes` pertence à
 * PRIMEIRA coluna — chat novo entra no board sem escrita nenhuma.
 */

export interface KanbanColuna {
  id: string;
  nome: string;
  /** Coluna recolhida na UI (ex.: "Oculto"). */
  recolhida?: boolean;
}

export interface KanbanState {
  colunas: KanbanColuna[];
  /** slug -> id da coluna. Ausente = primeira coluna. */
  cartoes: Record<string, string>;
}

export function estadoInicial(): KanbanState {
  return { colunas: [{ id: novoId(), nome: 'Entrada' }], cartoes: {} };
}

function novoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function colunaDoCartao(state: KanbanState, slug: string): string {
  const atribuida = state.cartoes[slug];
  const primeira = state.colunas[0]?.id ?? '';
  if (!atribuida) return primeira;
  return state.colunas.some((c) => c.id === atribuida) ? atribuida : primeira;
}

export function moverCartao(state: KanbanState, slug: string, colunaId: string): KanbanState {
  const cartoes = { ...state.cartoes };
  // Primeira coluna é o default — sem entrada, o arquivo não acumula lixo.
  if (colunaId === state.colunas[0]?.id) delete cartoes[slug];
  else cartoes[slug] = colunaId;
  return { ...state, cartoes };
}

export function criarColuna(state: KanbanState, nome: string): KanbanState {
  const limpo = nome.trim();
  if (!limpo) return state;
  return { ...state, colunas: [...state.colunas, { id: novoId(), nome: limpo }] };
}

export function renomearColuna(state: KanbanState, id: string, nome: string): KanbanState {
  const limpo = nome.trim();
  if (!limpo) return state;
  return {
    ...state,
    colunas: state.colunas.map((c) => (c.id === id ? { ...c, nome: limpo } : c)),
  };
}

export function recolherColuna(state: KanbanState, id: string, recolhida: boolean): KanbanState {
  return {
    ...state,
    colunas: state.colunas.map((c) => (c.id === id ? { ...c, recolhida } : c)),
  };
}

export function excluirColuna(state: KanbanState, id: string): KanbanState {
  if (state.colunas.length <= 1) return state; // sempre sobra uma coluna
  const colunas = state.colunas.filter((c) => c.id !== id);
  // Cartões da coluna excluída voltam pro default (primeira restante).
  const cartoes = Object.fromEntries(
    Object.entries(state.cartoes).filter(([, col]) => col !== id),
  );
  return { colunas, cartoes };
}
