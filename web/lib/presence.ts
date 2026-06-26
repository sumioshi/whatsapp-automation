import { readFile } from 'node:fs/promises';
import { PRESENCE_FILE } from './paths';

/** Estados de presença que o coletor grava (espelha PresenceState do domínio). */
type PresenceState = 'available' | 'unavailable' | 'composing' | 'recording' | 'paused';

interface PresenceEntry {
  chatJid: string;
  participant: string;
  state: PresenceState;
  lastSeen: number | null;
  /** ms epoch de quando o coletor observou esse estado. */
  updatedAt: number;
}

interface PresenceSidecar {
  version: number;
  updatedAt: string;
  presences: Record<string, PresenceEntry>;
}

/**
 * "Digitando" e "online" são vivos por instantes. Se o último update tem mais que
 * isso, paramos de mostrá-los como ativos (o WhatsApp para de mandar presença
 * quando o app fecha). `lastSeen` segue válido como "visto por último".
 */
const TYPING_TTL_MS = 12_000; // composing/recording somem rápido
const ONLINE_TTL_MS = 40_000; // "available" sem update vira offline

/** Estado de presença resolvido para a UI (já com staleness aplicada). */
export interface PresenceView {
  /** 'typing' (digitando) · 'recording' (gravando áudio) · 'online' · 'offline'. */
  status: 'typing' | 'recording' | 'online' | 'offline';
  /** "Visto por último" em ms epoch, quando conhecido; senão null. */
  lastSeen: number | null;
}

/**
 * Lê o sidecar de presença e resolve a presença ATUAL de uma conversa (slug).
 * Tolera ausência do arquivo (coletor antigo/offline) e aplica TTL para não
 * mostrar "digitando…" preso. Retorna null quando não há nada útil a mostrar.
 */
export async function readPresence(slug: string): Promise<PresenceView | null> {
  let entry: PresenceEntry | undefined;
  try {
    const raw = await readFile(PRESENCE_FILE, 'utf8');
    const data = JSON.parse(raw) as PresenceSidecar;
    entry = data?.presences?.[slug];
  } catch {
    return null; // sem sidecar ou JSON inválido → sem presença
  }
  if (!entry) return null;

  const age = Date.now() - (entry.updatedAt ?? 0);
  const lastSeen = typeof entry.lastSeen === 'number' ? entry.lastSeen : null;

  if ((entry.state === 'composing' || entry.state === 'recording') && age < TYPING_TTL_MS) {
    return { status: entry.state === 'recording' ? 'recording' : 'typing', lastSeen };
  }
  if (entry.state === 'available' && age < ONLINE_TTL_MS) {
    return { status: 'online', lastSeen };
  }
  // Offline / paused / estados expirados: só vale a pena se soubermos o lastSeen.
  if (lastSeen) return { status: 'offline', lastSeen };
  return null;
}
