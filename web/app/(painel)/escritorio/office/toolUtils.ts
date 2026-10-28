/** Map status prefixes back to tool names for animation selection */
export const STATUS_TO_TOOL: Record<string, string> = {
  Reading: 'Read',
  Searching: 'Grep',
  Globbing: 'Glob',
  Fetching: 'WebFetch',
  'Searching web': 'WebSearch',
  Writing: 'Write',
  Editing: 'Edit',
  Running: 'Bash',
  Task: 'Task',
};

export function extractToolName(status: string): string | null {
  for (const [prefix, tool] of Object.entries(STATUS_TO_TOOL)) {
    if (status.startsWith(prefix)) return tool;
  }
  const first = status.split(/[\s:]/)[0];
  return first || null;
}

import { ZOOM_DEFAULT_DPR_FACTOR, ZOOM_MIN } from '../constants';

/** Compute a default integer zoom level (device pixels per sprite pixel) */
export function defaultZoom(): number {
  if (typeof window === 'undefined') return 2;
  const dpr = window.devicePixelRatio || 1;
  if (window.innerWidth < 768) {
    // Em celulares, inicia em zoom 2 (nítido para ver as baias e arrastar com 1 dedo)
    const fit = Math.floor((window.innerWidth * dpr) / (26 * 16));
    return Math.max(ZOOM_MIN, Math.max(2, fit));
  }
  const availW = Math.max(640, window.innerWidth - 264) * dpr;
  const availH = Math.max(480, window.innerHeight - 64) * dpr;
  const fit = Math.floor(Math.min(availW / (36 * 16), availH / (26 * 16)));
  return Math.max(ZOOM_MIN, Math.min(Math.round(ZOOM_DEFAULT_DPR_FACTOR * dpr), Math.max(2, fit)));
}
