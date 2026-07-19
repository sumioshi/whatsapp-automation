import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Valida uma URL de origem para download antes de buscá-la (defesa contra SSRF).
 * Exige http(s) e resolve o host: rejeita loopback, redes privadas, link-local
 * e o endereço de metadados da nuvem — senão um chamador com o token faria o
 * coletor buscar de serviços internos (127.0.0.1:4310, 169.254.169.254, etc.).
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('url inválida');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('url deve ser http(s)');
  }
  const host = url.hostname;
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!ips.length) throw new Error('host não resolve');
  for (const ip of ips) {
    if (isBlockedIp(ip)) throw new Error('url aponta pra endereço interno/privado');
  }
  return url;
}

/** True para loopback, redes privadas (RFC 1918), link-local/CGNAT e metadados. */
export function isBlockedIp(ip: string): boolean {
  const v = ip.startsWith('::ffff:') ? ip.slice(7) : ip; // IPv4 mapeado em IPv6
  if (isIP(v) === 4) {
    const [a, b] = v.split('.').map(Number);
    if (a === undefined || b === undefined) return true;
    if (a === 10 || a === 127 || a === 0) return true; // privada / loopback / "this host"
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 169 && b === 254) return true; // link-local + metadados da nuvem
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10 (Tailscale/Railway)
    return false;
  }
  // IPv6: loopback, unspecified, link-local (fe80::/10) e ULA (fc00::/7).
  const low = v.toLowerCase();
  if (low === '::1' || low === '::') return true;
  if (low.startsWith('fe8') || low.startsWith('fe9') || low.startsWith('fea') || low.startsWith('feb'))
    return true;
  if (low.startsWith('fc') || low.startsWith('fd')) return true;
  return false;
}
