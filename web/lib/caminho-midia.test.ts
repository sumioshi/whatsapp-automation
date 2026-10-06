import { describe, expect, it } from 'vitest';
import { ehCaminhoDeMidia, slugDoCaminho } from './caminho-midia';

describe('ehCaminhoDeMidia', () => {
  it('aceita <slug>/<pasta de mídia>/<arquivo> e a foto do chat', () => {
    expect(ehCaminhoDeMidia('grupo-a/audio/2026-10-01_x.ogg')).toBe(true);
    expect(ehCaminhoDeMidia('dm-5511999999999/document/contrato.pdf')).toBe(true);
    expect(ehCaminhoDeMidia('grupo-a/gif/a.mp4')).toBe(true);
    expect(ehCaminhoDeMidia('grupo-a/avatar.jpg')).toBe(true);
  });
  it('recusa estado e histórico', () => {
    expect(ehCaminhoDeMidia('grupo-a/messages.jsonl')).toBe(false);
    expect(ehCaminhoDeMidia('grupo-a/audio/x.jsonl')).toBe(false);
    expect(ehCaminhoDeMidia('api-tokens.json')).toBe(false);
    expect(ehCaminhoDeMidia('.equipe/usuarios.json')).toBe(false);
    expect(ehCaminhoDeMidia('grupo-a/transcripts/x.txt')).toBe(false);
    expect(ehCaminhoDeMidia('grupo-a/copilot/memory.md')).toBe(false);
  });
  it('recusa traversal, segmento com ponto e profundidade errada', () => {
    expect(ehCaminhoDeMidia('grupo-a/audio/../../api-tokens.json')).toBe(false);
    expect(ehCaminhoDeMidia('../grupo-a/audio/x.ogg')).toBe(false);
    expect(ehCaminhoDeMidia('grupo-a/audio/.oculto')).toBe(false);
    expect(ehCaminhoDeMidia('.tmp-outbound/audio/x')).toBe(false);
    expect(ehCaminhoDeMidia('grupo-a/audio/sub/x.ogg')).toBe(false);
    expect(ehCaminhoDeMidia('grupo-a//x.ogg')).toBe(false);
    expect(ehCaminhoDeMidia('')).toBe(false);
  });
});

describe('slugDoCaminho', () => {
  it('é o primeiro segmento', () => {
    expect(slugDoCaminho('grupo-a/audio/x.ogg')).toBe('grupo-a');
  });
});
