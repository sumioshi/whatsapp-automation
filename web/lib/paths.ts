import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

/**
 * Raiz dos dados coletados. O painel roda em `web/`, então por padrão aponta
 * para `../data` (a pasta que o coletor escreve). Override via WAC_DATA_DIR.
 */
export const DATA_DIR = process.env.WAC_DATA_DIR
  ? resolve(process.env.WAC_DATA_DIR)
  : resolve(process.cwd(), '..', 'data');

/** Arquivo de grupos do coletor (o mesmo que o coletor lê/escreve). */
export const GROUPS_CONFIG = process.env.WAC_GROUPS_CONFIG
  ? resolve(process.env.WAC_GROUPS_CONFIG)
  : resolve(process.cwd(), '..', 'groups.config.json');

/** Estado publicado pelo coletor (conexão + QR). */
export const STATUS_FILE = join(DATA_DIR, '.collector-status.json');

/** Preferências do painel (modelo/idioma de transcrição). */
export const SETTINGS_FILE = join(DATA_DIR, '.panel-settings.json');

/**
 * Sidecar volátil de presença escrito pelo coletor (estado ATUAL por conversa:
 * digitando/online/visto por último). Opcional: se não existir, o painel não
 * mostra presença. O coletor sobrescreve; o painel só lê.
 */
export const PRESENCE_FILE = join(DATA_DIR, '.presence.json');

/** Tags por grupo (jid -> string[]). Arquivo do painel; o coletor não toca. */
export const TAGS_FILE = join(DATA_DIR, '.group-tags.json');

/** API de controle do coletor (envio de mensagens), em 127.0.0.1. */
export const CONTROL_URL = `http://127.0.0.1:${process.env.WAC_CONTROL_PORT ?? '4310'}`;

/** Ids (LID/número) marcados como "meu time". Arquivo do painel. */
export const TEAM_FILE = join(DATA_DIR, '.team.json');

/**
 * Mapa de contatos LID↔telefone↔nome escrito pelo coletor. Opcional: se não
 * existir (coletor antigo), o painel cai no comportamento anterior.
 */
export const CONTACTS_FILE = join(DATA_DIR, '.contacts.json');

/**
 * Estado de chats (pinned/muted/archived/markedAsUnread) escrito pelo coletor.
 * Opcional: se não existir (coletor antigo ou nunca recebeu chats.upsert), o
 * painel trata todas as conversas como ativas/não-fixadas.
 */
export const CHATS_FILE = join(DATA_DIR, '.chats.json');

/**
 * Junta caminhos dentro de DATA_DIR bloqueando path traversal (../).
 * Toda leitura/escrita de arquivo do painel passa por aqui.
 */
export function safeDataPath(...parts: string[]): string {
  const full = resolve(DATA_DIR, ...parts);
  if (full !== DATA_DIR && !full.startsWith(DATA_DIR + sep)) {
    throw new Error('Caminho fora de DATA_DIR bloqueado');
  }
  return full;
}

/** PATH aumentado para o spawn encontrar o mlx_whisper (~/.local/bin, homebrew). */
export function binPath(): string {
  const extra = [`${homedir()}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'];
  return [...extra, process.env.PATH ?? ''].join(sep === '\\' ? ';' : ':');
}
