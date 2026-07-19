import { describe, expect, it } from 'vitest';
import { assertPublicHttpUrl, isBlockedIp } from './safe-url';

describe('isBlockedIp', () => {
  it('bloqueia loopback, privadas, link-local/metadados e CGNAT', () => {
    for (const ip of [
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // metadados da nuvem
      '100.64.0.1', // CGNAT / Tailscale
      '0.0.0.0',
      '::1',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1', // IPv4 mapeado em IPv6
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('libera IPs públicos', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700::1111']) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });
});

describe('assertPublicHttpUrl', () => {
  it('rejeita esquema não-http', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow('http(s)');
    await expect(assertPublicHttpUrl('nao-e-url')).rejects.toThrow('inválida');
  });

  it('rejeita host que resolve pra loopback', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1:4310/send-media')).rejects.toThrow(
      'interno/privado',
    );
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      'interno/privado',
    );
  });
});
