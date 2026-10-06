import { describe, expect, it } from 'vitest';
import { motivoDeRecusa, recentesDaConta, registrosDaConversa } from './envio';

const AGORA = Date.parse('2026-10-06T12:00:00Z');

describe('envio do atendente', () => {
  it('só os bloqueios contam: tu e culpa recusam; texto normal passa', () => {
    expect(motivoDeRecusa('tu viu o arquivo?', [])).toMatch(/você|vc/);
    expect(motivoDeRecusa('foi mal, culpa minha', [])).toMatch(/culpa/);
    expect(motivoDeRecusa('Opa, vou ver aqui e já te falo: chega hoje.', [])).toBeNull();
  });
  it('balão idêntico a mensagem da conta nos últimos 30 min é recusado', () => {
    const recentes = recentesDaConta(
      [
        { fromMe: true, timestamp: '2026-10-06T11:50:00Z', text: 'Já enviei o link' },
        { fromMe: true, timestamp: '2026-10-06T10:00:00Z', text: 'Bom dia' },
        { fromMe: false, timestamp: '2026-10-06T11:55:00Z', text: 'Ok' },
      ],
      AGORA,
    );
    expect(recentes).toEqual(['Já enviei o link']);
    expect(motivoDeRecusa('já enviei o link.', recentes)).toMatch(/idêntico/);
    expect(motivoDeRecusa('Bom dia', recentes)).toBeNull();
  });
});

describe('registrosDaConversa', () => {
  it('junta os registros dos irmãos: o balão mandado no LID trava a repetição no telefone', async () => {
    const agora = Date.parse('2026-10-01T12:00:00.000Z');
    const porSlug: Record<string, { fromMe?: boolean; timestamp: string; text: string }[]> = {
      'dm-5511999999999': [{ fromMe: false, timestamp: '2026-10-01T11:50:00.000Z', text: 'oi' }],
      'dm-98200000000001': [{ fromMe: true, timestamp: '2026-10-01T11:55:00.000Z', text: 'Já te mando o arquivo' }],
    };
    const registros = await registrosDaConversa(['dm-5511999999999', 'dm-98200000000001'], async (s) => porSlug[s] ?? []);
    expect(registros).toHaveLength(2);
    expect(recentesDaConta(registros, agora)).toEqual(['Já te mando o arquivo']);
  });
});
