/**
 * Número de telefone digitado à mão para abrir uma conversa direta. O WhatsApp
 * endereça a conta por `<dígitos com DDI>@s.whatsapp.net`; aqui só se confere a
 * forma (entre 8 e 15 dígitos, o teto do padrão internacional). Se a conta existe
 * é o coletor quem pergunta ao WhatsApp na hora do envio.
 *
 * Puro e sem `node:*`: a tela importa direto.
 */

const MIN_DIGITOS = 8;
const MAX_DIGITOS = 15;

export type AnaliseNumero =
  | {
      valido: true;
      digitos: string;
      jid: string;
      /** Slug da conversa direta (`dm-<dígitos>`), o mesmo que o coletor usa. */
      slug: string;
      exibicao: string;
      /** Dica que não impede o envio (ex.: número do Brasil sem o 55). */
      aviso: string | null;
    }
  | { valido: false; digitos: string; erro: string | null };

function soDigitos(s: string): string {
  return s.replace(/\D/g, '');
}

/** `5511987654321` → `+55 11 98765-4321`. Número de outro país fica `+<dígitos>`. */
export function formatarTelefone(numero: string): string {
  const d = soDigitos(numero);
  if (!d) return '';
  const br = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  if (br) return `+55 ${br[1]} ${br[2]}-${br[3]}`;
  return `+${d}`;
}

/**
 * Celular (DDD + 9 + 8 dígitos) ou fixo (DDD + 8 dígitos começando de 2 a 5) do
 * Brasil, digitado sem o 55 na frente.
 */
function pareceBrasilSemDdi(d: string): boolean {
  return /^[1-9]{2}9\d{8}$/.test(d) || /^[1-9]{2}[2-5]\d{7}$/.test(d);
}

export function analisarNumero(texto: string): AnaliseNumero {
  const digitos = soDigitos(texto);
  if (!digitos) return { valido: false, digitos, erro: null };
  if (digitos.length < MIN_DIGITOS) {
    return { valido: false, digitos, erro: `Número incompleto. Informe pelo menos ${MIN_DIGITOS} dígitos, com o DDI.` };
  }
  if (digitos.length > MAX_DIGITOS) {
    return { valido: false, digitos, erro: `Número longo demais. Com o DDI, um telefone tem no máximo ${MAX_DIGITOS} dígitos.` };
  }
  return {
    valido: true,
    digitos,
    jid: `${digitos}@s.whatsapp.net`,
    slug: `dm-${digitos}`,
    exibicao: formatarTelefone(digitos),
    aviso: pareceBrasilSemDdi(digitos) ? 'Parece faltar o DDI. Números do Brasil começam com 55.' : null,
  };
}
