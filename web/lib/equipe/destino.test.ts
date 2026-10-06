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
    it('sem registro que case com um deles → null (não chuta)', async () => {
      const registros = async () => [reg('120363000000000009@g.us', '2026-10-02T10:00:00.000Z')];
      expect(await destinoDoSlug('grupo-b', { contatos, grupos: duplicados, registros })).toBeNull();
      expect(await destinoDoSlug('grupo-b', { contatos, grupos: duplicados, registros: semRegistros })).toBeNull();
    });
    it('grupo único não lê os registros', async () => {
      const registros = async () => {
        throw new Error('não devia ler');
      };
      expect(await destinoDoSlug('grupo-a', { contatos, grupos, registros })).toBe('120363000000000000@g.us');
    });
  });
});
