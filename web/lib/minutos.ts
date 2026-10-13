/**
 * Campo de minutos das Configurações (intervalo da sincronização, prazos do radar).
 * O servidor só aceita a partir de 1 e arredonda; aqui a mesma regra vira mensagem
 * na tela, em vez de o valor ser ignorado sem aviso.
 */
export type LeituraMinutos = { ok: true; valor: number } | { ok: false; erro: string };

export function lerMinutos(texto: string, opcoes: { max?: number } = {}): LeituraMinutos {
  const limpo = texto.trim();
  const n = limpo === '' ? Number.NaN : Number(limpo);
  const { max } = opcoes;
  const dentro = Number.isFinite(n) && n >= 1 && (max === undefined || n <= max);
  if (!dentro) {
    return {
      ok: false,
      erro: max === undefined ? 'Use um número de minutos maior que zero.' : `Use de 1 a ${max.toLocaleString('pt-BR')} minutos.`,
    };
  }
  return { ok: true, valor: Math.round(n) };
}
