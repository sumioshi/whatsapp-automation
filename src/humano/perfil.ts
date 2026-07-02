/**
 * Perfil de cadência por chat: aprende do jeito que o OPERADOR escreve naquele
 * chat (msgs fromMe do messages.jsonl). Cache em data/<slug>/.perfil-envio.json
 * com TTL 24h. Falha em qualquer ponto → PERFIL_DEFAULT (nunca trava envio).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PerfilEnvio } from './baloes.js';
import { PERFIL_DEFAULT } from './baloes.js';

const MIN_MSGS = 30;
const TTL_MS = 24 * 60 * 60 * 1000;
const CURTA = 25;

export function calcularPerfil(textosFromMe: string[]): PerfilEnvio | null {
  const textos = textosFromMe.filter((t) => t && t.trim());
  if (textos.length < MIN_MSGS) return null;
  const tamanhos = textos.map((t) => t.length);
  const media = tamanhos.reduce((a, b) => a + b, 0) / tamanhos.length;
  const curtas = tamanhos.filter((n) => n <= CURTA).length / tamanhos.length;
  return {
    tamanhoMedioBalao: Math.max(40, Math.min(300, Math.round(media))),
    baloesPorRajada: media < 60 ? 3 : 2,
    fracaoRespostaCurta: Number(curtas.toFixed(2)),
  };
}

interface CachePerfil {
  calculadoEm: number;
  perfil: PerfilEnvio;
}

export async function loadPerfilEnvio(slug: string | undefined, dataDir: string): Promise<PerfilEnvio> {
  if (!slug) return PERFIL_DEFAULT;
  const cachePath = join(dataDir, slug, '.perfil-envio.json');
  try {
    const cache = JSON.parse(await readFile(cachePath, 'utf8')) as CachePerfil;
    if (Date.now() - cache.calculadoEm < TTL_MS) return cache.perfil;
  } catch {
    /* sem cache — calcula */
  }
  try {
    const raw = await readFile(join(dataDir, slug, 'messages.jsonl'), 'utf8');
    const textos = raw
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as { fromMe?: boolean; type?: string; text?: string };
        } catch {
          return null;
        }
      })
      .filter((m) => m?.fromMe && m.type === 'text' && m.text)
      .map((m) => m!.text!);
    const perfil = calcularPerfil(textos);
    // Só grava cache quando o cálculo teve msgs suficientes (< MIN_MSGS => null):
    // gravar o default aqui prenderia um chat NOVO no default por 24h mesmo depois
    // de cruzar o limiar de MIN_MSGS, já que o cache tem prioridade no próximo load.
    if (perfil) {
      try {
        await writeFile(cachePath, JSON.stringify({ calculadoEm: Date.now(), perfil } satisfies CachePerfil));
      } catch {
        /* cache é best-effort */
      }
    }
    return perfil ?? PERFIL_DEFAULT;
  } catch {
    return PERFIL_DEFAULT;
  }
}
