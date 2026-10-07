/** Nome de arquivo vindo do cliente, reduzido a um basename inofensivo (só metadado, nunca caminho). */
export function nomeSeguro(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const base = raw.split(/[\\/]/).pop() ?? '';
  // biome-ignore lint/suspicious/noControlCharactersInRegex: remover controle é o objetivo
  const limpo = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+/, '').slice(0, 120);
  return limpo.trim() ? limpo : fallback;
}

/** Cobre ao menos as extensões de documento do coletor (src/whatsapp/mime.ts, conferido em teste). */
const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
};

/** Mimetype pela extensão do nome, pra quando o navegador manda o arquivo sem tipo. */
export function mimeDoNome(nome: string): string | undefined {
  const m = /\.([A-Za-z0-9]+)$/.exec(nome);
  return m?.[1] ? MIME_POR_EXTENSAO[m[1].toLowerCase()] : undefined;
}
