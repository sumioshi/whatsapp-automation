// Notifica no Mac quando chega mensagem de CLIENTE num chat marcado com `alertar`.
// Processo independente do coletor (não toca src/): observa os messages.jsonl via
// fs.watch e dispara `osascript display notification`. O agente, ao ser avisado,
// usa a tool MCP `novidades` pra puxar o conteúdo.
import { execFile } from 'node:child_process';
import { type FSWatcher, statSync, watch } from 'node:fs';
import { open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Contacts } from '../web/lib/contacts';

// As libs do painel resolvem DATA_DIR por cwd — fixa antes de importá-las (dinâmico).
const DATA_DIR = process.env.WAC_DATA_DIR ?? resolve(process.cwd(), 'data');
process.env.WAC_DATA_DIR = DATA_DIR;

interface RawMsg {
  timestamp?: string;
  sender?: string;
  senderName?: string;
  fromMe?: boolean;
  type?: string;
  text?: string;
  group?: string;
}

const TYPE_LABEL: Record<string, string> = {
  audio: 'áudio',
  image: 'imagem',
  video: 'vídeo',
  gif: 'GIF',
  document: 'documento',
  sticker: 'figurinha',
  location: 'localização',
  contact: 'contato',
  poll: 'enquete',
  event: 'evento',
};

function bodyOf(m: RawMsg): string {
  const t = m.text?.trim();
  if (t) return t;
  return m.type && m.type !== 'text' ? `[${TYPE_LABEL[m.type] ?? m.type}]` : '';
}

/** Dispara a notificação macOS. Corpo/título vão como argv pro AppleScript — nunca
 * interpolados no script — pra escaping seguro de aspas/emoji. */
function notify(title: string, body: string): void {
  execFile(
    'osascript',
    [
      '-e',
      'on run argv',
      '-e',
      'display notification (item 1 of argv) with title (item 2 of argv) sound name "Glass"',
      '-e',
      'end run',
      body.slice(0, 180),
      title.slice(0, 120),
    ],
    (err) => {
      if (err) console.error('[notifier] osascript falhou:', err.message);
    },
  );
  console.log(`[notifier] notifiquei: ${title} — ${body.slice(0, 60)}`);
}

async function main(): Promise<void> {
  const { readTriage } = await import('../web/lib/triage');
  const { buildContacts, numberFromJid, roleOf } = await import('../web/lib/contacts');

  let contacts: Contacts = await buildContacts();
  // Revalida o mapa de contatos de tempos em tempos (buildContacts varre tudo, é caro).
  setInterval(
    () => {
      void buildContacts()
        .then((c) => {
          contacts = c;
        })
        .catch(() => {});
    },
    10 * 60 * 1000,
  );

  const offsets = new Map<string, number>(); // slug -> bytes já lidos
  const partials = new Map<string, string>(); // slug -> linha incompleta pendente
  const watchers = new Map<string, FSWatcher>();
  let alertSlugs = new Set<string>();

  // Debounce por chat: agrupa rajada numa única notificação.
  interface Pending {
    items: { quem: string; texto: string }[];
    nome: string;
    timer: NodeJS.Timeout | null;
  }
  const pending = new Map<string, Pending>();

  function flush(slug: string): void {
    const p = pending.get(slug);
    if (!p || p.items.length === 0) return;
    const n = p.items.length;
    const last = p.items[n - 1];
    const body = n === 1 ? `${last.quem}: ${last.texto}` : `${n} novas · última — ${last.quem}: ${last.texto}`;
    notify(p.nome, body);
    p.items = [];
    p.timer = null;
  }

  function enqueue(slug: string, nome: string, quem: string, texto: string): void {
    let p = pending.get(slug);
    if (!p) {
      p = { items: [], nome, timer: null };
      pending.set(slug, p);
    }
    p.nome = nome;
    p.items.push({ quem, texto });
    if (!p.timer) p.timer = setTimeout(() => flush(slug), 4000);
  }

  async function readNew(slug: string): Promise<void> {
    const path = join(DATA_DIR, slug, 'messages.jsonl');
    let fh;
    try {
      fh = await open(path, 'r');
    } catch {
      return;
    }
    try {
      const { size } = await fh.stat();
      let off = offsets.get(slug) ?? size;
      if (size < off) {
        off = 0; // arquivo encolheu (truncate/rotação) — relê do começo
        partials.set(slug, '');
      }
      if (size <= off) {
        offsets.set(slug, size);
        return;
      }
      const len = size - off;
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, off);
      offsets.set(slug, size);
      const data = (partials.get(slug) ?? '') + buf.toString('utf8');
      const lines = data.split('\n');
      partials.set(slug, lines.pop() ?? ''); // última pode estar incompleta
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let m: RawMsg;
        try {
          m = JSON.parse(trimmed) as RawMsg;
        } catch {
          continue;
        }
        if (m.fromMe === true || !m.sender) continue;
        if (roleOf(contacts, numberFromJid(m.sender)) !== 'client') continue;
        enqueue(slug, m.group || slug, m.senderName || m.sender, bodyOf(m));
      }
    } finally {
      await fh.close();
    }
  }

  function startWatch(slug: string): void {
    if (watchers.has(slug)) return;
    const dir = join(DATA_DIR, slug);
    // Offset inicial = tamanho atual: não notifica o histórico já existente.
    try {
      offsets.set(slug, statSync(join(dir, 'messages.jsonl')).size);
    } catch {
      offsets.set(slug, 0);
    }
    try {
      const w = watch(dir, (_event, filename) => {
        if (filename === 'messages.jsonl') void readNew(slug);
      });
      watchers.set(slug, w);
    } catch (e) {
      console.error(`[notifier] não consegui observar ${slug}:`, (e as Error).message);
    }
  }

  function stopWatch(slug: string): void {
    watchers.get(slug)?.close();
    watchers.delete(slug);
    offsets.delete(slug);
    partials.delete(slug);
    const p = pending.get(slug);
    if (p?.timer) clearTimeout(p.timer);
    pending.delete(slug);
  }

  async function reconcile(): Promise<void> {
    let next: Set<string>;
    try {
      const triage = await readTriage();
      next = new Set(Object.keys(triage.alertar).filter((s) => triage.alertar[s]));
    } catch {
      return;
    }
    for (const slug of next) if (!alertSlugs.has(slug)) startWatch(slug);
    for (const slug of alertSlugs) if (!next.has(slug)) stopWatch(slug);
    alertSlugs = next;
    console.log(`[notifier] observando ${alertSlugs.size} chat(s): ${[...alertSlugs].join(', ') || '(nenhum)'}`);
  }

  // Observa o .triage.json pelo DIRETÓRIO (writeJsonAtomic troca o inode por rename;
  // watch no arquivo direto pararia de emitir).
  let triageTimer: NodeJS.Timeout | null = null;
  try {
    watch(DATA_DIR, (_event, filename) => {
      if (filename === '.triage.json') {
        if (triageTimer) clearTimeout(triageTimer);
        triageTimer = setTimeout(() => void reconcile(), 300);
      }
    });
  } catch (e) {
    console.error('[notifier] não consegui observar a triagem:', (e as Error).message);
  }

  await reconcile();
  console.log('[notifier] no ar — notifica mensagens de cliente nos chats com alerta.');
}

main().catch((err) => {
  console.error('[notifier] erro fatal:', err);
  process.exit(1);
});
