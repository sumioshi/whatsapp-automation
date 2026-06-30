import { cloudJson, cloudPost, mcpRemote } from './cloud';
import type { Contacts } from './contacts';
import { buildContacts } from './contacts';
import type { GroupEntry } from './config';
import { readGroupsConfig } from './config';
import type { GroupSummary, MessageView } from './data';
import { listGroups, readGroupMessages } from './data';
import type { TriageState } from './triage';
import { readTriage, setAlert, setAutonomo, setMuted, setNote, setResolved } from './triage';
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
  // No remoto, derivamos os grupos do summary (slug + name bastam pro matchGrupo).
  const summary = await cloudJson<GroupSummary[]>('/api/groups/summary');
  return summary.map((g) => ({ id: g.slug, name: g.name, watch: true }));
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

export async function dsSetAgentSeen(updates: Record<string, string>): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/agent-seen', { updates }); return; }
  return setAgentSeenMany(updates);
}

/** Envio de texto: remoto via /api/send; local direto no control server. */
export async function dsSend(jid: string, text: string): Promise<void> {
  if (mcpRemote()) { await cloudPost('/api/send', { jid, text }); return; }
  const res = await fetch(`${CONTROL_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jid, text }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) throw new Error(data.error ?? 'falha no envio');
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
  if (mcpRemote()) { await cloudPost('/api/send-media-json', args); return; }
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
