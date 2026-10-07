import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (s: string, salt: Buffer, len: number) => Promise<Buffer>;
const TAMANHO = 32;

/** Senha guardada como "scrypt$<sal>$<hash>" (base64). Nunca em texto puro. */
export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(senha, sal, TAMANHO);
  return `scrypt$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export async function verificarSenha(senha: string, guardada: string): Promise<boolean> {
  const [alg, salB64, hashB64] = guardada.split('$');
  if (alg !== 'scrypt' || !salB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, 'base64');
  if (esperado.length !== TAMANHO) return false;
  const obtido = await scrypt(senha, Buffer.from(salB64, 'base64'), TAMANHO);
  return timingSafeEqual(obtido, esperado);
}

/** Senha inicial gerada pelo painel (mostrada uma vez ao dono). */
export function gerarSenha(): string {
  return randomBytes(12).toString('base64url');
}
