import { describe, expect, it } from 'vitest';
import { criarResolvedorDeJid, NumeroInexistente } from './jid-canonico.js';

function checkFalso(respostas: Record<string, { exists: boolean; jid: string | null }>) {
  const chamadas: string[] = [];
  const check = async (n: string) => {
    chamadas.push(n);
    const r = respostas[n];
    if (!r) throw new Error('usync fora do ar');
    return r;
  };
  return { check, chamadas };
}

describe('criarResolvedorDeJid', () => {
  it('grupo e @lid passam direto, sem consultar o WhatsApp', async () => {
    const { check, chamadas } = checkFalso({});
    const resolver = criarResolvedorDeJid(check);
    expect(await resolver('120363000000000001@g.us')).toEqual({ jid: '120363000000000001@g.us' });
    expect(await resolver('10000000000099@lid')).toEqual({ jid: '10000000000099@lid' });
    expect(chamadas).toEqual([]);
  });

  it('número digitado com o nono dígito vira o JID canônico devolvido pelo WhatsApp', async () => {
    const { check, chamadas } = checkFalso({
      '5544991111111': { exists: true, jid: '554491111111@s.whatsapp.net' },
    });
    const resolver = criarResolvedorDeJid(check);
    expect(await resolver('5544991111111@s.whatsapp.net')).toEqual({
      jid: '554491111111@s.whatsapp.net',
      corrigidoDe: '5544991111111@s.whatsapp.net',
    });
    expect(chamadas).toEqual(['5544991111111']);
  });

  it('JID que já é o canônico não marca correção; sufixo de aparelho é ignorado', async () => {
    const { check } = checkFalso({
      '5511999999999': { exists: true, jid: '5511999999999@s.whatsapp.net' },
    });
    const resolver = criarResolvedorDeJid(check);
    expect(await resolver('5511999999999:2@s.whatsapp.net')).toEqual({
      jid: '5511999999999@s.whatsapp.net',
    });
  });

  it('número que não está no WhatsApp lança NumeroInexistente', async () => {
    const { check } = checkFalso({ '5511000000000': { exists: false, jid: null } });
    const resolver = criarResolvedorDeJid(check);
    await expect(resolver('5511000000000@s.whatsapp.net')).rejects.toBeInstanceOf(
      NumeroInexistente,
    );
  });

  it('cacheia o resultado: positivo por 24 h, negativo por 10 min', async () => {
    let agora = 1_000_000;
    const { check, chamadas } = checkFalso({
      '5544991111111': { exists: true, jid: '554491111111@s.whatsapp.net' },
      '5511000000000': { exists: false, jid: null },
    });
    const resolver = criarResolvedorDeJid(check, { agora: () => agora });
    await resolver('5544991111111@s.whatsapp.net');
    await resolver('5544991111111@s.whatsapp.net');
    expect(chamadas).toEqual(['5544991111111']);
    agora += 25 * 3600_000;
    await resolver('5544991111111@s.whatsapp.net');
    expect(chamadas).toEqual(['5544991111111', '5544991111111']);

    await expect(resolver('5511000000000@s.whatsapp.net')).rejects.toBeInstanceOf(
      NumeroInexistente,
    );
    await expect(resolver('5511000000000@s.whatsapp.net')).rejects.toBeInstanceOf(
      NumeroInexistente,
    );
    expect(chamadas.filter((c) => c === '5511000000000')).toHaveLength(1);
    agora += 11 * 60_000;
    await expect(resolver('5511000000000@s.whatsapp.net')).rejects.toBeInstanceOf(
      NumeroInexistente,
    );
    expect(chamadas.filter((c) => c === '5511000000000')).toHaveLength(2);
  });

  it('consulta falhando não bloqueia o envio: devolve o JID original e não cacheia', async () => {
    const { check, chamadas } = checkFalso({});
    const resolver = criarResolvedorDeJid(check);
    expect(await resolver('5511888888888@s.whatsapp.net')).toEqual({
      jid: '5511888888888@s.whatsapp.net',
    });
    await resolver('5511888888888@s.whatsapp.net');
    expect(chamadas).toHaveLength(2);
  });
});
