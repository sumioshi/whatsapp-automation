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

/** "nome@gmail.com" vira "no••@gmail.com" para mostrar na tela para onde o código foi. */
export function mascararEmail(email: string): string {
  const [local = '', dominio = ''] = email.split('@');
  const visivel = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, visivel)}${'•'.repeat(Math.max(1, local.length - visivel))}@${dominio}`;
}

const ERROS_DA_VOLTA: Record<string, string> = {
  google_cancelado: 'Você cancelou a entrada com o Google.',
  google_sem_acesso: 'Essa conta do Google não tem acesso a este painel.',
  google_falhou: 'Não foi possível entrar com o Google. Tente de novo.',
  google_indisponivel: 'A entrada com Google não está configurada neste painel.',
};

/** Frase para o ?erro= com que a volta do Google cai no login; código desconhecido não mostra nada. */
export function erroDaVolta(codigo: string | undefined): string | null {
  return (codigo && Object.hasOwn(ERROS_DA_VOLTA, codigo) && ERROS_DA_VOLTA[codigo]) || null;
}
