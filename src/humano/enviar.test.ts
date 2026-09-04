import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enviarHumano } from './enviar.js';
import type { Passo } from './plano.js';

let dataDir: string;
beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'wac-enviar-'));
});
afterAll(async () => rm(dataDir, { recursive: true, force: true }));

describe('enviarHumano', () => {
  it('monta o plano e entrega pelo gateway; umBalao não fatia', async () => {
    const chamadas: Array<{ jid: string; textos: string[] }> = [];
    const gateway = {
      async entregarHumano(jid: string, plano: Passo[]) {
        const textos = plano.flatMap((p) => (p.tipo === 'enviar' ? [p.texto] : []));
        chamadas.push({ jid, textos });
        return { enviados: textos.length, total: textos.length };
      },
    };
    const r = await enviarHumano(
      gateway,
      dataDir,
      '5511@s.whatsapp.net',
      'oi tudo bem? vc quer o filtro por data ou por status?',
      { umBalao: true },
    );
    expect(r.baloes).toBe(1);
    expect(chamadas[0]?.jid).toBe('5511@s.whatsapp.net');
    expect(chamadas[0]?.textos).toEqual(['oi tudo bem? vc quer o filtro por data ou por status?']);
  });
});
