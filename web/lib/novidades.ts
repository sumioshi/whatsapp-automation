import { type Contacts, numberFromJid, roleOf } from './contacts';
import { horaBRT } from './context';
import type { MessageView } from './data';

/** Rótulo curto pra mensagem sem texto (mídia, enquete, etc.). */
const TYPE_LABEL: Record<string, string> = {
  audio: 'áudio',
  image: 'imagem',
  video: 'vídeo',
  gif: 'GIF',
  document: 'documento',
  sticker: 'figurinha',
  location: 'localização',
  contact: 'contato',
  poll: 'enquete',
  event: 'evento',
  call: 'chamada',
};

export interface Novidade {
  quem: string;
  quando: string; // UTC ISO
  hora_brt: string; // hora de Brasília já formatada (o `quando` é UTC; ver horaBRT)
  texto: string;
  type: string;
  /** Se a mensagem é uma RESPOSTA citando outra (reply): o texto citado e quem
   * o mandou. Sem isso, um "pode sim" solto fica ambíguo; com o reply, a IA sabe
   * a que o cliente respondeu. Ausentes quando não é reply. */
  citacao?: string;
  citacao_de?: string;
}

export interface SelectNewResult {
  /** Mensagens novas de CLIENTE (não suas, não do time), em ordem cronológica. */
  mensagens: Novidade[];
  /**
   * Maior timestamp entre TODAS as mensagens após `since` (inclusive as filtradas),
   * pra avançar o checkpoint sem re-escanear. null se nada novo.
   */
  latest: string | null;
  /**
   * Quantas mensagens novas (após `since`) foram DESCARTADAS por não serem de
   * cliente — de "team" ou de outro papel (NÃO conta as próprias `fromMe`).
   * Serve pra distinguir "nada novo" de "tinha coisa nova, mas filtrei tudo por
   * papel" — caso comum em grupo interno onde todos são team. Ver handler de
   * `novidades`.
   */
  ignoradasNaoCliente: number;
}

/** Texto legível de uma mensagem (cai no rótulo do tipo quando não há texto). */
function bodyOf(m: MessageView): string {
  const t = m.text?.trim();
  if (t) return t;
  return m.type !== 'text' ? `[${TYPE_LABEL[m.type] ?? m.type}]` : '';
}

/**
 * Seleciona as mensagens novas (timestamp > since, estrito) que vieram de CLIENTE
 * — descarta as próprias (`fromMe`) e as do "meu time". Puro e testável: não toca IO.
 */
export function selectNew(
  msgs: MessageView[],
  since: string | undefined,
  contacts: Contacts,
): SelectNewResult {
  let latest: string | null = null;
  let ignoradasNaoCliente = 0;
  const mensagens: Novidade[] = [];

  for (const m of msgs) {
    if (since && !(m.timestamp > since)) continue;
    // Avança o checkpoint até o fim do que foi lido, mesmo descartando a msg.
    if (!latest || m.timestamp > latest) latest = m.timestamp;
    if (m.fromMe === true) continue;
    if (roleOf(contacts, numberFromJid(m.sender)) !== 'client') {
      ignoradasNaoCliente++;
      continue;
    }
    mensagens.push({
      quem: m.senderName || m.sender,
      quando: m.timestamp,
      hora_brt: horaBRT(m.timestamp),
      texto: bodyOf(m),
      type: m.type,
      ...(m.quotedText ? { citacao: m.quotedText } : {}),
      ...(m.quotedSender
        ? { citacao_de: contacts.names.get(numberFromJid(m.quotedSender)) || m.quotedSender }
        : {}),
    });
  }

  return { mensagens, latest, ignoradasNaoCliente };
}
