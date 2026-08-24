import { describe, expect, it } from 'vitest';
import { detectarBuraco, proximaExecucaoMs, type RegistroTail } from './reconciler-core.js';

const MIN = 60_000;
const HORA = 60 * MIN;

function reg(tsMs: number, id = `m${tsMs}`): RegistroTail {
  return { id, timestampMs: tsMs, fromMe: false, sender: '551199@s.whatsapp.net' };
}

describe('detectarBuraco', () => {
  const agora = 1_000 * HORA;

  it('chat em dia (lastActivity ≈ última local) → null', () => {
    const tail = [reg(agora - 2 * HORA), reg(agora - 1 * HORA)];
    expect(detectarBuraco(tail, (agora - 1 * HORA) / 1000, agora)).toBeNull();
  });

  it('lastActivity bem à frente da última local e sem msg posterior → sem_ancora', () => {
    const tail = [reg(agora - 100 * HORA)];
    const b = detectarBuraco(tail, (agora - 1 * HORA) / 1000, agora);
    expect(b?.tipo).toBe('sem_ancora');
  });

  it('salto grande no meio do rabo → com_ancora na primeira msg depois do salto', () => {
    const tail = [reg(agora - 200 * HORA, 'antiga'), reg(agora - 1 * HORA, 'nova')];
    const b = detectarBuraco(tail, (agora - 1 * HORA) / 1000, agora);
    expect(b?.tipo).toBe('com_ancora');
    if (b?.tipo === 'com_ancora') expect(b.ancora.id).toBe('nova');
  });

  it('margem: diferença pequena (< 5 min) não é buraco', () => {
    const tail = [reg(agora - 2 * MIN)];
    expect(detectarBuraco(tail, (agora - 1 * MIN) / 1000, agora)).toBeNull();
  });

  it('sem lastActivity conhecido e sem salto → null (não inventa buraco)', () => {
    const tail = [reg(agora - 50 * HORA)];
    expect(detectarBuraco(tail, null, agora)).toBeNull();
  });

  it('chat vazio com atividade conhecida → sem_ancora', () => {
    const b = detectarBuraco([], (agora - 1 * HORA) / 1000, agora);
    expect(b?.tipo).toBe('sem_ancora');
  });
});

describe('proximaExecucaoMs', () => {
  it('agenda intervalo minutos à frente, com piso de 1 min', () => {
    expect(proximaExecucaoMs(1000, 15)).toBe(1000 + 15 * MIN);
    expect(proximaExecucaoMs(1000, 0)).toBe(1000 + 1 * MIN);
    expect(proximaExecucaoMs(1000, -5)).toBe(1000 + 1 * MIN);
  });
});
