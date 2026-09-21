import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { cloudFetch, cloudJson, cloudPost, cloudPostForm, mcpRemote } from './cloud';
import type { Contacts } from './contacts';
import { buildContacts } from './contacts';
import type { GroupEntry } from './config';
import { readGroupsConfig } from './config';
import type { GroupSummary, MessageView } from './data';
import { listGroups, readGroupMessages } from './data';
import type { AgenteExecutor, AgenteModo, TriageState } from './triage';
import { readTriage, setAlert, setAutonomo, setMuted, setNote, setResolved, setTypos, setEtiquetas, setAgente, setExecutor, setLatenciaMaxima } from './triage';
import { readAgentSeen, setAgentSeenMany } from './agent-seen';
import type { Contrato } from './contratos';
import { readContratos, setContrato } from './contratos';
import type { EntradaFeature, Feature } from './features';
import { listarFeatures, registrarFeature } from './features';
import type { Dashboard } from './dashboard';
import { CONTROL_URL } from './paths';

/**
 * Fachada de acesso a dados do MCP. Em modo LOCAL (default) delega às libs de
 * hoje (passthrough — comportamento intocado). Em modo REMOTO (mcpRemote())
 * busca os MESMOS dados via HTTP no painel da nuvem; a lógica de domínio
 * (compact, selectNew, resolveDestino...) continua rodando no MCP.
 */

export async function dsGroupMessages(slug: string): Promise<MessageView[]> {
  // all=1: o histórico INTEIRO, como o modo local lê do disco. A rota pagina por
  // default (janela do painel), e uma janela silenciosa aqui fazia buscar, desde,
  // msgId de editar/reagir e o lote de transcrição enxergarem só as últimas 150.
  if (mcpRemote()) return cloudJson(`/api/messages?slug=${encodeURIComponent(slug)}&all=1`);
  return readGroupMessages(slug);
}

export async function dsListGroups(): Promise<GroupSummary[]> {
  if (mcpRemote()) return cloudJson('/api/groups/summary');
  return listGroups();
}

export async function dsTriage(): Promise<TriageState> {
  if (mcpRemote()) return cloudJson('/api/triage');
  return readTriage();
}

/** Shape cru do /api/contacts/raw (Map/Set viram arrays no fio). */
interface ContactsRaw {
  names: [string, string][];
  ownIds: string[];
  teamIds: string[];
  phones: [string, string][];
  lids: string[];
  hasSidecar: boolean;
}

export async function dsContacts(): Promise<Contacts> {
  if (!mcpRemote()) return buildContacts();
  const raw = await cloudJson<ContactsRaw>('/api/contacts/raw');
  return {
    names: new Map(raw.names),
    ownIds: new Set(raw.ownIds),
    teamIds: new Set(raw.teamIds),
    phones: new Map(raw.phones),
    lids: new Set(raw.lids),
    hasSidecar: raw.hasSidecar,
  };
}

export async function dsGroupsConfig(): Promise<GroupEntry[]> {
  if (!mcpRemote()) return readGroupsConfig();
  // No remoto, a fonte é o /api/groups (config real): o `id` é o JID @g.us — o
  // responder usa esse id como DESTINO do envio, então slug no lugar quebra o
  // envio (Baileys não conhece slug). O matchGrupo casa slug slugificando o name.
  return cloudJson<GroupEntry[]>('/api/groups');
}

export async function dsAgentSeen(): Promise<Record<string, string>> {
  if (mcpRemote()) return cloudJson('/api/agent-seen');
  return readAgentSeen();
}

// ---------- ESCRITA ----------

export async function dsSetResolved(slug: string, value: string): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'resolved', slug, value }); return; }
  return setResolved(slug, value);
}
export async function dsSetMuted(slug: string, value: boolean): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'muted', slug, value }); return; }
  return setMuted(slug, value);
}
export async function dsSetNote(slug: string, value: string): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'note', slug, value }); return; }
  return setNote(slug, value);
}
export async function dsSetAlert(slug: string, value: boolean): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'alertar', slug, value }); return; }
  return setAlert(slug, value);
}
export async function dsSetAutonomo(slug: string, value: boolean): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'autonomo', slug, value }); return; }
  return setAutonomo(slug, value);
}
export async function dsSetTypos(slug: string, value: boolean): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'typos', slug, value }); return; }
  return setTypos(slug, value);
}
export async function dsSetLatenciaMaxima(slug: string, value: number | null): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'latenciaMaxima', slug, value }); return; }
  return setLatenciaMaxima(slug, value);
}
export async function dsSetAgente(slug: string, value: AgenteModo): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'agente', slug, value }); return; }
  return setAgente(slug, value);
}
export async function dsSetExecutor(slug: string, value: AgenteExecutor): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'executor', slug, value }); return; }
  return setExecutor(slug, value);
}
export async function dsSetEtiquetas(slug: string, etiquetas: string[]): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/triage', { action: 'etiquetas', slug, value: etiquetas }); return; }
  return setEtiquetas(slug, etiquetas);
}

export async function dsSetAgentSeen(updates: Record<string, string>): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/agent-seen', { updates }); return; }
  return setAgentSeenMany(updates);
}

export interface SendOpts {
  humano?: boolean;
  slug?: string;
  typos?: boolean;
  umBalao?: boolean;
  /** Balões explícitos (um item = um balão, na ordem) — quem chama já decidiu a quebra. */
  baloes?: string[];
  urgencia?: 'agora' | 'normal' | 'calma';
  /** id de mensagem recebida a citar no 1º balão. */
  citar?: string;
  /** true = segura até a entrega terminar (formato v1). Default: ticket na hora. */
  aguardar?: boolean;
  /** Segundos que o agente já gastou desde que leu o chat (desconta da latência). */
  decorrido_s?: number;
  latenciaMaxima_s?: number;
}

/**
 * Resultado de um envio humanizado. Por padrão vem um `ticket` (entrega
 * agendada, sai com latência humana); com `aguardar` vem o resultado final:
 * `cancelado` quando a entrega foi interrompida, `enviados` diz quantos
 * balões saíram, `baloes` é o total planejado.
 */
export interface SendResult {
  ticket?: string;
  previsao_s?: number;
  estado?: string;
  entregarEm?: string;
  regime?: string;
  /** Estimativa de quanto a entrega leva depois que começa a digitar (s). */
  duracao_s?: number;
  substituiu?: string;
  /** Do ticket substituído: quantos balões já tinham saído, e quais. */
  substituiu_enviados?: number;
  substituiu_baloes_enviados?: string[];
  /** Balões do pedido descartados por repetir mensagem recente da conta. */
  descartados?: string[];
  /** JID em que a entrega foi de fato agendada, e o pedido quando o WhatsApp corrigiu (ex.: nono dígito). */
  jid?: string;
  jid_corrigido_de?: string;
  cancelado: boolean;
  enviados?: number;
  baloes?: number;
  motivo?: string;
}

export interface EntregaResumo {
  ticket: string;
  jid: string;
  slug: string;
  estado: string;
  motivo: string | null;
  enviados: number;
  total: number;
  previsao_s: number;
  entregarEm: string;
  lerEm: string;
  regime: string;
  mensagensNovas: number;
  origem: string;
  /** Estimativa de duração da digitação (s) e quando ela começou (null se ainda agendado). */
  duracao_s?: number;
  iniciadoEm?: string | null;
}

export interface SendExtra {
  /** Cancelamento vindo de quem chama (o `extra.signal` da tool MCP). */
  signal?: AbortSignal;
}

export async function dsSend(
  jid: string,
  text: string,
  opts: SendOpts = {},
  extra: SendExtra = {},
): Promise<SendResult> {
  const body = { jid, text, ...opts };
  let res: Response;
  if (mcpRemote()) {
    res = await cloudPost('/api/send', body, { signal: extra.signal });
  } else {
    res = await fetch(`${CONTROL_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: extra.signal,
    });
  }
  const data = (await res.json()) as Record<string, unknown> & { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'falha no envio');
  const str = (k: string) => (typeof data[k] === 'string' ? { [k]: data[k] as string } : {});
  const num = (k: string) => (typeof data[k] === 'number' ? { [k]: data[k] as number } : {});
  const lista = (k: string) =>
    Array.isArray(data[k]) ? { [k]: (data[k] as unknown[]).filter((x): x is string => typeof x === 'string') } : {};
  return {
    cancelado: data.cancelado === true,
    ...str('ticket'),
    ...num('previsao_s'),
    ...num('duracao_s'),
    ...str('estado'),
    ...str('entregarEm'),
    ...str('regime'),
    ...str('substituiu'),
    ...num('substituiu_enviados'),
    ...lista('substituiu_baloes_enviados'),
    ...lista('descartados'),
    ...str('jid'),
    ...str('jid_corrigido_de'),
    ...num('enviados'),
    ...num('baloes'),
    ...str('motivo'),
  };
}

/** Estado de uma entrega humanizada por ticket ou por chat (null = nenhuma registrada). */
export async function dsStatusEntrega(ref: { jid?: string; ticket?: string }): Promise<EntregaResumo | null> {
  const q = ref.ticket ? `ticket=${encodeURIComponent(ref.ticket)}` : `jid=${encodeURIComponent(ref.jid ?? '')}`;
  let res: Response;
  if (mcpRemote()) {
    try {
      res = await cloudFetch(`/api/entregas?${q}`);
    } catch (e) {
      // cloudFetch lança em qualquer status ≠ 2xx; 404 aqui é "ticket desconhecido".
      if (e instanceof Error && /HTTP 404/.test(e.message)) return null;
      throw e;
    }
  } else {
    res = await fetch(
      ref.ticket
        ? `${CONTROL_URL}/entregas/${encodeURIComponent(ref.ticket)}`
        : `${CONTROL_URL}/entregas?jid=${encodeURIComponent(ref.jid ?? '')}`,
    );
  }
  if (res.status === 404) return null;
  const data = (await res.json()) as { ok?: boolean; error?: string; entrega?: EntregaResumo | null };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'falha ao consultar entrega');
  return data.entrega ?? null;
}

/** Cancela a entrega humanizada agendada ou em andamento (o que já saiu fica). */
export async function dsCancelarEnvio(
  ref: { jid?: string; ticket?: string },
): Promise<{ cancelado: boolean; ticket?: string; enviados?: number }> {
  const res = mcpRemote()
    ? await cloudPost('/api/cancelar-envio', ref)
    : await fetch(`${CONTROL_URL}/cancelar-envio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ref),
      });
  const data = (await res.json()) as { ok?: boolean; error?: string; cancelado?: boolean; ticket?: string; enviados?: number };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'falha ao cancelar');
  return {
    cancelado: data.cancelado === true,
    ...(data.ticket ? { ticket: data.ticket } : {}),
    ...(typeof data.enviados === 'number' ? { enviados: data.enviados } : {}),
  };
}

/** Edita mensagem PRÓPRIA já enviada. */
export async function dsEditMessage(jid: string, msgId: string, texto: string): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/edit-message', { jid, msgId, text: texto }); return; }
  const res = await fetch(`${CONTROL_URL}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, msgId, text: texto }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'falha na edição');
}

/** Reage (emoji) a uma mensagem; emoji vazio remove. */
export async function dsReact(
  jid: string,
  msgId: string,
  emoji: string,
  participant?: string,
  fromMe?: boolean,
): Promise<void> {
  const body = { jid, msgId, emoji, participant, fromMe };
  if (mcpRemote()) { await cloudPost('/api/react', body); return; }
  const res = await fetch(`${CONTROL_URL}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'falha na reação');
}

interface SendMediaArgs {
  jid: string;
  kind: string;
  path: string;
  caption?: string;
  fileName?: string;
  mimetype?: string;
}
export async function dsSendMedia(args: SendMediaArgs, extra: SendExtra = {}): Promise<void> {
  if (mcpRemote()) {
    // A nuvem não enxerga o disco local. Se o arquivo existe aqui (arquivo novo do
    // operador, ou mídia já baixada), sobe os BYTES via multipart (sem inflar em
    // base64/JSON — importante pra vídeo); senão encaminha o path como mediaPath
    // residente na nuvem (reenvio de mídia sincronizada).
    if (existsSync(args.path)) {
      const bytes = await readFile(args.path);
      const form = new FormData();
      form.set('jid', args.jid);
      form.set('kind', args.kind);
      if (args.caption) form.set('caption', args.caption);
      if (args.fileName) form.set('fileName', args.fileName);
      if (args.mimetype) form.set('mimetype', args.mimetype);
      const blob = new Blob([bytes], args.mimetype ? { type: args.mimetype } : {});
      form.set('file', blob, args.fileName ?? 'file');
      await cloudPostForm('/api/send-media-json', form, { signal: extra.signal });
      return;
    }
    await cloudPost('/api/send-media-json', args, { signal: extra.signal });
    return;
  }
  const res = await fetch(`${CONTROL_URL}/send-media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: extra.signal,
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'falha no envio');
}

interface PerfilArgs {
  name?: string;
  status?: string;
  picturePath?: string;
}
export async function dsEditarPerfil(args: PerfilArgs): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/profile', args); return; }
  const fwd = async (rota: string, body: unknown): Promise<void> => {
    const res = await fetch(`${CONTROL_URL}${rota}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) throw new Error(data.error ?? `falha em ${rota}`);
  };
  if (args.name) await fwd('/profile/name', { name: args.name });
  if (args.status) await fwd('/profile/status', { status: args.status });
  if (args.picturePath) await fwd('/profile/picture', { path: args.picturePath });
}

export async function dsContratos(): Promise<Record<string, Contrato>> {
  if (mcpRemote()) return cloudJson('/api/contratos');
  return readContratos();
}
export async function dsSetContrato(slug: string, patch: Partial<Contrato>): Promise<Contrato> {
  if (mcpRemote()) {
    const res = await cloudPost('/api/contratos', { slug, patch });
    return ((await res.json()) as { contrato: Contrato }).contrato;
  }
  return setContrato(slug, patch);
}

export async function dsFeatures(filtro: { slug?: string; desde?: string } = {}): Promise<Feature[]> {
  if (mcpRemote()) {
    const q = new URLSearchParams();
    if (filtro.slug) q.set('slug', filtro.slug);
    if (filtro.desde) q.set('desde', filtro.desde);
    return cloudJson(`/api/features?${q.toString()}`);
  }
  return listarFeatures(filtro);
}
// cloudPost usa Basic Auth do painel; /api/v1/features exige Bearer. Por isso o
// remoto chama a rota do PAINEL (/api/features, POST abaixo), não a v1.
export async function dsRegistrarFeature(entrada: EntradaFeature): Promise<{ feature: Feature; duplicada: boolean }> {
  if (mcpRemote()) {
    const res = await cloudPost('/api/features', entrada);
    return (await res.json()) as { feature: Feature; duplicada: boolean };
  }
  return registrarFeature(entrada);
}

export async function dsDashboard(): Promise<Dashboard> {
  if (mcpRemote()) return cloudJson('/api/dashboard');
  const { montarDashboardAtual } = await import('./dashboard-atual');
  return montarDashboardAtual();
}
