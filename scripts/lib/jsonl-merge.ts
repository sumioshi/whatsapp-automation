// Merge de arquivos .jsonl append-only do coletor (nuvem ∪ local), sem perda.

/** Linhas não-vazias, sem espaços nas pontas. */
function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * messages.jsonl: união por `id`. Em empate de id, a versão LOCAL prevalece
 * (tem o contexto resolvido do Mac). Ordena por `timestamp` (ISO, ordenável
 * lexicograficamente). Idempotente. Retorna jsonl com `\n` final.
 */
export function mergeMessagesById(local: string, remote: string): string {
  const byId = new Map<string, { ts: string; line: string }>();
  const add = (line: string) => {
    let obj: { id?: string; timestamp?: string };
    try {
      obj = JSON.parse(line);
    } catch {
      return;
    }
    if (!obj.id) return;
    byId.set(obj.id, { ts: obj.timestamp ?? '', line });
  };
  for (const l of lines(remote)) add(l); // remoto primeiro…
  for (const l of lines(local)) add(l); // …local sobrescreve no empate
  const sorted = [...byId.values()].sort((a, b) => a.ts.localeCompare(b.ts));
  return sorted.length ? sorted.map((v) => v.line).join('\n') + '\n' : '';
}

/** Sidecars .jsonl (fatos imutáveis): dedup por linha inteira, ordem preservada. */
export function mergeDedupLines(local: string, remote: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of [...lines(local), ...lines(remote)]) {
    if (seen.has(l)) continue;
    seen.add(l);
    out.push(l);
  }
  return out.length ? out.join('\n') + '\n' : '';
}
