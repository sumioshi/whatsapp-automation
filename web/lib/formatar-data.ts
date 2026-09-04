/**
 * Formatação de data para a UI, com fuso fixo de Brasília.
 *
 * Duas famílias, porque os dados têm dois formatos e uma regra diferente cada:
 *
 * - DATA pura (`YYYY-MM-DD`, como `contrato.inicio`/`contrato.fim`): não tem hora
 *   nem fuso. Passar por `new Date()` a interpreta como meia-noite UTC e, num fuso
 *   negativo, a exibição volta um dia (`2026-12-31` viraria `30/12`). Por isso o
 *   corte é feito por fatia de string, sem `Date` no meio.
 * - INSTANTE (ISO completo, como `geradoEm`): aí sim é `Date` + `Intl` com
 *   `timeZone` fixo. O fuso fixo também é o que faz o HTML do servidor bater com o
 *   do navegador (mesmo padrão do `horaBRT` de `./context`).
 *
 * Puro e sem `node:*` — o componente client importa direto.
 */

const FUSO = 'America/Sao_Paulo';
const DATA_RE = /^\d{4}-\d{2}-\d{2}/;

/** `2026-12-31` → `31/12`. Vazio/inválido → `—`. */
export function dataCurta(data: string | null | undefined): string {
  if (!data || !DATA_RE.test(data)) return '—';
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** `2026-12-31` → `31/12/2026`. Vazio/inválido → `—`. */
export function dataLonga(data: string | null | undefined): string {
  if (!data || !DATA_RE.test(data)) return '—';
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
}

/** Instante ISO → `31/12` em Brasília. Vazio/inválido → `—`. */
export function instanteCurto(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(d);
}

/** Instante ISO → `31/12/2026 21:05` em Brasília. Inválido → o ISO cru. */
export function instanteLongo(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
