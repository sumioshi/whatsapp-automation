import { cloudJson, mcpRemote } from './cloud';
import type { Contacts } from './contacts';
import { buildContacts } from './contacts';
import type { GroupEntry } from './config';
import { readGroupsConfig } from './config';
import type { GroupSummary, MessageView } from './data';
import { listGroups, readGroupMessages } from './data';
import type { TriageState } from './triage';
import { readTriage } from './triage';
import { readAgentSeen } from './agent-seen';

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
