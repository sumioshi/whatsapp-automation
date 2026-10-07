/**
 * O que pode sair pelas rotas de mídia: arquivo dentro de uma pasta de mídia de
 * um chat, ou a foto do chat. Histórico, estado do painel, tokens e qualquer
 * coisa com segmento começando em ponto ficam de fora.
 */
export const PASTAS_DE_MIDIA: ReadonlySet<string> = new Set([
  'audio',
  'video',
  'image',
  'document',
  'sticker',
  'gif',
]);

function segmentoValido(s: string): boolean {
  return s.length > 0 && !s.startsWith('.') && !s.includes('\\');
}

export function ehCaminhoDeMidia(rel: string): boolean {
  const partes = rel.split('/');
  if (!partes.every(segmentoValido)) return false;
  if (partes.length === 2) return partes[1] === 'avatar.jpg';
  if (partes.length !== 3) return false;
  const [, pasta, arquivo] = partes as [string, string, string];
  return PASTAS_DE_MIDIA.has(pasta) && !arquivo.toLowerCase().endsWith('.jsonl');
}

export function slugDoCaminho(rel: string): string {
  return rel.split('/')[0] ?? '';
}
