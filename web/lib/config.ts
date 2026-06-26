import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GROUPS_CONFIG, SETTINGS_FILE, STATUS_FILE, TAGS_FILE, TEAM_FILE } from './paths';

// ---------- Grupos ----------

export interface GroupEntry {
  id: string;
  name: string;
  watch: boolean;
}

export interface GroupWithTags extends GroupEntry {
  tags: string[];
}

export async function readGroupsConfig(): Promise<GroupEntry[]> {
  try {
    const raw = await readFile(GROUPS_CONFIG, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is GroupEntry => !!e && typeof e === 'object' && 'id' in e)
      .map((e) => ({ id: String(e.id), name: String(e.name ?? e.id), watch: e.watch === true }));
  } catch {
    return [];
  }
}

async function readTags(): Promise<Record<string, string[]>> {
  try {
    const parsed = JSON.parse(await readFile(TAGS_FILE, 'utf8')) as Record<string, unknown>;
    const out: Record<string, string[]> = {};
    for (const [id, tags] of Object.entries(parsed)) {
      if (Array.isArray(tags)) out[id] = tags.map(String);
    }
    return out;
  } catch {
    return {};
  }
}

/** Grupos com tags anexadas (ordenados por nome). */
export async function readGroupsWithTags(): Promise<GroupWithTags[]> {
  const [groups, tags] = await Promise.all([readGroupsConfig(), readTags()]);
  return groups
    .map((g) => ({ ...g, tags: tags[g.id] ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Liga/desliga o monitoramento de um grupo e persiste (escrita atômica). */
export async function setGroupWatch(id: string, watch: boolean): Promise<GroupWithTags[]> {
  return setManyWatch([id], watch);
}

/** Liga/desliga o monitoramento de vários grupos de uma vez. */
export async function setManyWatch(ids: string[], watch: boolean): Promise<GroupWithTags[]> {
  const groups = await readGroupsConfig();
  const set = new Set(ids);
  for (const g of groups) {
    if (set.has(g.id)) g.watch = watch;
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  await writeJsonAtomic(GROUPS_CONFIG, groups);
  return readGroupsWithTags();
}

/** Define as tags de um grupo (arquivo separado, o coletor não toca). */
export async function setGroupTags(id: string, tagList: string[]): Promise<GroupWithTags[]> {
  const tags = await readTags();
  const clean = [...new Set(tagList.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (clean.length) tags[id] = clean;
  else delete tags[id];
  await writeJsonAtomic(TAGS_FILE, tags);
  return readGroupsWithTags();
}

// ---------- Status do coletor ----------

export interface CollectorStatus {
  connection: 'open' | 'connecting' | 'qr' | 'close' | 'unknown' | 'offline';
  qr: string | null;
  watchedCount: number;
  updatedAt: string | null;
}

const OFFLINE: CollectorStatus = {
  connection: 'offline',
  qr: null,
  watchedCount: 0,
  updatedAt: null,
};

export async function readStatus(): Promise<CollectorStatus> {
  try {
    const raw = await readFile(STATUS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CollectorStatus>;
    return {
      connection: parsed.connection ?? 'unknown',
      qr: parsed.qr ?? null,
      watchedCount: parsed.watchedCount ?? 0,
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch {
    return OFFLINE;
  }
}

// ---------- Preferências de transcrição ----------

export interface PanelSettings {
  model: string;
  language: string;
}

export const DEFAULT_SETTINGS: PanelSettings = {
  model: process.env.WAC_WHISPER_MODEL ?? 'mlx-community/whisper-large-v3-mlx',
  language: process.env.WAC_WHISPER_LANG ?? 'pt',
};

export async function readSettings(): Promise<PanelSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PanelSettings>;
    return {
      model: parsed.model || DEFAULT_SETTINGS.model,
      language: parsed.language || DEFAULT_SETTINGS.language,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function writeSettings(patch: Partial<PanelSettings>): Promise<PanelSettings> {
  const current = await readSettings();
  const next: PanelSettings = {
    model: patch.model || current.model,
    language: patch.language || current.language,
  };
  await writeJsonAtomic(SETTINGS_FILE, next);
  return next;
}

// ---------- Time (nós vs cliente) ----------

/** Ids marcados como "meu time" (data/.team.json). */
export async function readTeam(): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(TEAM_FILE, 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function setTeam(ids: string[]): Promise<string[]> {
  const clean = [...new Set(ids.map((i) => i.trim()).filter(Boolean))];
  await writeJsonAtomic(TEAM_FILE, clean);
  return clean;
}

// ---------- util ----------

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${Date.now()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}
