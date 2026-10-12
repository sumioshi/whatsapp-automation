const HORA_BRT = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' });

/** Saudação do login pela hora de Brasília, seja qual for o fuso do servidor. */
export function saudacaoDoMomento(agora: Date): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const hora = Number(HORA_BRT.format(agora));
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Mensagem de erro do login como frase: maiúscula no começo e ponto no fim. */
export function textoDoErro(erro: string | null | undefined): string {
  const t = erro?.trim();
  if (!t) return 'Não foi possível entrar. Tente de novo.';
  const frase = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(frase) ? frase : `${frase}.`;
}
