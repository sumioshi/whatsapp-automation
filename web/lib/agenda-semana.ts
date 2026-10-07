/**
 * Semana da agenda em horário de Brasília: dias, janela de busca, layout da grade
 * e o rascunho do formulário. Puro: roda no navegador, no servidor e no MCP.
 */
import { type EntradaEvento, type Evento, OFFSET_BRT, somarDias } from './google/evento';

export { somarDias };

const MIN_MS = 60_000;
const DIA_MS = 86_400_000;
const OFFSET_MS = 3 * 3_600_000;
const ALTURA_MINIMA_MIN = 20;
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function diaBrt(ms: number): string {
  return new Date(ms - OFFSET_MS).toISOString().slice(0, 10);
}

export function minutosBrt(ms: number): number {
  return Math.floor(((((ms - OFFSET_MS) % DIA_MS) + DIA_MS) % DIA_MS) / MIN_MS);
}

export function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Segunda-feira da semana do dia. */
export function inicioDaSemana(dia: string): string {
  const diaDaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay();
  return somarDias(dia, -((diaDaSemana + 6) % 7));
}

export function diasDaSemana(segunda: string): string[] {
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
}

export function janelaDaSemana(segunda: string): { de: string; ate: string } {
  return { de: `${segunda}T00:00:00${OFFSET_BRT}`, ate: `${somarDias(segunda, 7)}T00:00:00${OFFSET_BRT}` };
}

export function rotuloDoDia(dia: string): string {
  const semana = DIAS_CURTOS[new Date(`${dia}T00:00:00Z`).getUTCDay()];
  return `${semana} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

export function rotuloDaSemana(dias: string[]): string {
  const a = dias[0] ?? '';
  const b = dias[dias.length - 1] ?? '';
  return `${a.slice(8, 10)}/${a.slice(5, 7)} – ${b.slice(8, 10)}/${b.slice(5, 7)}/${b.slice(0, 4)}`;
}

/** Quando, em texto curto de Brasília (para o MCP e a grade). */
export function rotuloBrt(ev: Evento): string {
  if (ev.diaInteiro) {
    const ultimo = somarDias(ev.fim, -1);
    return ultimo === ev.inicio
      ? `${rotuloDoDia(ev.inicio)} (dia inteiro)`
      : `${rotuloDoDia(ev.inicio)} → ${rotuloDoDia(ultimo)} (dia inteiro)`;
  }
  const s = Date.parse(ev.inicio);
  const e = Date.parse(ev.fim);
  const d1 = diaBrt(s);
  const d2 = diaBrt(e);
  return d1 === d2
    ? `${rotuloDoDia(d1)} ${hhmm(minutosBrt(s))}–${hhmm(minutosBrt(e))}`
    : `${rotuloDoDia(d1)} ${hhmm(minutosBrt(s))} → ${rotuloDoDia(d2)} ${hhmm(minutosBrt(e))}`;
}

export interface Bloco {
  /** `${agenda}|${id}` — liga o bloco ao evento. */
  chave: string;
  dia: string;
  topoMin: number;
  fimMin: number;
  coluna: number;
  colunas: number;
  rotuloHora: string;
}

/** Eventos que se sobrepõem dividem a largura do dia em colunas. */
function distribuir(blocos: Bloco[]): void {
  blocos.sort((a, b) => a.topoMin - b.topoMin || b.fimMin - a.fimMin);
  let grupo: Bloco[] = [];
  let fimDoGrupo = -1;
  let fimDasColunas: number[] = [];
  const fechar = () => {
    for (const b of grupo) b.colunas = fimDasColunas.length;
    grupo = [];
    fimDasColunas = [];
    fimDoGrupo = -1;
  };
  for (const b of blocos) {
    if (grupo.length && b.topoMin >= fimDoGrupo) fechar();
    let coluna = fimDasColunas.findIndex((fim) => fim <= b.topoMin);
    if (coluna === -1) {
      coluna = fimDasColunas.length;
      fimDasColunas.push(b.fimMin);
    } else {
      fimDasColunas[coluna] = b.fimMin;
    }
    b.coluna = coluna;
    grupo.push(b);
    fimDoGrupo = Math.max(fimDoGrupo, b.fimMin);
  }
  fechar();
}

export function blocosDaSemana(
  eventos: Evento[],
  dias: string[],
): { blocos: Bloco[]; diaInteiro: Record<string, Evento[]> } {
  const diaInteiro: Record<string, Evento[]> = {};
  const porDia = new Map<string, Bloco[]>(dias.map((d) => [d, []]));
  for (const ev of eventos) {
    if (ev.diaInteiro) {
      for (const d of dias) if (ev.inicio <= d && d < ev.fim) (diaInteiro[d] ??= []).push(ev);
      continue;
    }
    const s = Date.parse(ev.inicio);
    const e = Date.parse(ev.fim);
    for (const d of dias) {
      const ini = Date.parse(`${d}T00:00:00${OFFSET_BRT}`);
      const fimDia = ini + DIA_MS;
      if (s >= fimDia || e <= ini) continue;
      const topo = Math.floor((Math.max(s, ini) - ini) / MIN_MS);
      const fimReal = Math.ceil((Math.min(e, fimDia) - ini) / MIN_MS);
      porDia.get(d)!.push({
        chave: `${ev.agenda}|${ev.id}`,
        dia: d,
        topoMin: topo,
        fimMin: Math.min(1440, Math.max(fimReal, topo + ALTURA_MINIMA_MIN)),
        coluna: 0,
        colunas: 1,
        rotuloHora: `${hhmm(minutosBrt(s))}–${hhmm(minutosBrt(e))}`,
      });
    }
  }
  const blocos: Bloco[] = [];
  for (const d of dias) {
    const doDia = porDia.get(d)!;
    distribuir(doDia);
    blocos.push(...doDia);
  }
  return { blocos, diaInteiro };
}

/** Texto legível sobre a cor da agenda. */
export function corDoTexto(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#ffffff';
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => Number.parseInt(x as string, 16)) as [number, number, number];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111827' : '#ffffff';
}

/** Estado do formulário de evento. Dia inteiro mostra o fim inclusivo. */
export interface Rascunho {
  id?: string;
  agenda: string;
  titulo: string;
  diaInteiro: boolean;
  dia: string;
  horaInicio: string;
  diaFim: string;
  horaFim: string;
  local: string;
  descricao: string;
  /** E-mails separados por vírgula, espaço ou ponto e vírgula. */
  convidados: string;
  meet: boolean;
  linkMeet?: string;
  link?: string;
  editavel: boolean;
  /** Quem organizou, quando foi outra pessoa: o formulário abre só para ver. */
  organizador?: string;
  recorrente: boolean;
}

export function rascunhoNovo(dia: string, minuto: number, agenda: string): Rascunho {
  const inicio = Math.floor(minuto / 30) * 30;
  const fim = inicio + 60;
  return {
    agenda,
    titulo: '',
    diaInteiro: false,
    dia,
    horaInicio: hhmm(inicio),
    diaFim: dia,
    horaFim: fim >= 1440 ? '23:59' : hhmm(fim),
    local: '',
    descricao: '',
    convidados: '',
    meet: false,
    editavel: true,
    recorrente: false,
  };
}

export function rascunhoDoEvento(ev: Evento): Rascunho {
  const comum = {
    id: ev.id,
    agenda: ev.agenda,
    titulo: ev.titulo,
    diaInteiro: ev.diaInteiro,
    local: ev.local ?? '',
    descricao: ev.descricao ?? '',
    convidados: ev.convidados.join(', '),
    meet: false,
    ...(ev.meet ? { linkMeet: ev.meet } : {}),
    ...(ev.link ? { link: ev.link } : {}),
    editavel: ev.editavel,
    ...(ev.organizador ? { organizador: ev.organizador } : {}),
    recorrente: ev.recorrente,
  };
  if (ev.diaInteiro) {
    return { ...comum, dia: ev.inicio, diaFim: somarDias(ev.fim, -1), horaInicio: '09:00', horaFim: '10:00' };
  }
  const s = Date.parse(ev.inicio);
  const e = Date.parse(ev.fim);
  return { ...comum, dia: diaBrt(s), horaInicio: hhmm(minutosBrt(s)), diaFim: diaBrt(e), horaFim: hhmm(minutosBrt(e)) };
}

export function entradaDoRascunho(r: Rascunho): EntradaEvento {
  const convidados = r.convidados
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const comum = { agenda: r.agenda, titulo: r.titulo, local: r.local, descricao: r.descricao, convidados, meet: r.meet };
  return r.diaInteiro
    ? { ...comum, diaInteiro: true, inicio: r.dia, fim: somarDias(r.diaFim, 1) }
    : {
        ...comum,
        diaInteiro: false,
        inicio: `${r.dia}T${r.horaInicio}:00${OFFSET_BRT}`,
        fim: `${r.diaFim}T${r.horaFim}:00${OFFSET_BRT}`,
      };
}

/** Evento no formato das tools de agenda do MCP (horário de Brasília em `hora_brt`). */
export function resumoParaIa(ev: Evento, nomeDaAgenda?: string): Record<string, unknown> {
  return {
    agenda: ev.agenda,
    ...(nomeDaAgenda ? { agenda_nome: nomeDaAgenda } : {}),
    id: ev.id,
    titulo: ev.titulo,
    hora_brt: rotuloBrt(ev),
    inicio: ev.inicio,
    fim: ev.fim,
    ...(ev.local ? { local: ev.local } : {}),
    ...(ev.meet ? { meet: ev.meet } : {}),
    ...(ev.convidados.length ? { convidados: ev.convidados } : {}),
    ...(ev.link ? { link: ev.link } : {}),
    ...(ev.recorrente ? { recorrente: true } : {}),
    ...(ev.editavel ? {} : { somente_leitura: true }),
    ...(ev.organizador ? { organizador: ev.organizador } : {}),
  };
}
