import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { horaBRT } from './context';
import { DATA_DIR } from './paths';

/**
 * Saúde dos serviços de IA que falham em silêncio: a postura deixa a mensagem
 * passar quando a chamada cai, e vídeo e transcrição só aparecem quando alguém
 * pede. Cada lugar que chama anota sucesso e falha aqui; a caixa de entrada
 * mostra o aviso no topo, onde o operador já olha.
 */

export type ServicoIa = 'postura' | 'video' | 'transcricao';

export interface EstadoServico {
  falhasSeguidas: number;
  /** Primeira falha da sequência atual. */
  desde: string | null;
  ultimoErro: string | null;
  ultimoOk: string | null;
}

export type SaudeIa = Partial<Record<ServicoIa, EstadoServico>>;

const NOME: Record<ServicoIa, string> = {
  postura: 'revisão de postura do responder (as mensagens da IA saem sem essa checagem)',
  video: 'assistir_video',
  transcricao: 'transcrição de áudio',
};

/** Chave recusada, sem saldo ou ausente não melhora sozinho: avisa já na primeira falha. */
const ERRO_DE_CONTA = /\b(401|402|403)\b|ausente|recusada|sem saldo/i;
/** Erro passageiro (rede, timeout, 5xx) só vira aviso quando se repete. */
export const FALHAS_PRA_AVISAR = 3;

export function registrar(estado: SaudeIa, servico: ServicoIa, erro: string | null, agora: string): SaudeIa {
  const atual = estado[servico] ?? { falhasSeguidas: 0, desde: null, ultimoErro: null, ultimoOk: null };
  const novo: EstadoServico = erro
    ? { ...atual, falhasSeguidas: atual.falhasSeguidas + 1, desde: atual.desde ?? agora, ultimoErro: erro.slice(0, 200) }
    : { falhasSeguidas: 0, desde: null, ultimoErro: null, ultimoOk: agora };
  return { ...estado, [servico]: novo };
}

export function avisosDeSaude(estado: SaudeIa): string[] {
  const avisos: string[] = [];
  for (const servico of Object.keys(NOME) as ServicoIa[]) {
    const e = estado[servico];
    if (!e || e.falhasSeguidas === 0) continue;
    const deConta = ERRO_DE_CONTA.test(e.ultimoErro ?? '');
    if (!deConta && e.falhasSeguidas < FALHAS_PRA_AVISAR) continue;
    const quando = e.desde ? ` desde ${horaBRT(e.desde)}` : '';
    const vezes = e.falhasSeguidas === 1 ? '1 falha' : `${e.falhasSeguidas} falhas seguidas`;
    avisos.push(`⚠️ ${NOME[servico]}: ${vezes}${quando}. Último erro: ${e.ultimoErro}`);
  }
  return avisos;
}

const arquivo = () => join(DATA_DIR, '.saude-ia.json');

async function ler(): Promise<SaudeIa> {
  try {
    return JSON.parse(await readFile(arquivo(), 'utf8')) as SaudeIa;
  } catch {
    return {};
  }
}

/** Anota o resultado de uma chamada. Nunca lança: saúde não pode derrubar quem chamou. */
export async function anotarSaude(servico: ServicoIa, erro: string | null): Promise<void> {
  try {
    const estado = await ler();
    // Sucesso com o serviço já saudável não muda nada: evita escrever a cada chamada.
    if (!erro && !estado[servico]?.falhasSeguidas && estado[servico]?.ultimoOk) return;
    const novo = registrar(estado, servico, erro, new Date().toISOString());
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = `${arquivo()}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(novo, null, 2));
    await rename(tmp, arquivo());
  } catch {
    // disco cheio ou sem permissão: segue sem registro
  }
}

export async function lerAvisosDeSaude(): Promise<string[]> {
  return avisosDeSaude(await ler());
}
