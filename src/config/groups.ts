import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import type { GroupInfo } from '../core/message.js';
import { logger } from '../logger.js';
import { slugify } from '../storage/paths.js';

const GroupEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  watch: z.boolean().default(false),
  // Slug estável do diretório em data/: definido quando o grupo é visto pela
  // primeira vez e preservado em renomeações, pra não fragmentar o histórico.
  slug: z.string().optional(),
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

  /**
   * Mescla grupos descobertos e persiste. Preserva `watch` e o `slug` já
   * gravado; entrada sem slug (config antigo) ganha o slug do nome que estava
   * no arquivo — assim uma renomeação nunca troca o diretório de dados.
   */
  async sync(groups: GroupInfo[]): Promise<void> {
    for (const g of groups) {
      const existing = this.entries.get(g.id);
      const slug = existing?.slug ?? slugify(existing?.name ?? g.name);
      if (existing && existing.name !== g.name) {
        logger.info(
          { de: existing.name, para: g.name, slug },
          '✏️  Grupo renomeado — slug/diretório mantidos.',
        );
      }
      this.entries.set(g.id, {
        id: g.id,
        name: g.name,
        watch: existing?.watch ?? false,
        slug,
      });
    }
    await this.persist();
  }

  isWatched(jid: string): boolean {
    return this.entries.get(jid)?.watch === true;
  }

  /** Slug persistido do grupo (undefined se o jid ainda não passou pelo sync). */
  slugOf(jid: string): string | undefined {
    return this.entries.get(jid)?.slug;
  }

  /** Mapa jid→slug de todas as entradas com slug persistido. */
  slugMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const e of this.entries.values()) {
      if (e.slug) map.set(e.id, e.slug);
    }
    return map;
  }

  /** Entradas monitoradas (jid + slug) — insumo do reconciliador. */
  watchedEntries(): Array<{ id: string; slug: string | undefined }> {
    const out: Array<{ id: string; slug: string | undefined }> = [];
    for (const e of this.entries.values()) {
      if (e.watch) out.push({ id: e.id, slug: e.slug });
    }
    return out;
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
