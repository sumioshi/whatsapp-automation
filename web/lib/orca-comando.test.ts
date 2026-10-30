import { describe, expect, it } from 'vitest';
import type { OrcaPendingCommand } from './orca-bridge';
import { validarComandoOrca } from './orca-comando';

const cmd = (p: Partial<OrcaPendingCommand>): OrcaPendingCommand => ({
  id: 'x',
  createdAt: new Date().toISOString(),
  acao: 'enviar_prompt',
  ...p,
});

describe('validarComandoOrca', () => {
  it('formatos: terminalHandle, slug e agentType', () => {
    expect(validarComandoOrca(cmd({ terminalHandle: 'term_68a7-4528:ab.c' }))).toBeNull();
    expect(validarComandoOrca(cmd({ terminalHandle: 'term $(rm)' }))).toBe('terminalHandle inválido');
    expect(validarComandoOrca(cmd({ terminalHandle: 'a'.repeat(201) }))).toBe('terminalHandle inválido');
    expect(validarComandoOrca(cmd({ slug: 'dm-5511999' }))).toBeNull();
    expect(validarComandoOrca(cmd({ slug: 'Maiúsculo' }))).toBe('slug inválido');
    expect(validarComandoOrca(cmd({ slug: '../x' }))).toBe('slug inválido');
    expect(validarComandoOrca(cmd({ agentType: 'claude' }))).toBeNull();
    expect(validarComandoOrca(cmd({ agentType: 'claude --flag' }))).toBe('agentType inválido');
  });

  it('text e data têm teto de 64 KB', () => {
    expect(validarComandoOrca(cmd({ text: 'a'.repeat(64 * 1024) }))).toBeNull();
    expect(validarComandoOrca(cmd({ text: 'a'.repeat(64 * 1024 + 1) }))).toBe('text acima de 64 KB');
    // bytes, não caracteres: multibyte conta mais
    expect(validarComandoOrca(cmd({ data: 'é'.repeat(40 * 1024) }))).toBe('data acima de 64 KB');
  });

  it('enviar_teclas exige terminalHandle e data', () => {
    expect(validarComandoOrca(cmd({ acao: 'enviar_teclas', terminalHandle: 't1', data: '\r' }))).toBeNull();
    expect(validarComandoOrca(cmd({ acao: 'enviar_teclas', data: 'x' }))).toBe('terminalHandle e data obrigatórios');
    expect(validarComandoOrca(cmd({ acao: 'enviar_teclas', terminalHandle: 't1', data: '' }))).toBe(
      'terminalHandle e data obrigatórios',
    );
  });

  it('obrigatórios das ações de configuração', () => {
    expect(validarComandoOrca(cmd({ acao: 'vincular_repo', slug: 'a' }))).toBe('slug e folder obrigatórios');
    expect(validarComandoOrca(cmd({ acao: 'vincular_repo', slug: 'a', folder: 'p' }))).toBeNull();
    expect(validarComandoOrca(cmd({ acao: 'desvincular_repo' }))).toBe('slug obrigatório');
    expect(validarComandoOrca(cmd({ acao: 'parear_ambiente', pairingCode: ' ' }))).toBe('pairingCode obrigatório');
    expect(validarComandoOrca(cmd({ acao: 'remover_ambiente' }))).toBe('id do ambiente obrigatório');
  });
});
