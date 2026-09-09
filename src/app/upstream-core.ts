/**
 * Núcleo puro do vigia de upstream do Baileys: dado o que o GitHub e o npm
 * devolveram e o que já foi avisado, decide o que é novidade e formata o aviso.
 * Sem I/O e sem relógio próprio — o Radar (loop) injeta.
 */

export interface UpstreamCommit {
  sha: string;
  /** "YYYY-MM-DD" */
  data: string;
  titulo: string;
}

/** O que a rede devolveu: commits do mais novo pro mais velho + dist-tag latest. */
export interface UpstreamSnapshot {
  commits: UpstreamCommit[];
  versaoNpm: string | null;
}

/** O que já foi avisado (persistido no status do radar). */
export interface UpstreamEstado {
  ultimoSha: string | null;
  ultimaVersaoNpm: string | null;
}

export interface UpstreamNovidades {
  commitsNovos: UpstreamCommit[];
  versaoNova: string | null;
}

/**
 * Commits novos = os que vêm ANTES do último sha visto na lista (mais novos).
 * Sem sha visto é a primeira execução: nada a avisar, só marcar de onde partir —
 * senão o primeiro aviso despejaria a janela inteira de histórico. Sha visto que
 * não está mais na janela conta tudo como novo (melhor avisar demais que perder).
 */
export function novidadesUpstream(
  snap: UpstreamSnapshot,
  estado: UpstreamEstado,
  versaoInstalada: string,
): UpstreamNovidades {
  let commitsNovos: UpstreamCommit[] = [];
  if (estado.ultimoSha !== null) {
    const idx = snap.commits.findIndex((c) => c.sha === estado.ultimoSha);
    commitsNovos = idx === -1 ? snap.commits : snap.commits.slice(0, idx);
  }
  const versaoNova =
    snap.versaoNpm !== null &&
    snap.versaoNpm !== versaoInstalada &&
    snap.versaoNpm !== estado.ultimaVersaoNpm
      ? snap.versaoNpm
      : null;
  return { commitsNovos, versaoNova };
}

/** Teto de commits listados no aviso — o resto vira "… e mais N". */
const MAX_COMMITS = 10;

/** Aviso com formatação do WhatsApp; string vazia = nada a mandar. */
export function formatarUpstream(n: UpstreamNovidades, versaoInstalada: string): string {
  if (n.commitsNovos.length === 0 && n.versaoNova === null) return '';
  const blocos: string[] = ['🔭 *Baileys upstream*'];
  if (n.versaoNova !== null) {
    blocos.push(`📦 npm publicou *${n.versaoNova}* (instalada ${versaoInstalada})`);
  }
  if (n.commitsNovos.length > 0) {
    const mostrados = n.commitsNovos.slice(0, MAX_COMMITS);
    const resto = n.commitsNovos.length - mostrados.length;
    const itens = mostrados.map((c) => `• \`${c.sha}\` ${c.data} — ${c.titulo}`).join('\n');
    const sufixo = resto > 0 ? `\n_… e mais ${resto}_` : '';
    const plural = n.commitsNovos.length === 1 ? 'commit novo' : 'commits novos';
    blocos.push(`${n.commitsNovos.length} ${plural} na master:\n${itens}${sufixo}`);
  }
  return blocos.join('\n\n');
}

/** Uma checagem por intervalo (horas); nunca verificou → verifica. */
export function deveVerificarUpstream(
  verificadoEmMs: number | null,
  agoraMs: number,
  intervaloH: number,
): boolean {
  if (verificadoEmMs === null) return true;
  return agoraMs - verificadoEmMs >= intervaloH * 60 * 60_000;
}
