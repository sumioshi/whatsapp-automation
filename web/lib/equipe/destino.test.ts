import { describe, expect, it } from 'vitest';
import type { Contacts } from '../contacts';
import { destinoDoSlug } from './destino';

const contatos = async () =>
  ({ phones: new Map([['98200000000001', '5511999999999']]), lids: new Set(['98200000000001', '98200000000002']) }) as unknown as Contacts;
const grupos = async () => [
  { id: '120363000000000000@g.us', name: 'Grupo A', slug: 'grupo-a' },
  { id: '120363000000000001@g.us', name: 'Nome Novo' },
];

describe('destinoDoSlug', () => {
  it('grupo pelo slug persistido ou pelo nome', async () => {
    expect(await destinoDoSlug('grupo-a', { contatos, grupos })).toBe('120363000000000000@g.us');
    expect(await destinoDoSlug('nome-novo', { contatos, grupos })).toBe('120363000000000001@g.us');
  });
  it('DM por LID vira o telefone', async () => {
    expect(await destinoDoSlug('dm-98200000000001', { contatos, grupos })).toBe('5511999999999@s.whatsapp.net');
  });
  it('DM por telefone puro (sem entrada no sidecar) vai pro próprio telefone', async () => {
    expect(await destinoDoSlug('dm-5511888888888', { contatos, grupos })).toBe('5511888888888@s.whatsapp.net');
  });
  it('LID sem telefone conhecido vai como @lid', async () => {
    expect(await destinoDoSlug('dm-98200000000002', { contatos, grupos })).toBe('98200000000002@lid');
  });
  it('desconhecido → null', async () => {
    expect(await destinoDoSlug('grupo-x', { contatos, grupos })).toBeNull();
  });
});
