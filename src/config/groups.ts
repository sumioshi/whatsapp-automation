import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import type { GroupInfo } from '../core/message.js';

const GroupEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  watch: z.boolean().default(false),
});

const GroupsConfigSchema = z.array(GroupEntrySchema);

export type GroupEntry = z.infer<typeof GroupEntrySchema>;

/**
 * Lista de grupos persistida em JSON. Mescla os grupos descobertos no WhatsApp
 * preservando a flag `watch` que o usuário marcou. Suporta recarga em runtime.
 */
export class GroupConfig {
  private entries = new Map<string, GroupEntry>();

  constructor(private readonly path: string) {}

  /** Carrega do disco. Arquivo inexistente é tratado como lista vazia. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = GroupsConfigSchema.parse(JSON.parse(raw));
      this.entries = new Map(parsed.map((e) => [e.id, e]));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.entries = new Map();
        return;
      }
      throw err;
    }
  }

  /** Mescla grupos descobertos (preserva `watch` existente) e persiste. */
  async sync(groups: GroupInfo[]): Promise<void> {
    for (const g of groups) {
      const existing = this.entries.get(g.id);
      this.entries.set(g.id, {
        id: g.id,
        name: g.name,
        watch: existing?.watch ?? false,
      });
    }
    await this.persist();
  }

  isWatched(jid: string): boolean {
    return this.entries.get(jid)?.watch === true;
  }

  watchedCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.watch) count++;
    }
    return count;
  }

  private async persist(): Promise<void> {
    const ordered = [...this.entries.values()].sort((a, b) => a.name.localeCompare(b.name));
    await writeFile(this.path, `${JSON.stringify(ordered, null, 2)}\n`, 'utf8');
  }
}
