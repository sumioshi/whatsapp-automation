import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilaEnvio } from './fila';
import type { Passo } from './plano';

const JID = '5511000000001@s.whatsapp.net';
let dataDir: string;

function gatewayFalso(opts: { falhar?: boolean; demoraMs?: number } = {}) {
  const log: string[] = [];
  const gw = {
    async entregarHumano(
      _jid: string,
      plano: Passo[],
      signal?: AbortSignal,
      aoEnviar?: (enviados: number) => void,
    ) {
      log.push('entregar');
      const textos = plano.filter((p) => p.tipo === 'enviar');
      if (opts.falhar) throw new Error('socket fechado');
      let enviados = 0;
      for (const _ of textos) {
        if (signal?.aborted) return { enviados, total: textos.length, cancelado: true };
        await new Promise((r) => setTimeout(r, opts.demoraMs ?? 0));
        if (signal?.aborted) return { enviados, total: textos.length, cancelado: true };
        enviados += 1;
        log.push(`balao${enviados}`);
        aoEnviar?.(enviados);
      }
      return { enviados, total: textos.length, cancelado: false };
    },
    async marcarLido() {
      log.push('lido');
    },
    async sendPresence(e: string) {
      log.push(`presenca:${e}`);
    },
  };
  return { gw, log };
}

async function fila(gw: ReturnType<typeof gatewayFalso>['gw']) {
  return FilaEnvio.carregar({ dataDir, gateway: gw, conectado: () => true, rng: () => 0.5 });
}

/** Deixa o I/O real (fs) andar entre os timers falsos. */
async function flush() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
}
async function avancar(ms: number) {
  let restante = ms;
  while (restante > 0) {
    const passo = Math.min(restante, 500);
    await vi.advanceTimersByTimeAsync(passo);
    await flush();
    restante -= passo;
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-09-15T14:00:00Z')); // terça, 11:00 em São Paulo: fator de hora 1
  dataDir = await mkdtemp(join(tmpdir(), 'wac-fila-'));
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(dataDir, { recursive: true, force: true });
});

describe('FilaEnvio', () => {
  it('enfileira, lê no lerEm, entrega no entregarEm, emite eventos e persiste', async () => {
    const { gw, log } = gatewayFalso();
    const f = await fila(gw);
    const eventos: string[] = [];
    f.on('entrega', (t) => eventos.push(t.estado));
    const { ticket } = await f.enfileirar({
      jid: JID,
      slug: 'chat',
      baloes: ['oi', 'tudo'],
      origem: 'mcp',
      urgencia: 'agora',
    });
    expect(ticket.estado).toBe('agendado');
    expect(ticket.previsao_s).toBe(5);
    await avancar(6000);
    expect(log[0]).toBe('lido');
    expect(log).toContain('entregar');
    expect(f.status({ ticket: ticket.id })?.estado).toBe('entregue');
    expect(eventos).toEqual(['agendado', 'entregando', 'entregue']);
    const salvo = JSON.parse(await readFile(join(dataDir, '.fila-envio.json'), 'utf8')) as {
      tickets: unknown[];
    };
    expect(salvo.tickets).toHaveLength(1);
    const linhas = (await readFile(join(dataDir, '.entregas.jsonl'), 'utf8')).trim().split('\n');
    expect(linhas).toHaveLength(3);
    await f.parar();
  });

  it('mensagem nova antes do primeiro balão interrompe sem enviar; durante, corta o resto', async () => {
    const { gw, log } = gatewayFalso({ demoraMs: 1000 });
    const f = await fila(gw);
    const { ticket } = await f.enfileirar({
      jid: JID,
      baloes: ['a', 'b', 'c'],
      origem: 'mcp',
      urgencia: 'agora',
    });
    await avancar(2000);
    f.aoMensagem({ groupJid: JID, fromMe: false, sender: JID });
    await avancar(60_000);
    expect(f.status({ ticket: ticket.id })).toMatchObject({
      estado: 'interrompido',
      motivo: 'mensagem_nova',
      enviados: 0,
    });
    expect(log).not.toContain('entregar');

    const { ticket: t2 } = await f.enfileirar({
      jid: JID,
      baloes: ['a', 'b', 'c'],
      origem: 'mcp',
      urgencia: 'agora',
    });
    // janela (5 s) + pausa de leitura (~1 s) + 1º balão (1 s) + parte do 2º
    await avancar(7500);
    f.aoMensagem({ groupJid: JID, fromMe: false, sender: JID });
    await avancar(5000);
    const s = f.status({ ticket: t2.id });
    expect(s?.estado).toBe('interrompido');
    expect(s?.enviados).toBeGreaterThanOrEqual(1);
    expect(s?.enviados).toBeLessThan(3);
    await f.parar();
  });

  it('cancelar no meio da entrega já devolve os balões que saíram e fecha o ticket uma vez só', async () => {
    const { gw, log } = gatewayFalso({ demoraMs: 1000 });
    const f = await fila(gw);
    const fechamentos: Array<{ id: string; estado: string; enviados: number }> = [];
    f.on('entrega', (t) => {
      if (t.estado === 'cancelado' || t.estado === 'interrompido' || t.estado === 'entregue') {
        fechamentos.push({ id: t.id, estado: t.estado, enviados: t.enviados });
      }
    });
    const { ticket } = await f.enfileirar({
      jid: JID,
      baloes: ['a', 'b', 'c'],
      origem: 'mcp',
      urgencia: 'agora',
    });
    // janela (5 s) + 1º balão (1 s) + metade do 2º: o gateway falso ignora as pausas do plano
    await avancar(6500);
    expect(log).toContain('balao1');
    expect(f.status({ ticket: ticket.id })?.enviados).toBe(1);

    const cancelado = f.cancelar({ jid: JID });
    expect(cancelado).toMatchObject({ id: ticket.id, estado: 'cancelado', enviados: 1 });

    await avancar(5000);
    expect(log).not.toContain('balao2');
    expect(f.status({ ticket: ticket.id })).toMatchObject({ estado: 'cancelado', enviados: 1 });
    expect(fechamentos).toEqual([{ id: ticket.id, estado: 'cancelado', enviados: 1 }]);
    await f.parar();
  });

  it('operador respondeu na mão: interrompe; cancelar por jid e por ticket', async () => {
    const { gw } = gatewayFalso();
    const f = await fila(gw);
    const { ticket } = await f.enfileirar({ jid: JID, baloes: ['a'], origem: 'mcp' });
    f.aoMensagem({ groupJid: JID, fromMe: true, sender: 'me', origem: 'celular' });
    expect(f.status({ jid: JID })).toMatchObject({
      id: ticket.id,
      estado: 'interrompido',
      motivo: 'operador_respondeu',
    });
    const { ticket: t2 } = await f.enfileirar({ jid: JID, baloes: ['b'], origem: 'mcp' });
    expect(f.cancelar({ ticket: t2.id })?.motivo).toBe('operador');
    expect(f.cancelar({ jid: JID })).toBeNull();
    await f.parar();
  });

  it('balão igual a uma mensagem minha dos últimos 30 min no histórico é descartado', async () => {
    const { gw, log } = gatewayFalso();
    const f = await fila(gw);
    const agora = Date.now();
    await mkdir(join(dataDir, 'chat'), { recursive: true });
    const linhas = [
      JSON.stringify({
        id: '1',
        fromMe: true,
        type: 'text',
        text: 'bom dia irmão',
        timestamp: new Date(agora - 2 * 60_000).toISOString(),
        origem: 'coletor',
      }),
      JSON.stringify({
        id: '2',
        fromMe: true,
        type: 'text',
        text: 'oi de ontem',
        timestamp: new Date(agora - 25 * 3600_000).toISOString(),
        origem: 'coletor',
      }),
    ];
    await writeFile(join(dataDir, 'chat', 'messages.jsonl'), `${linhas.join('\n')}\n`);
    const r = await f.enfileirar({
      jid: JID,
      slug: 'chat',
      baloes: ['Bom dia irmão', 'oi de ontem', 'novidade de hoje'],
      origem: 'mcp',
      urgencia: 'agora',
    });
    expect(r.descartados).toEqual(['Bom dia irmão']);
    expect(r.ticket.baloes).toEqual(['oi de ontem', 'novidade de hoje']);
    expect(r.ticket.total).toBe(2);
    await avancar(8000);
    expect(log.filter((l) => l.startsWith('balao'))).toHaveLength(2);
    await f.parar();
  });

  it('todos os balões repetidos: recusa sem criar ticket', async () => {
    const { gw } = gatewayFalso();
    const f = await fila(gw);
    await mkdir(join(dataDir, 'chat'), { recursive: true });
    await writeFile(
      join(dataDir, 'chat', 'messages.jsonl'),
      `${JSON.stringify({ id: '1', fromMe: true, type: 'text', text: 'já saiu', timestamp: new Date().toISOString() })}\n`,
    );
    await expect(
      f.enfileirar({ jid: JID, slug: 'chat', baloes: ['já saiu'], origem: 'mcp' }),
    ).rejects.toThrow(/repet/);
    expect(f.status({ jid: JID })).toBeNull();
    await f.parar();
  });

  it('substituição: balão já enviado pelo ticket anterior não sai de novo, e o retorno diz o que já saiu', async () => {
    const { gw, log } = gatewayFalso({ demoraMs: 1000 });
    const f = await fila(gw);
    const a = await f.enfileirar({
      jid: JID,
      baloes: ['primeiro', 'segundo', 'terceiro'],
      origem: 'mcp',
      urgencia: 'agora',
    });
    await avancar(6500); // janela 5 s + 1º balão
    expect(log).toContain('balao1');
    const b = await f.enfileirar({
      jid: JID,
      baloes: ['primeiro', 'quarto'],
      origem: 'mcp',
      urgencia: 'agora',
    });
    expect(b.substituiu).toBe(a.ticket.id);
    expect(b.substituiu_enviados).toBe(1);
    expect(b.substituiu_baloes_enviados).toEqual(['primeiro']);
    expect(b.descartados).toEqual(['primeiro']);
    expect(b.ticket.baloes).toEqual(['quarto']);
    await f.parar();
  });

  it('novo ticket no mesmo chat substitui o anterior', async () => {
    const { gw } = gatewayFalso();
    const f = await fila(gw);
    const a = await f.enfileirar({ jid: JID, baloes: ['a'], origem: 'mcp' });
    const b = await f.enfileirar({ jid: JID, baloes: ['b'], origem: 'mcp' });
    expect(b.substituiu).toBe(a.ticket.id);
    expect(f.status({ ticket: a.ticket.id })?.motivo).toBe('substituido');
    await f.parar();
  });

  it('aguardar resolve no fim; abort do sinal cancela', async () => {
    const { gw } = gatewayFalso();
    const f = await fila(gw);
    const { ticket } = await f.enfileirar({
      jid: JID,
      baloes: ['a'],
      origem: 'mcp',
      urgencia: 'agora',
    });
    const p = f.aguardar(ticket.id);
    await avancar(8000);
    expect((await p).estado).toBe('entregue');
    const { ticket: t2 } = await f.enfileirar({
      jid: JID,
      baloes: ['a'],
      origem: 'mcp',
      urgencia: 'agora',
    });
    const ac = new AbortController();
    const p2 = f.aguardar(t2.id, ac.signal);
    ac.abort();
    expect((await p2).estado).toBe('cancelado');
    await f.parar();
  });

  it('falha do gateway reagenda +60 s e depois de 3 tentativas interrompe(falha)', async () => {
    const { gw } = gatewayFalso({ falhar: true });
    const f = await fila(gw);
    const { ticket } = await f.enfileirar({
      jid: JID,
      baloes: ['a'],
      origem: 'mcp',
      urgencia: 'agora',
    });
    await avancar(6000);
    expect(f.status({ ticket: ticket.id })).toMatchObject({ estado: 'agendado', tentativas: 1 });
    await avancar(61_000);
    await avancar(61_000);
    expect(f.status({ ticket: ticket.id })).toMatchObject({
      estado: 'interrompido',
      motivo: 'falha',
    });
    await f.parar();
  });

  it('reinício: carrega o arquivo, retoma agendados em +5 s e marca entregando como interrompido(reinicio)', async () => {
    const agora = Date.now();
    const base = {
      slug: 'chat',
      baloes: ['a'],
      texto: 'a',
      opts: { typos: false, umBalao: false, urgencia: 'normal' },
      origem: 'mcp',
      criadoEm: agora - 100_000,
      lerEm: agora - 50_000,
      entregarEm: agora - 40_000,
      regime: 'fria',
      previsao_s: 60,
      enviados: 0,
      total: 1,
      mensagensNovas: 0,
      lido: false,
      atualizadoEm: agora - 100_000,
    };
    await writeFile(
      join(dataDir, '.fila-envio.json'),
      JSON.stringify({
        versao: 1,
        ultimoInicio: 0,
        clienteDigitando: {},
        tickets: [
          { ...base, id: 'x', jid: JID, estado: 'agendado', tentativas: 0 },
          {
            ...base,
            id: 'y',
            jid: '5511000000002@s.whatsapp.net',
            estado: 'entregando',
            tentativas: 1,
            lido: true,
          },
        ],
      }),
    );
    const { gw, log } = gatewayFalso();
    const f = await fila(gw);
    expect(f.status({ ticket: 'y' })).toMatchObject({ estado: 'interrompido', motivo: 'reinicio' });
    expect(f.status({ ticket: 'x' })?.entregarEm).toBe(agora + 5000);
    await avancar(6000);
    expect(log).toContain('entregar');
    await f.parar();
  });

  it('latência normal usa o histórico do chat (gap desde o cliente) e o expediente', async () => {
    await mkdir(join(dataDir, 'chat'), { recursive: true });
    const t = Date.now();
    await writeFile(
      join(dataDir, 'chat', 'messages.jsonl'),
      JSON.stringify({
        id: 'M1',
        fromMe: false,
        type: 'text',
        text: 'oi, tudo bem?',
        timestamp: new Date(t - 10_000).toISOString(),
        sender: JID,
      }),
    );
    const { gw } = gatewayFalso();
    const f = await fila(gw);
    const { ticket } = await f.enfileirar({
      jid: JID,
      slug: 'chat',
      baloes: ['tudo'],
      origem: 'mcp',
    });
    expect(ticket.regime).toBe('ativa');
    expect(ticket.previsao_s).toBeGreaterThanOrEqual(5);
    expect(ticket.previsao_s).toBeLessThanOrEqual(240);
    expect(ticket.lerEm).toBeLessThanOrEqual(ticket.entregarEm);
    await f.parar();
  });

  it('vídeo longo do cliente e tempo humano do agente atrasam a entrega (com teto)', async () => {
    await mkdir(join(dataDir, 'chat'), { recursive: true });
    const t = Date.now();
    const msg = (o: Record<string, unknown>) =>
      JSON.stringify({
        fromMe: false,
        sender: JID,
        timestamp: new Date(t - 10_000).toISOString(),
        ...o,
      });
    await writeFile(
      join(dataDir, 'chat', 'messages.jsonl'),
      `${msg({ id: 'V1', type: 'video', text: '', duracao_s: 300 })}\n`,
    );
    const { gw } = gatewayFalso();
    const f = await fila(gw);
    const video = await f.enfileirar({ jid: JID, slug: 'chat', baloes: ['vi'], origem: 'mcp' });
    expect(video.ticket.previsao_s).toBe(240);
    expect(video.ticket.lerEm).toBeLessThan(video.ticket.entregarEm - 200_000);

    await writeFile(
      join(dataDir, 'chat', 'messages.jsonl'),
      `${msg({ id: 'T1', type: 'text', text: 'tem um bug no login' })}\n`,
    );
    const bug = await f.enfileirar({
      jid: JID,
      slug: 'chat',
      baloes: ['corrigido'],
      origem: 'mcp',
      tempoHumano_s: 1200,
    });
    expect(bug.ticket.previsao_s).toBeGreaterThanOrEqual(120);
    expect(bug.ticket.previsao_s).toBeLessThanOrEqual(150);
    await f.parar();
  });
});
