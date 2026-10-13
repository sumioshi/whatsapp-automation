/**
 * Colunas da tabela de clientes e o que o menu Colunas liga ou desliga. A coluna
 * Cliente é fixa e fica de fora: não dá para escondê-la. Puro, para o navegador.
 */
import type { ChaveOrdem } from './clientes-tabela';

export type ColunaId =
  | 'tipo'
  | 'etiquetas'
  | 'contrato'
  | 'uso'
  | 'atividade'
  | 'entregas'
  | 'esperando'
  | 'ultima'
  | 'renovacao'
  | 'msgsEntrega'
  | 'valorEntrega'
  | 'equipe'
  | 'previa'
  | 'nota';

export interface DefColuna {
  id: ColunaId;
  /** Nome inteiro, no menu Colunas e no title do cabeçalho. */
  rotulo: string;
  /** Cabeçalho mais curto, para a tabela caber na tela. */
  cabecalho?: string;
  /** "largo": aparece sozinha só em tela de 1600 px ou mais; "oculta": só quando ligada em Colunas. */
  padrao: 'sempre' | 'largo' | 'oculta';
  direita?: boolean;
  ordem?: ChaveOrdem;
}

export const COLUNAS: DefColuna[] = [
  { id: 'tipo', rotulo: 'Tipo', padrao: 'sempre' },
  { id: 'etiquetas', rotulo: 'Etiquetas', padrao: 'sempre' },
  { id: 'contrato', rotulo: 'Contrato', padrao: 'sempre', ordem: 'contrato' },
  { id: 'uso', rotulo: 'Uso do contrato', padrao: 'sempre', ordem: 'uso' },
  { id: 'atividade', rotulo: 'Atividade, 30 dias', padrao: 'sempre', ordem: 'atividade' },
  { id: 'entregas', rotulo: 'Entregas em 30 dias', cabecalho: 'Entregas', padrao: 'sempre', direita: true, ordem: 'entregas' },
  { id: 'esperando', rotulo: 'Esperando', padrao: 'sempre', direita: true, ordem: 'espera' },
  { id: 'ultima', rotulo: 'Última msg', padrao: 'sempre', direita: true, ordem: 'ultima' },
  { id: 'renovacao', rotulo: 'Renovação', padrao: 'largo' },
  { id: 'msgsEntrega', rotulo: 'Msgs por entrega', padrao: 'largo', direita: true },
  { id: 'valorEntrega', rotulo: 'Valor por entrega', padrao: 'largo', direita: true },
  { id: 'equipe', rotulo: 'Equipe', padrao: 'largo' },
  { id: 'previa', rotulo: 'Última mensagem', padrao: 'oculta' },
  { id: 'nota', rotulo: 'Nota', padrao: 'oculta' },
];

/** Escolha feita no menu Colunas; null = o padrão de cada coluna. */
export type EscolhaColunas = Partial<Record<ColunaId, boolean>> | null;

export function colunaVisivel(c: DefColuna, escolha: EscolhaColunas, telaLarga: boolean): boolean {
  if (escolha && escolha[c.id] !== undefined) return Boolean(escolha[c.id]);
  return c.padrao === 'sempre' || (c.padrao === 'largo' && telaLarga);
}

/** Sem escolha, a coluna "largo" some só por CSS: o HTML do servidor e o do navegador batem. */
export function classeDaColuna(c: DefColuna, escolha: EscolhaColunas): string {
  return c.padrao === 'largo' && (!escolha || escolha[c.id] === undefined) ? 'max-[1599px]:hidden' : '';
}

/** Colunas que vão para o HTML: as "largo" do padrão entram e a classe as esconde em tela menor. */
export function colunasDoHtml(escolha: EscolhaColunas): DefColuna[] {
  return COLUNAS.filter((c) => (escolha && escolha[c.id] !== undefined ? escolha[c.id] : c.padrao !== 'oculta'));
}

/**
 * Liga ou desliga uma coluna a partir do que está na tela agora: a primeira escolha
 * fixa todas as colunas como estão, para nada mudar de lugar além da clicada.
 */
export function alternarColuna(
  escolha: EscolhaColunas,
  id: ColunaId,
  telaLarga: boolean,
): Partial<Record<ColunaId, boolean>> {
  const atual: Partial<Record<ColunaId, boolean>> = {};
  for (const c of COLUNAS) atual[c.id] = colunaVisivel(c, escolha, telaLarga);
  return { ...atual, [id]: !atual[id] };
}
