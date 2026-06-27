import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ExpedienteConfig } from './expediente';

/** Config padrão: DESLIGADO até o operador configurar. Seg–sex 09–18, fuso BR. */
export const EXPEDIENTE_DEFAULT: ExpedienteConfig = {
  ativo: false,
  timezone: 'America/Sao_Paulo',
  dias: {
    seg: ['09:00', '18:00'],
    ter: ['09:00', '18:00'],
    qua: ['09:00', '18:00'],
    qui: ['09:00', '18:00'],
    sex: ['09:00', '18:00'],
  },
  recado_dentro: 'Disponível',
  recado_fora: 'Fora do expediente. Respondo seg–sex, 9h–18h.',
};

function caminhoConfig(dataDir: string): string {
  return join(dataDir, 'expediente.json');
}
function caminhoEstado(dataDir: string): string {
  return join(dataDir, '.expediente-state.json');
}

/** Lê o config do disco e faz merge raso com o default (ausente/ inválido ⇒ default). */
export async function lerExpediente(dataDir: string): Promise<ExpedienteConfig> {
  try {
    const raw = await readFile(caminhoConfig(dataDir), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ExpedienteConfig>;
    return {
      ativo: parsed.ativo ?? EXPEDIENTE_DEFAULT.ativo,
      timezone: parsed.timezone || EXPEDIENTE_DEFAULT.timezone,
      dias: parsed.dias ?? EXPEDIENTE_DEFAULT.dias,
      recado_dentro: parsed.recado_dentro || EXPEDIENTE_DEFAULT.recado_dentro,
      recado_fora: parsed.recado_fora || EXPEDIENTE_DEFAULT.recado_fora,
    };
  } catch {
    return EXPEDIENTE_DEFAULT;
  }
}

/** Último estado aplicado (para detectar transição). `null` se nunca aplicado/corrompido. */
export async function lerEstadoAplicado(dataDir: string): Promise<'dentro' | 'fora' | null> {
  try {
    const raw = await readFile(caminhoEstado(dataDir), 'utf8');
    const parsed = JSON.parse(raw) as { estado?: unknown };
    return parsed.estado === 'dentro' || parsed.estado === 'fora' ? parsed.estado : null;
  } catch {
    return null;
  }
}

/** Persiste o estado aplicado (escrita atômica via tmp+rename). */
export async function gravarEstadoAplicado(
  dataDir: string,
  estado: 'dentro' | 'fora',
): Promise<void> {
  const path = caminhoEstado(dataDir);
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.expediente-state.${process.pid}.tmp`);
  await writeFile(tmp, `${JSON.stringify({ estado, atualizadoEm: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}
