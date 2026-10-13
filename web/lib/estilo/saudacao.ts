/**
 * Saudação de período ("bom dia", "boa tarde", "boa noite") no horário de
 * Brasília. A entrega sai com latência humana, às vezes horas depois (ou só na
 * abertura do expediente), então a conferência vale para quando o texto é
 * escrito e de novo para quando ele vai sair.
 */
export type Saudacao = "bom dia" | "boa tarde" | "boa noite";

const FUSO = "America/Sao_Paulo";
/** Minutos em volta de cada virada (5h, 12h, 18h) em que as duas saudações cabem. */
const FOLGA_MIN = 30;
const VIRADAS: Array<{ minuto: number; antes: Saudacao; depois: Saudacao }> = [
  { minuto: 5 * 60, antes: "boa noite", depois: "bom dia" },
  { minuto: 12 * 60, antes: "bom dia", depois: "boa tarde" },
  { minuto: 18 * 60, antes: "boa tarde", depois: "boa noite" },
];

const relogio = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "14:32" no horário de Brasília. */
export function horaBrt(d: Date): string {
  return relogio.format(d);
}

function minutoDoDia(d: Date): number {
  const [h = 0, m = 0] = horaBrt(d).split(":").map(Number);
  return h * 60 + m;
}

/** Bom dia das 5h ao meio-dia, boa tarde até as 18h, boa noite no resto. */
export function saudacaoDoHorario(d: Date): Saudacao {
  const m = minutoDoDia(d);
  if (m >= 5 * 60 && m < 12 * 60) return "bom dia";
  if (m >= 12 * 60 && m < 18 * 60) return "boa tarde";
  return "boa noite";
}

/** A saudação do horário e, perto de uma virada, a do outro lado dela também. */
export function saudacoesAceitas(d: Date): Saudacao[] {
  const m = minutoDoDia(d);
  const aceitas = new Set<Saudacao>([saudacaoDoHorario(d)]);
  for (const v of VIRADAS) {
    if (Math.abs(m - v.minuto) < FOLGA_MIN) {
      aceitas.add(v.antes);
      aceitas.add(v.depois);
    }
  }
  return [...aceitas];
}

const SAUDACAO_PERIODO = /(?<![\p{L}\d])(?:(bom\s*dia+)|(boa\s*tarde+(?:zinha)?)|(boa\s*noit(?:e+|inha)))(?![\p{L}\d])/iu;

/** A saudação de período que aparece no texto, em qualquer grafia ("bom diaa", "boa noitinha"). */
export function saudacaoDoTexto(texto: string): Saudacao | null {
  const m = texto.match(SAUDACAO_PERIODO);
  if (!m) return null;
  if (m[1]) return "bom dia";
  return m[2] ? "boa tarde" : "boa noite";
}

/** A saudação usada no texto, se ela não cabe no horário, e a que caberia. */
export function saudacaoForaDoHorario(texto: string, d: Date): { usada: Saudacao; cabe: Saudacao } | null {
  const usada = saudacaoDoTexto(texto);
  if (!usada || saudacoesAceitas(d).includes(usada)) return null;
  return { usada, cabe: saudacaoDoHorario(d) };
}

/** Linha do `preparar_resposta` para quando a saudação cabe. */
export function instrucaoDeSaudacao(d: Date): string {
  return `saudação do horário: '${saudacaoDoHorario(d)}' (são ${horaBrt(d)} em Brasília)`;
}

/**
 * Aviso para quando a entrega agendada cai em outro período ("bom dia" que só
 * sairia às 12h40); null quando a saudação ainda cabe na hora da entrega.
 */
export function saudacaoNaEntrega(texto: string, entregarEm: string | undefined): string | null {
  if (!entregarEm) return null;
  const quando = new Date(entregarEm);
  if (Number.isNaN(quando.getTime())) return null;
  const fora = saudacaoForaDoHorario(texto, quando);
  if (!fora) return null;
  return `a entrega sairia às ${horaBrt(quando)} e o texto tem '${fora.usada}', que nessa hora já é '${fora.cabe}'; tira a saudação de período ou usa 'opa'`;
}
