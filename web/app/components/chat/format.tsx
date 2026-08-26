import { Fragment } from "react";

/* Helpers de formatação do chat — compartilhados entre Timeline e Bubble. */

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Chave de dia (YYYY-MM-DD local) pra agrupar mensagens. */
export function mediaUrl(mediaPath: string): string {
  return `/api/media/${mediaPath.split("/").map(encodeURIComponent).join("/")}`;
}

export function baseName(p: string): string {
  return p.split("/").pop() ?? p;
}

/** Número (user-part) de um jid: 250...@lid -> 250..., 55..:12@s.. -> 55.. */
export function numberFromJid(jid: string): string {
  return (jid.split("@")[0] ?? "").split(":")[0] ?? "";
}

export type Contacts = { names: Map<string, string>; mine: Set<string>; team: Set<string> };

/** Resolve um jid para nome de exibição (você / nome / número). */
export function senderLabel(jid: string | null | undefined, contacts: Contacts): string | null {
  if (!jid) return null;
  const num = numberFromJid(jid);
  if (contacts.mine.has(num)) return "você";
  return contacts.names.get(num) ?? num;
}

/* Cor de nome por remetente (estilo Telegram em grupo): paleta muted estável
   por número — o mesmo remetente tem sempre a mesma cor. */
const SENDER_COLORS = [
  "text-[#6cb2f5]",
  "text-[#5ec9a0]",
  "text-[#c592ff]",
  "text-[#e5c07b]",
  "text-[#ef8b9e]",
  "text-[#63c7d8]",
];

export function senderColor(jid: string): string {
  const num = numberFromJid(jid);
  let h = 0;
  for (let i = 0; i < num.length; i++) h = (h * 31 + num.charCodeAt(i)) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length] ?? "text-info";
}

// Formatação estilo WhatsApp: *negrito* _itálico_ ~tachado~ `mono` (e ** __ ~~ ``` ).
export const FMT =
  /(\*\*[^\n]+?\*\*|__[^\n]+?__|~~[^\n]+?~~|```[\s\S]+?```|\*[^*\n]+?\*|_[^_\n]+?_|~[^~\n]+?~|`[^`\n]+?`)/g;

export const MONO_CLS = "mono rounded bg-bg/60 px-1 text-[0.92em]";

const URL_RE = /(https?:\/\/[^\s<>]+)/g;

/** Aplica formatação inline num trecho: URLs viram links ANTES (senão o
    `_itálico_` do WhatsApp come os `utm_medium` de dentro da URL). */
export function formatInline(text: string, keyPrefix: string): React.ReactNode[] {
  // split com grupo de captura: índices ímpares são as URLs capturadas
  return text.split(URL_RE).flatMap((part, i) => {
    const key = `${keyPrefix}-u${i}`;
    if (i % 2 === 1) {
      return [
        <a
          key={key}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="break-all text-info underline decoration-info/40 underline-offset-2 hover:decoration-info"
        >
          {part}
        </a>,
      ];
    }
    return formatWa(part, key);
  });
}

/** Formatação WhatsApp pura: *negrito* _itálico_ ~tachado~ `mono`. */
function formatWa(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(FMT).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^\*\*[\s\S]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^__[\s\S]+__$/.test(part)) return <em key={key}>{part.slice(2, -2)}</em>;
    if (/^~~[\s\S]+~~$/.test(part)) return <s key={key}>{part.slice(2, -2)}</s>;
    if (/^```[\s\S]+```$/.test(part))
      return (
        <code key={key} className={MONO_CLS}>
          {part.slice(3, -3)}
        </code>
      );
    if (/^\*[\s\S]+\*$/.test(part)) return <strong key={key}>{part.slice(1, -1)}</strong>;
    if (/^_[\s\S]+_$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    if (/^~[\s\S]+~$/.test(part)) return <s key={key}>{part.slice(1, -1)}</s>;
    if (/^`[\s\S]+`$/.test(part))
      return (
        <code key={key} className={MONO_CLS}>
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

/** Troca menções @<id> por @você/@nome e aplica formatação WhatsApp no resto. */
export function renderMentions(text: string, contacts: Contacts): React.ReactNode[] {
  return text.split(/(@\d{6,})/g).map((part, i) => {
    const match = /^@(\d{6,})$/.exec(part);
    if (!match) {
      return <Fragment key={`t${i}`}>{formatInline(part, `t${i}`)}</Fragment>;
    }
    const num = match[1] ?? "";
    if (contacts.mine.has(num)) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens estáticos de um texto
        <span
          key={i}
          className="rounded border border-accent/25 bg-accent/15 px-1 font-medium text-accent"
        >
          @você
        </span>
      );
    }
    const name = contacts.names.get(num);
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: tokens estáticos de um texto
      <span key={i} className="font-medium text-info">
        @{name ?? num}
      </span>
    );
  });
}

/** Segmented control com indicador deslizante (efeito #9). Segmentos de largura igual. */
