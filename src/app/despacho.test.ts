import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Despacho, type DespachoDeps } from './despacho.js';
import type { ArquivoDespacho } from './despacho-core.js';

const SELF = '5511000000000@s.whatsapp.net';
const CLIENTE = '120363000000000001@g.us';

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

  it('não N descarta pergunta e fecha issue; ok todos executa o que resta', async () => {
    const d = new Despacho(deps);
    expect(await d.onMensagem(msg('não 1'))).toContain('descartad');
    expect(fechadas).toEqual([42]);
    await d.onMensagem(msg('ok todos'));
    expect(humanos).toHaveLength(1);
    expect(await d.onMensagem(msg('ok 99'))).toMatch(/não achei/);
  });
});
