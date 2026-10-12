import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from '../json-store';
import { DATA_DIR } from '../paths';

/**
 * Entrada por código de 6 dígitos mandado por e-mail. O código só existe no e-mail:
 * aqui fica o HMAC dele, a validade, as tentativas e quando foi pedido.
 */

export const VALIDADE_MS = 10 * 60_000;
export const MAX_TENTATIVAS = 5;
export const MAX_ENVIOS = 3;
const JANELA_ENVIOS_MS = 10 * 60_000;
/** Pedido mais velho que isso some na próxima gravação. */
const GUARDA_MS = 60 * 60_000;

export interface EntradaCodigo {
  hash: string;
  expira: number;
  tentativas: number;
  envios: number[];
}
export type EstadoCodigos = Record<string, EntradaCodigo>;
export type MotivoRecusa = 'sem_codigo' | 'vencido' | 'tentativas' | 'errado';

export function novoCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashDoCodigo(email: string, codigo: string, chave: string): string {
  return createHmac('sha256', chave).update(`login-codigo.${email}.${codigo}`).digest('base64url');
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function limpar(estado: EstadoCodigos, agora: number): EstadoCodigos {
  const out: EstadoCodigos = {};
  for (const [email, e] of Object.entries(estado)) {
    if (agora - Math.max(e.expira, ...e.envios) < GUARDA_MS) out[email] = e;
  }
  return out;
}

/** Guarda um código novo no lugar do anterior, respeitando o teto de envios por janela. */
export function registrarCodigo(
  estado: EstadoCodigos,
  email: string,
  codigo: string,
  agora: number,
  chave: string,
): { ok: boolean; estado: EstadoCodigos } {
  const limpo = limpar(estado, agora);
  const envios = (limpo[email]?.envios ?? []).filter((t) => agora - t < JANELA_ENVIOS_MS);
  if (envios.length >= MAX_ENVIOS) return { ok: false, estado: limpo };
  return {
    ok: true,
    estado: {
      ...limpo,
      [email]: { hash: hashDoCodigo(email, codigo, chave), expira: agora + VALIDADE_MS, tentativas: 0, envios: [...envios, agora] },
    },
  };
}

/** Confere o código: certo, ele é gasto; errado, conta uma tentativa. */
export function conferirCodigo(
  estado: EstadoCodigos,
  email: string,
  codigo: string,
  agora: number,
  chave: string,
): { ok: true; estado: EstadoCodigos } | { ok: false; motivo: MotivoRecusa; estado: EstadoCodigos } {
  const e = estado[email];
  if (!e) return { ok: false, motivo: 'sem_codigo', estado };
  if (agora > e.expira) return { ok: false, motivo: 'vencido', estado };
  if (e.tentativas >= MAX_TENTATIVAS) return { ok: false, motivo: 'tentativas', estado };
  const limpo = codigo.replace(/\s+/g, '');
  if (/^\d{6}$/.test(limpo) && iguais(hashDoCodigo(email, limpo, chave), e.hash)) {
    const { [email]: _gasto, ...resto } = estado;
    return { ok: true, estado: resto };
  }
  return { ok: false, motivo: 'errado', estado: { ...estado, [email]: { ...e, tentativas: e.tentativas + 1 } } };
}

export interface EmailDeCodigo {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

export function emailDoCodigo(codigo: string, remetente: string, para: string): EmailDeCodigo {
  const text = [
    'Seu código para entrar no Balcão:',
    '',
    codigo,
    '',
    'Ele vale por 10 minutos e funciona uma vez só.',
    'Se você não pediu este código, ignore este e-mail: ninguém entra sem ele.',
  ].join('\n');
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:32px 16px;background:#eef0f3;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;color:#121417">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border:1px solid #d9dde3;border-radius:12px" cellpadding="0" cellspacing="0"><tr><td style="padding:28px">
<p style="margin:0 0 20px;font-size:15px;font-weight:600">Balcão</p>
<p style="margin:0 0 12px;font-size:14px;color:#353c46">Seu código para entrar:</p>
<p style="margin:0 0 20px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:600;letter-spacing:6px">${codigo}</p>
<p style="margin:0 0 8px;font-size:13px;color:#535c68">Ele vale por 10 minutos e funciona uma vez só.</p>
<p style="margin:0;font-size:13px;color:#535c68">Se você não pediu este código, ignore este e-mail: ninguém entra sem ele.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { from: remetente, to: [para], subject: `${codigo} é o seu código do Balcão`, text, html };
}

/** Manda pelo Resend; true quando o Resend aceitou o e-mail. */
export async function enviarPeloResend(email: EmailDeCodigo, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(email),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Configuração do envio: sem chave ou remetente, o código por e-mail fica desligado. */
export function configDoEnvio(env: Partial<NodeJS.ProcessEnv> = process.env): { apiKey: string; remetente: string } | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const remetente = env.RESEND_FROM?.trim();
  return apiKey && remetente ? { apiKey, remetente } : null;
}

const ARQUIVO = () => join(DATA_DIR, '.login-codigos.json');
let fila: Promise<unknown> = Promise.resolve();

/** Lê, altera e grava o estado dos códigos, um pedido de cada vez. */
export function comCodigos<T>(fn: (estado: EstadoCodigos) => { estado: EstadoCodigos; resultado: T }): Promise<T> {
  const vez = fila.then(async () => {
    let estado: EstadoCodigos = {};
    try {
      estado = JSON.parse(await readFile(ARQUIVO(), 'utf8')) as EstadoCodigos;
    } catch {
      // arquivo ausente ou corrompido: começa vazio
    }
    const { estado: novo, resultado } = fn(estado);
    await writeJsonAtomic(ARQUIVO(), novo, { mode: 0o600 });
    return resultado;
  });
  fila = vez.catch(() => undefined);
  return vez;
}
