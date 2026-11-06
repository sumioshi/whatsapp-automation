import { describe, expect, it } from 'vitest';
import { githubDoRemoto } from './git-remote';

describe('githubDoRemoto', () => {
  it('ssh padrão e com alias de host', () => {
    expect(githubDoRemoto('git@github.com:Org/repo.git')).toBe('Org/repo');
    expect(githubDoRemoto('git@github.com-pessoal:fulano/x.git')).toBe('fulano/x');
  });
  it('https com e sem .git, com barra final', () => {
    expect(githubDoRemoto('https://github.com/Org/repo.git')).toBe('Org/repo');
    expect(githubDoRemoto('https://github.com/Org/repo/')).toBe('Org/repo');
  });
  it('ssh:// e outros hosts', () => {
    expect(githubDoRemoto('ssh://git@github.com/Org/repo.git')).toBe('Org/repo');
    expect(githubDoRemoto('git@gitlab.com:Org/repo.git')).toBeNull();
    expect(githubDoRemoto('')).toBeNull();
  });
});
