import { describe, expect, it } from 'vitest';
import type { MessageView } from '../data';
import { janelaDaConversa, totalDaConversa } from './conversa';

const m = (id: string, timestamp: string) => ({ id, timestamp }) as MessageView;
const dia = (h: number) => `2026-10-01T${String(h).padStart(2, '0')}:00:00.000Z`;

/** Leitor falso com a mesma semântica de readGroupMessages (limit/before por id). */
function leitor(chats: Record<string, MessageView[]>) {
  const chamadas: Array<{ slug: string; before?: string }> = [];
  return {
    chamadas,
    registros: async (slug: string) => chats[slug] ?? [],
    mensagens: async (slug: string, o: { limit: number; before?: string }) => {
      chamadas.push({ slug, before: o.before });
      const all = chats[slug] ?? [];
      let end = all.length;
      if (o.before) {
        end = all.findIndex((r) => r.id === o.before);
        if (end < 0) return [];
      }
      return all.slice(Math.max(0, end - o.limit), end);
    },
  };
}

const tel = [m('T1', dia(1)), m('T3', dia(3)), m('T5', dia(5)), m('ECO', dia(6))];
const lid = [m('L2', dia(2)), m('L4', dia(4)), m('ECO', dia(6))];

describe('janelaDaConversa', () => {
  it('um slug só: repassa a leitura', async () => {
    const l = leitor({ g: tel });
    expect((await janelaDaConversa(['g'], { limit: 2 }, l)).map((x) => x.id)).toEqual(['T5', 'ECO']);
  });

  it('irmãos: funde por timestamp, sem duplicar o eco, e fica com as últimas N', async () => {
    const l = leitor({ 'dm-tel': tel, 'dm-lid': lid });
    expect((await janelaDaConversa(['dm-tel', 'dm-lid'], { limit: 4 }, l)).map((x) => x.id)).toEqual(['L2', 'T3', 'L4', 'T5', 'ECO'].slice(-4));
  });

  it('paginação: o before vale como corte de tempo nos dois irmãos', async () => {
    const l = leitor({ 'dm-tel': tel, 'dm-lid': lid });
    const antes = await janelaDaConversa(['dm-tel', 'dm-lid'], { limit: 10, before: 'L4' }, l);
    expect(antes.map((x) => x.id)).toEqual(['T1', 'L2', 'T3']);
    const maisAntes = await janelaDaConversa(['dm-tel', 'dm-lid'], { limit: 2, before: 'T3' }, l);
    expect(maisAntes.map((x) => x.id)).toEqual(['T1', 'L2']);
  });

  it('irmão sem nada antes do corte não é lido', async () => {
    const l = leitor({ 'dm-tel': tel, 'dm-lid': lid });
    expect(await janelaDaConversa(['dm-tel', 'dm-lid'], { limit: 10, before: 'T1' }, l)).toEqual([]);
    expect(l.chamadas).toEqual([{ slug: 'dm-tel', before: 'T1' }]);
  });

  it('âncora que não existe em nenhum irmão → fim da paginação', async () => {
    const l = leitor({ 'dm-tel': tel, 'dm-lid': lid });
    expect(await janelaDaConversa(['dm-tel', 'dm-lid'], { limit: 10, before: 'X' }, l)).toEqual([]);
  });
});

describe('totalDaConversa', () => {
  it('conta mensagens únicas entre os irmãos (o eco conta uma vez)', async () => {
    const l = leitor({ 'dm-tel': tel, 'dm-lid': lid });
    expect(await totalDaConversa(['dm-tel', 'dm-lid'], l)).toBe(6);
    expect(await totalDaConversa(['dm-tel'], l)).toBe(4);
  });
});
