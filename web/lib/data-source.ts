import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { cloudJson, cloudPost, cloudPostForm, mcpRemote } from './cloud';
import type { Contacts } from './contacts';
import { buildContacts } from './contacts';
import type { GroupEntry } from './config';
import { readGroupsConfig } from './config';
import type { GroupSummary, MessageView } from './data';
import { listGroups, readGroupMessages } from './data';
import type { TriageState } from './triage';
import { readTriage, setAlert, setAutonomo, setMuted, setNote, setResolved, setTypos } from './triage';
import { readAgentSeen, setAgentSeenMany } from './agent-seen';
import { CONTROL_URL } from './paths';

/**
 * Fachada de acesso a dados do MCP. Em modo LOCAL (default) delega às libs de
 * hoje (passthrough — comportamento intocado). Em modo REMOTO (mcpRemote())
 * busca os MESMOS dados via HTTP no painel da nuvem; a lógica de domínio
 * (compact, selectNew, resolveDestino...) continua rodando no MCP.
 */

export async function dsGroupMessages(slug: string): Promise<MessageView[]> {
  if (mcpRemote()) return cloudJson(`/api/messages?slug=${encodeURIComponent(slug)}`);
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

export async function dsSetAgentSeen(updates: Record<string, string>): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/agent-seen', { updates }); return; }
  return setAgentSeenMany(updates);
}

export interface SendOpts {
  humano?: boolean;
  slug?: string;
  typos?: boolean;
  umBalao?: boolean;
}

/** Envio de texto: remoto via /api/send; local direto no control server. */
export async function dsSend(jid: string, text: string, opts: SendOpts = {}): Promise<void> {
  const body = { jid, text, ...opts };
  if (mcpRemote()) { await cloudPost('/api/send', body); return; }
  const res = await fetch(`${CONTROL_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'falha no envio');
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
export async function dsSendMedia(args: SendMediaArgs): Promise<void> {
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
      await cloudPostForm('/api/send-media-json', form);
      return;
    }
    await cloudPost('/api/send-media-json', args);
    return;
  }
  const res = await fetch(`${CONTROL_URL}/send-media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
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
