/**
 * Rotas que os componentes da conversa chamam. O painel do dono usa as rotas
 * de sempre; a área de atendimento usa as próprias, endereçadas por slug (o
 * atendente nunca informa jid nem número).
 */
export type ModoPainel = 'dono' | 'atendimento';

export interface Pedido {
  url: string;
  body: Record<string, unknown>;
}

export interface MsgAlvo {
  id: string;
  groupJid: string;
  sender: string;
  fromMe?: boolean;
}

export interface RotasPainel {
  modo: ModoPainel;
  inicio: string;
  chat(slug: string): string;
  status: string;
  mensagens(slug: string, q?: { before?: string; limit?: number }): string;
  presenca(slug: string): string;
  midia(mediaPath: string): string;
  transcrever(slug: string, mediaPath: string): Pedido;
  documento(slug: string, mediaPath: string): Pedido;
  reagir(slug: string, m: MsgAlvo, emoji: string): Pedido;
  enviarTexto(slug: string, jid: string | null, texto: string): Pedido | null;
  enviarMidia(slug: string, jid: string | null): { url: string; campos: Record<string, string> } | null;
  visto(slug: string, iso: string): Pedido;
  recursos: { copiloto: boolean; time: boolean };
  /** Resposta 401 de uma rota da área manda pro login (sessão vencida ou conta desativada). */
  aoNaoAutenticado: boolean;
}

const enc = encodeURIComponent;
const caminho = (p: string) => p.split('/').map(enc).join('/');

function consulta(slug: string, q?: { before?: string; limit?: number }): string {
  let s = `slug=${enc(slug)}`;
  if (q?.before) s += `&before=${enc(q.before)}`;
  if (q?.limit) s += `&limit=${q.limit}`;
  return s;
}

const DONO: RotasPainel = {
  modo: 'dono',
  inicio: '/',
  chat: (slug) => `/g/${slug}`,
  status: '/api/status',
  mensagens: (slug, q) => `/api/messages?${consulta(slug, q)}`,
  presenca: (slug) => `/api/presence?slug=${enc(slug)}`,
  midia: (p) => `/api/media/${caminho(p)}`,
  transcrever: (slug, mediaPath) => ({ url: '/api/transcribe', body: { slug, mediaPath } }),
  documento: (_slug, mediaPath) => ({ url: '/api/document', body: { mediaPath } }),
  reagir: (_slug, m, emoji) => ({
    url: '/api/react',
    body: { jid: m.groupJid, msgId: m.id, participant: m.sender, fromMe: m.fromMe, emoji },
  }),
  enviarTexto: (_slug, jid, texto) => (jid ? { url: '/api/send', body: { jid, text: texto } } : null),
  enviarMidia: (_slug, jid) => (jid ? { url: '/api/send-media', campos: { jid } } : null),
  visto: (slug, iso) => ({ url: '/api/triage', body: { action: 'lastSeen', slug, value: iso } }),
  recursos: { copiloto: true, time: true },
  aoNaoAutenticado: false,
};

const BASE = '/api/atendimento';

const ATENDIMENTO: RotasPainel = {
  modo: 'atendimento',
  inicio: '/atendimento',
  chat: (slug) => `/atendimento/g/${slug}`,
  status: `${BASE}/status`,
  mensagens: (slug, q) => `${BASE}/mensagens?${consulta(slug, q)}`,
  presenca: (slug) => `${BASE}/presenca?slug=${enc(slug)}`,
  midia: (p) => `${BASE}/midia/${caminho(p)}`,
  transcrever: (slug, mediaPath) => ({ url: `${BASE}/transcrever`, body: { slug, mediaPath } }),
  documento: (slug, mediaPath) => ({ url: `${BASE}/documento`, body: { slug, mediaPath } }),
  reagir: (slug, m, emoji) => ({ url: `${BASE}/reagir`, body: { slug, msgId: m.id, emoji } }),
  enviarTexto: (slug, _jid, texto) => ({ url: `${BASE}/enviar`, body: { slug, texto } }),
  enviarMidia: (slug) => ({ url: `${BASE}/enviar-midia`, campos: { slug } }),
  visto: (slug) => ({ url: `${BASE}/visto`, body: { slug } }),
  recursos: { copiloto: false, time: false },
  aoNaoAutenticado: true,
};

export function rotasPainel(modo: ModoPainel): RotasPainel {
  return modo === 'atendimento' ? ATENDIMENTO : DONO;
}

/** Pra onde ir quando uma rota responde `status`; null = fica onde está. */
export function destinoSemSessao(rotas: RotasPainel, status: number, caminhoAtual: string): string | null {
  if (status !== 401 || !rotas.aoNaoAutenticado) return null;
  return `/login?next=${enc(caminhoAtual)}`;
}
