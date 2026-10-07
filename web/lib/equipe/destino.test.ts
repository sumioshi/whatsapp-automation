import { describe, expect, it } from 'vitest';
import type { Contacts } from '../contacts';
import { destinoDoSlug } from './destino';

const contatos = async () =>
  ({ phones: new Map([['98200000000001', '5511999999999']]), lids: new Set(['98200000000001', '98200000000002']) }) as unknown as Contacts;
const grupos = async () => [
  { id: '120363000000000000@g.us', name: 'Grupo A', slug: 'grupo-a' },
  { id: '120363000000000001@g.us', name: 'Nome Novo' },
];
const semRegistros = async () => [];

describe('destinoDoSlug', () => {
  it('grupo pelo slug persistido ou pelo nome', async () => {
    expect(await destinoDoSlug('grupo-a', { contatos, grupos, registros: semRegistros })).toBe('120363000000000000@g.us');
    expect(await destinoDoSlug('nome-novo', { contatos, grupos, registros: semRegistros })).toBe('120363000000000001@g.us');
  });
  it('DM por LID vira o telefone', async () => {
    expect(await destinoDoSlug('dm-98200000000001', { contatos, grupos, registros: semRegistros })).toBe('5511999999999@s.whatsapp.net');
  });
  it('DM por telefone puro (sem entrada no sidecar) vai pro próprio telefone', async () => {
    expect(await destinoDoSlug('dm-5511888888888', { contatos, grupos, registros: semRegistros })).toBe('5511888888888@s.whatsapp.net');
  });
  it('LID sem telefone conhecido vai como @lid', async () => {
    expect(await destinoDoSlug('dm-98200000000002', { contatos, grupos, registros: semRegistros })).toBe('98200000000002@lid');
  });
  it('desconhecido → null', async () => {
    expect(await destinoDoSlug('grupo-x', { contatos, grupos, registros: semRegistros })).toBeNull();
  });

  describe('dois grupos com o mesmo slug canônico', () => {
    const duplicados = async () => [
      { id: '120363000000000002@g.us', name: 'Grupo B', slug: 'grupo-b' },
      { id: '120363000000000003@g.us', name: 'Grupo B' },
    ];
    const reg = (groupJid: string, timestamp: string) => ({ groupJid, timestamp });

    it('vai pro grupo do registro mais novo do chat', async () => {
      const registros = async () => [
        reg('120363000000000002@g.us', '2026-10-01T10:00:00.000Z'),
        reg('120363000000000003@g.us', '2026-10-02T10:00:00.000Z'),
        reg('120363000000000002@g.us', '2026-09-30T10:00:00.000Z'),
      ];
      expect(await destinoDoSlug('grupo-b', { contatos, grupos: duplicados, registros })).toBe('120363000000000003@g.us');
    });
    it('sem registros → null (não chuta entre os dois)', async () => {
      expect(await destinoDoSlug('grupo-b', { contatos, grupos: duplicados, registros: semRegistros })).toBeNull();
    });
    it('DM não lê registros nem config', async () => {
      const falha = async () => {
        throw new Error('não devia ler');
      };
      expect(await destinoDoSlug('dm-5511888888888', { contatos, grupos: falha, registros: falha })).toBe('5511888888888@s.whatsapp.net');
    });
  });

  describe('grupo com registros: a identidade é a do diretório', () => {
    const reg = (groupJid: string, timestamp: string) => ({ groupJid, timestamp });

    it('config aponta outro grupo com o mesmo slug derivado, mas os registros mostram o jid real → usa o dos registros', async () => {
      const outro = async () => [{ id: '120363000000000005@g.us', name: 'Grupo C' }];
      const registros = async () => [
        reg('120363000000000006@g.us', '2026-10-01T10:00:00.000Z'),
        reg('120363000000000006@g.us', '2026-10-02T10:00:00.000Z'),
      ];
      expect(await destinoDoSlug('grupo-c', { contatos, grupos: outro, registros })).toBe('120363000000000006@g.us');
    });
    it('vale o jid de grupo do registro mais novo', async () => {
      const registros = async () => [
        reg('120363000000000007@g.us', '2026-10-03T10:00:00.000Z'),
        reg('120363000000000006@g.us', '2026-10-01T10:00:00.000Z'),
      ];
      expect(await destinoDoSlug('grupo-c', { contatos, grupos: semRegistros, registros })).toBe('120363000000000007@g.us');
    });
    it('registro sem jid de grupo não vira destino: cai no config', async () => {
      const registros = async () => [reg('5511999999999@s.whatsapp.net', '2026-10-03T10:00:00.000Z')];
      expect(await destinoDoSlug('grupo-a', { contatos, grupos, registros })).toBe('120363000000000000@g.us');
    });
    it('sem registros e sem config → null', async () => {
      expect(await destinoDoSlug('grupo-z', { contatos, grupos: semRegistros, registros: semRegistros })).toBeNull();
    });
  });
});
