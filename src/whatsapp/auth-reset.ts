import { rename, stat } from 'node:fs/promises';

/**
 * Arquiva o diretório de credenciais movendo-o para um irmão `<dir>.bak-<ts>`.
 * Mover (em vez de apagar) preserva a sessão antiga para perícia/rollback e
 * libera o caminho para o Baileys criar credenciais novas (modo pareamento).
 * Retorna o caminho do backup, ou null se o diretório não existe.
 */
export async function archiveAuthDir(authDir: string): Promise<string | null> {
  try {
    await stat(authDir);
  } catch {
    return null;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? `${authDir}.bak-${stamp}` : `${authDir}.bak-${stamp}-${i}`;
    try {
      await stat(candidate);
    } catch {
      await rename(authDir, candidate);
      return candidate;
    }
  }
  throw new Error(`Sem nome livre para arquivar ${authDir}`);
}
