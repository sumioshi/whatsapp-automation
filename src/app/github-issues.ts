/** Cliente mínimo da API REST do GitHub pras ações do Despacho sobre issues. */
export interface GitHubIssues {
  adicionarLabel(repo: string, numero: number, label: string): Promise<void>;
  comentar(repo: string, numero: number, corpo: string): Promise<void>;
  fechar(repo: string, numero: number): Promise<void>;
}

export function githubIssues(token: string): GitHubIssues {
  const chamar = async (metodo: string, caminho: string, corpo: unknown): Promise<void> => {
    const res = await fetch(`https://api.github.com${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'whatsapp-automation-despacho',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`GitHub ${metodo} ${caminho} → HTTP ${res.status}`);
  };
  return {
    adicionarLabel: (repo, numero, label) =>
      chamar('POST', `/repos/${repo}/issues/${numero}/labels`, { labels: [label] }),
    comentar: (repo, numero, corpo) =>
      chamar('POST', `/repos/${repo}/issues/${numero}/comments`, { body: corpo }),
    fechar: (repo, numero) =>
      chamar('PATCH', `/repos/${repo}/issues/${numero}`, {
        state: 'closed',
        state_reason: 'not_planned',
      }),
  };
}
