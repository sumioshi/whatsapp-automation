import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from './json-store';
import { DATA_DIR } from './paths';
import { slugify } from './slug';

/** Estado de triagem do painel (slug = grupo). Arquivo do painel; o coletor não toca. */
const TRIAGE_FILE = join(DATA_DIR, '.triage.json');

export interface TriageState {
  resolved: Record<string, string>; // slug -> ISO timestamp "resolvido até aqui"
  muted: Record<string, boolean>; // slug -> silenciado (coleta mas não alerta)
  notes: Record<string, string>; // slug -> notas livres (mini-CRM)
  lastSeen: Record<string, string>; // slug -> ISO timestamp da última visita
  copilot: Record<string, boolean>; // slug -> copiloto de IA ligado (opt-in por grupo)
  alertar: Record<string, boolean>; // slug -> notificar no Mac quando chega msg (opt-in por chat)
  autonomo: Record<string, boolean>; // slug -> agente envia sem confirmar (default ausente = confirmar)
  memorySources: Record<string, string[]>; // slug -> lista de dirs absolutos de memória vinculados
}

function emptyState(): TriageState {
  return { resolved: {}, muted: {}, notes: {}, lastSeen: {}, copilot: {}, alertar: {}, autonomo: {}, memorySources: {} };
}

/** Normaliza um objeto cru em Record<string, T>, descartando entradas do tipo errado. */
function pick<T>(raw: unknown, ok: (v: unknown) => v is T): Record<string, T> {
  const out: Record<string, T> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (ok(v)) out[k] = v;
    }
  }
  return out;
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Normaliza Record<string, string[]> descartando entradas inválidas. */
function pickArrays(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (isStringArray(v)) out[k] = v;
    }
  }
  return out;
}

/** Lê o estado de triagem (default vazio se não existir ou estiver corrompido). */
export async function readTriage(): Promise<TriageState> {
  try {
    const parsed = JSON.parse(await readFile(TRIAGE_FILE, 'utf8')) as Record<string, unknown>;
    return {
      resolved: pick(parsed.resolved, isString),
      muted: pick(parsed.muted, isBool),
      notes: pick(parsed.notes, isString),
      lastSeen: pick(parsed.lastSeen, isString),
      copilot: pick(parsed.copilot, isBool),
      alertar: pick(parsed.alertar, isBool),
      autonomo: pick(parsed.autonomo, isBool),
      memorySources: pickArrays(parsed.memorySources),
    };
  } catch {
    return emptyState();
  }
}

/** Marca resolvido até o timestamp; passe '' para desfazer (remove a entrada). */
export async function setResolved(slug: string, isoTimestamp: string): Promise<void> {
  const state = await readTriage();
  if (isoTimestamp) state.resolved[slug] = isoTimestamp;
  else delete state.resolved[slug];
  await writeJsonAtomic(TRIAGE_FILE, state);
}

/** Silencia/dessilencia um grupo (coleta mas não alerta). */
export async function setMuted(slug: string, muted: boolean): Promise<void> {
  const state = await readTriage();
  if (muted) state.muted[slug] = true;
  else delete state.muted[slug];
  await writeJsonAtomic(TRIAGE_FILE, state);
}

/** Liga/desliga o copiloto de IA de um grupo (opt-in por grupo; default = ausente = desligado). */
export async function setCopilot(slug: string, enabled: boolean): Promise<void> {
  const state = await readTriage();
  if (enabled) state.copilot[slug] = true;
  else delete state.copilot[slug];
  await writeJsonAtomic(TRIAGE_FILE, state);
}

/** Liga/desliga o alerta (notificação no Mac) de um chat — grupo ou DM (opt-in por conversa).
 * Normaliza a chave com slugify: o notifier faz fs.watch em data/<slug>/, então um nome de
 * grupo cru ("Acme Corp") como chave geraria ENOENT. slugify é idempotente sobre slugs
 * e dm-<id> já válidos, e converte nome→slug (acme-corp), batendo com a pasta real. */
export async function setAlert(slug: string, enabled: boolean): Promise<void> {
  const key = slugify(slug);
  const state = await readTriage();
  if (enabled) state.alertar[key] = true;
  else delete state.alertar[key];
  await writeJsonAtomic(TRIAGE_FILE, state);
}

/** Liga/desliga o MODO AUTÔNOMO de um chat (o agente envia sem confirmar com o humano).
 * Default ausente = `confirmar` (seguro: a IA mostra o texto e espera OK). Convenção respeitada
 * pela IA + estado persistido — NÃO é trava de código (o handler não recusa envio). Mesma
 * normalização de chave do setAlert (slugify idempotente). */
export async function setAutonomo(slug: string, enabled: boolean): Promise<void> {
  const key = slugify(slug);
  const state = await readTriage();
  if (enabled) state.autonomo[key] = true;
  else delete state.autonomo[key];
  await writeJsonAtomic(TRIAGE_FILE, state);
}

/** True se o chat está em modo autônomo (a IA pode enviar sem confirmar). Default false. */
export async function isAutonomo(slug: string): Promise<boolean> {
  const state = await readTriage();
  return state.autonomo[slugify(slug)] === true;
}

/** Define a nota livre de um grupo; nota vazia remove a entrada. */
export async function setNote(slug: string, note: string): Promise<void> {
  const state = await readTriage();
  const clean = note.trim();
  if (clean) state.notes[slug] = clean;
  else delete state.notes[slug];
  await writeJsonAtomic(TRIAGE_FILE, state);
}

/** Registra a última visita ao grupo; passe '' para limpar. */
export async function setLastSeen(slug: string, isoTimestamp: string): Promise<void> {
  const state = await readTriage();
  if (isoTimestamp) state.lastSeen[slug] = isoTimestamp;
  else delete state.lastSeen[slug];
  await writeJsonAtomic(TRIAGE_FILE, state);
}

/** Define as fontes de memória vinculadas ao grupo (lista de dirs absolutos). Lista vazia remove. */
export async function setMemorySources(slug: string, dirs: string[]): Promise<void> {
  if (!dirs.every((d) => typeof d === 'string')) throw new Error('dirs inválidos');
  const state = await readTriage();
  const clean = dirs.filter(Boolean);
  if (clean.length > 0) state.memorySources[slug] = clean;
  else delete state.memorySources[slug];
  await writeJsonAtomic(TRIAGE_FILE, state);
}
