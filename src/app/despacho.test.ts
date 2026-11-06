import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Despacho, type DespachoDeps } from './despacho.js';
import type { ArquivoDespacho } from './despacho-core.js';

const SELF = '5511000000000@s.whatsapp.net';
const CLIENTE = '120363000000000001@g.us';

/** Promise controlável de fora — usada pra segurar um await em voo e forçar interleaving nos testes de concorrência. */
function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function arquivo(): ArquivoDespacho {
  return {
    passada: '2026-09-04T0610',
    criadoEm: '2026-09-04T09:10:00.000Z',
    enviadoEm: null,
    itens: [
      {
        n: 1,
        id: 'a-1',
        slug: 'grupo-a',
        cliente: 'Cliente A',
        tipo: 'issue',
        titulo: 'Botão',
        url: 'https://github.com/o/r/issues/42',
        texto: null,
        issue: { repo: 'o/r', numero: 42 },
        acao: 'label',
        label: 'claude',
        executadoEm: null,
        resultado: null,
      },
      {
        n: 2,
        id: 'a-2',
        slug: 'grupo-a',
        cliente: 'Cliente A',
        tipo: 'pergunta',
        titulo: 'Filtro',
        url: null,
        texto: 'vc quer por data ou por status?',
        issue: null,
        acao: 'enviar',
        label: null,
        executadoEm: null,
        resultado: null,
      },
    ],
  };
}

let dataDir: string;
let enviados: Array<{ jid: string; text: string }>;
let humanos: Array<{ jid: string; texto: string; slug: string }>;
let labels: string[];
let fechadas: number[];
let deps: DespachoDeps;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'wac-despacho-'));
  await mkdir(join(dataDir, 'despacho'));
  await writeFile(join(dataDir, 'despacho', '2026-09-04T0610.json'), JSON.stringify(arquivo()));
  enviados = [];
  humanos = [];
  labels = [];
  fechadas = [];
  deps = {
    dataDir,
    connected: () => true,
    selfJid: () => SELF,
    sendText: async (jid, text) => {
      enviados.push({ jid, text });
    },
    sendHumano: async (jid, texto, slug) => {
      humanos.push({ jid, texto, slug });
    },
    jidDoSlug: (slug) => (slug === 'grupo-a' ? CLIENTE : null),
    github: {
      adicionarLabel: async (_r, n, label) => {
        labels.push(`${n}:${label}`);
      },
      comentar: async () => {},
      fechar: async (_r, n) => {
        fechadas.push(n);
      },
    },
    intervaloMs: 60_000,
  };
});
afterEach(async () => rm(dataDir, { recursive: true, force: true }));

const lerArquivo = async () =>
  JSON.parse(
    await readFile(join(dataDir, 'despacho', '2026-09-04T0610.json'), 'utf8'),
  ) as ArquivoDespacho;

const msg = (
  text: string,
  over: Partial<{ fromMe: boolean; isDirect: boolean; groupJid: string }> = {},
) => ({
  fromMe: true,
  isDirect: true,
  groupJid: SELF,
  text,
  ...over,
});

describe('Despacho.tick', () => {
  it('envia o digest pendente pro self-chat uma única vez', async () => {
    const d = new Despacho(deps);
    expect((await d.tick()).enviados).toBe(1);
    expect(enviados[0]?.jid).toBe(SELF);
    expect(enviados[0]?.text).toContain('📋 *despacho');
    expect((await lerArquivo()).enviadoEm).not.toBeNull();
    expect((await d.tick()).enviados).toBe(0);
  });
  it('sem conexão não envia nem marca', async () => {
    const d = new Despacho({ ...deps, connected: () => false });
    expect((await d.tick()).enviados).toBe(0);
    expect((await lerArquivo()).enviadoEm).toBeNull();
  });
});

describe('Despacho.onMensagem', () => {
  it('ignora quem não é o operador no self-chat e texto que não é comando', async () => {
    const d = new Despacho(deps);
    expect(await d.onMensagem(msg('ok 1', { fromMe: false }))).toBeNull();
    expect(await d.onMensagem(msg('ok 1', { groupJid: CLIENTE }))).toBeNull();
    expect(await d.onMensagem(msg('bom dia'))).toBeNull();
    expect(labels).toEqual([]);
  });

  it('ok N em issue aplica a label do executor e confirma', async () => {
    const d = new Despacho(deps);
    const resp = await d.onMensagem(msg('ok 1'));
    expect(labels).toEqual(['42:claude']);
    expect(resp).toContain('✅ 1');
    expect((await lerArquivo()).itens[0]?.executadoEm).not.toBeNull();
    // segunda vez não repete
    expect(await d.onMensagem(msg('ok 1'))).toContain('já');
    expect(labels).toHaveLength(1);
  });

  it('ok N em pergunta envia humanizado pro chat do cliente', async () => {
    const d = new Despacho(deps);
    await d.onMensagem(msg('ok 2'));
    expect(humanos).toEqual([
      { jid: CLIENTE, texto: 'vc quer por data ou por status?', slug: 'grupo-a' },
    ]);
  });

  it('edita N: texto troca o texto e envia; recusa tratamento errado', async () => {
    const d = new Despacho(deps);
    const ruim = await d.onMensagem(msg('edita 2: tu prefere por data?'));
    expect(ruim).toMatch(/tu/);
    expect(humanos).toEqual([]);
    await d.onMensagem(msg('edita 2: prefere por data ou por status?'));
    expect(humanos[0]?.texto).toBe('prefere por data ou por status?');
  });

  it('ok todos com uma falha reporta a contagem e não marca o item que falhou', async () => {
    const falhando: DespachoDeps['github'] = {
      adicionarLabel: async () => {
        throw new Error('rate limit');
      },
      comentar: async () => {},
      fechar: async (_r, n) => {
        fechadas.push(n);
      },
    };
    const d = new Despacho({ ...deps, github: falhando });
    const resp = await d.onMensagem(msg('ok todos'));
    expect(resp).toMatch(/1 execut/);
    expect(resp).toMatch(/1 falh/);
    expect(humanos).toHaveLength(1);
    const lido = await lerArquivo();
    expect(lido.itens[0]?.executadoEm).toBeNull();
    expect(lido.itens[1]?.executadoEm).not.toBeNull();
  });

  it('não N descarta pergunta e fecha issue; ok todos executa o que resta', async () => {
    const d = new Despacho(deps);
    expect(await d.onMensagem(msg('não 1'))).toContain('descartad');
    expect(fechadas).toEqual([42]);
    await d.onMensagem(msg('ok todos'));
    expect(humanos).toHaveLength(1);
    expect(await d.onMensagem(msg('ok 99'))).toMatch(/não achei/);
  });
});

describe('Despacho — tick() e onMensagem() concorrentes', () => {
  it('onMensagem não sobrescreve o enviadoEm que um tick() concorrente gravou', async () => {
    // Segura o tick() bem no meio do envio do digest — depois de já ter LIDO o
    // arquivo (enviadoEm: null) mas antes de marcar e gravar. Reproduz a
    // interleaving da corrida: o onMensagem() concorrente lê o mesmo arquivo,
    // processa `ok 1` e (sem mutex) já grava sua própria cópia — que não tem o
    // enviadoEm — enquanto o tick() ainda está preso. Quando o tick() por fim é
    // liberado e grava a SUA cópia (com enviadoEm), o resultado final tem os
    // dois efeitos. Sem a serialização, a ordem inversa apagaria o enviadoEm.
    const gate = deferred<void>();
    const d = new Despacho({
      ...deps,
      sendText: async (jid, text) => {
        if (text.includes('📋 *despacho')) await gate.promise;
        enviados.push({ jid, text });
      },
    });

    // Dispara os dois SEM aguardar nenhum antes do outro — é exatamente a
    // concorrência que o mutex precisa serializar. Não aguardamos nenhuma das
    // duas promises antes de liberar o gate, então não há como travar mesmo
    // que a serialização enfileire onMensagem() atrás do tick().
    const tickEmVoo = d.tick();
    const onMensagemEmVoo = d.onMensagem(msg('ok 1'));

    // Dá alguns microtasks pro onMensagem() ter chance de rodar (e, na versão
    // SEM mutex, de gravar sua cópia obsoleta) antes de liberar o tick().
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    gate.resolve();

    await Promise.all([tickEmVoo, onMensagemEmVoo]);

    const lido = await lerArquivo();
    expect(lido.enviadoEm).not.toBeNull();
    expect(lido.itens[0]?.executadoEm).not.toBeNull();

    // Se o enviadoEm tivesse sido perdido (sobrescrito pela leitura obsoleta
    // do onMensagem), este segundo tick mandaria o digest de novo.
    const segundo = await d.tick();
    expect(segundo.enviados).toBe(0);
    expect(enviados.filter((e) => e.text.includes('📋 *despacho'))).toHaveLength(1);
  });
});
