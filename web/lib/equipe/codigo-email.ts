import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeJsonAtomic } from '../json-store';
import { DATA_DIR } from '../paths';
import { emailValido } from './login-externo';

/**
 * Entrada por código de 6 dígitos mandado por e-mail. O código só existe no e-mail:
 * aqui fica o HMAC dele, a validade, as tentativas e quando foi pedido. Os erros
 * somam por 24 h, atravessando códigos novos: pedir outro código não zera o limite.
 */

export const VALIDADE_MS = 10 * 60_000;
export const MAX_TENTATIVAS = 5;
export const MAX_ENVIOS = 3;
export const MAX_ENVIOS_DIA = 10;
export const MAX_FALHAS_DIA = 10;
const JANELA_ENVIOS_MS = 10 * 60_000;
const DIA_MS = 24 * 60 * 60_000;

export interface EntradaCodigo {
  /** null depois que o código foi usado. */
  hash: string | null;
  expira: number;
  tentativas: number;
  envios: number[];
  falhas: number[];
}
export type EstadoCodigos = Record<string, EntradaCodigo>;
export type MotivoRecusa = 'sem_codigo' | 'vencido' | 'tentativas' | 'errado' | 'bloqueado';
export type MotivoSemEnvio = 'muitos_envios' | 'bloqueado';

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

/** Só a entrada própria do e-mail: "constructor" e afins não acham nada no protótipo. */
function entradaDe(estado: EstadoCodigos, email: string): EntradaCodigo | undefined {
  return Object.hasOwn(estado, email) ? estado[email] : undefined;
}

const recentes = (lista: number[], agora: number, janela: number) => lista.filter((t) => agora - t < janela);

/** Tira o que passou de 24 h: pedidos e erros velhos não pesam mais. */
function limpar(estado: EstadoCodigos, agora: number): EstadoCodigos {
  const out: EstadoCodigos = {};
  for (const [email, e] of Object.entries(estado)) {
    const envios = recentes(e.envios, agora, DIA_MS);
    const falhas = recentes(e.falhas, agora, DIA_MS);
    if (envios.length || falhas.length || e.expira > agora) out[email] = { ...e, envios, falhas };
  }
  return out;
}

/** Guarda um código novo no lugar do anterior, respeitando os tetos de envio e de erro. */
export function registrarCodigo(
  estado: EstadoCodigos,
  email: string,
  codigo: string,
  agora: number,
  chave: string,
): { ok: true; estado: EstadoCodigos } | { ok: false; motivo: MotivoSemEnvio; estado: EstadoCodigos } {
  const limpo = limpar(estado, agora);
  const atual = entradaDe(limpo, email);
  const falhas = atual?.falhas ?? [];
  if (falhas.length >= MAX_FALHAS_DIA) return { ok: false, motivo: 'bloqueado', estado: limpo };
  const envios = atual?.envios ?? [];
  if (recentes(envios, agora, JANELA_ENVIOS_MS).length >= MAX_ENVIOS || envios.length >= MAX_ENVIOS_DIA) {
    return { ok: false, motivo: 'muitos_envios', estado: limpo };
  }
  return {
    ok: true,
    estado: {
      ...limpo,
      [email]: {
        hash: hashDoCodigo(email, codigo, chave),
        expira: agora + VALIDADE_MS,
        tentativas: 0,
        envios: [...envios, agora],
        falhas,
      },
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
  const e = entradaDe(estado, email);
  if (!e || e.hash === null) return { ok: false, motivo: 'sem_codigo', estado };
  const falhas = recentes(e.falhas, agora, DIA_MS);
  if (falhas.length >= MAX_FALHAS_DIA) return { ok: false, motivo: 'bloqueado', estado };
  if (agora > e.expira) return { ok: false, motivo: 'vencido', estado };
  if (e.tentativas >= MAX_TENTATIVAS) return { ok: false, motivo: 'tentativas', estado };
  const limpo = codigo.replace(/\s+/g, '');
  if (/^\d{6}$/.test(limpo) && iguais(hashDoCodigo(email, limpo, chave), e.hash)) {
    // Gasto: o código some, mas os envios e erros do dia continuam contando.
    return { ok: true, estado: { ...estado, [email]: { ...e, hash: null, expira: 0, tentativas: 0, falhas } } };
  }
  return {
    ok: false,
    motivo: 'errado',
    estado: { ...estado, [email]: { ...e, tentativas: e.tentativas + 1, falhas: [...falhas, agora] } },
  };
}

const numeros = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** Estado lido do disco: só e-mails válidos com entrada bem formada; o resto é descartado. */
export function estadoDoArquivo(bruto: unknown): EstadoCodigos {
  const out: EstadoCodigos = {};
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return out;
  for (const email of Object.keys(bruto)) {
    if (!emailValido(email)) continue;
    const e = (bruto as Record<string, unknown>)[email] as Partial<Record<keyof EntradaCodigo, unknown>> | null;
    if (!e || typeof e !== 'object') continue;
    if (!(e.hash === null || typeof e.hash === 'string')) continue;
    if (typeof e.expira !== 'number' || typeof e.tentativas !== 'number' || !numeros(e.envios)) continue;
    out[email] = { hash: e.hash, expira: e.expira, tentativas: e.tentativas, envios: e.envios, falhas: numeros(e.falhas) ? e.falhas : [] };
  }
  return out;
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
      estado = estadoDoArquivo(JSON.parse(await readFile(ARQUIVO(), 'utf8')));
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
