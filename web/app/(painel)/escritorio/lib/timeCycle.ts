export type CicloIluminacaoModo = 'auto' | 'dia' | 'tarde' | 'noite';
export type FaseIluminacao = 'dia' | 'tarde' | 'noite';

export interface InfoFaseIluminacao {
  fase: FaseIluminacao;
  rotulo: string;
  icone: string;
  descricao: string;
  corAmbiente: string; // tint de preenchimento sobre o mapa
  intensidadeLuz: number; // 0 (sem luz artificial) a 1 (luzes acesas fortes)
}

export function getHorarioBrasilia(): { hora: number; minuto: number; texto: string } {
  try {
    const agora = new Date();
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const partes = formatter.formatToParts(agora);
    const hora = Number(partes.find((p) => p.type === 'hour')?.value ?? agora.getHours());
    const minuto = Number(partes.find((p) => p.type === 'minute')?.value ?? agora.getMinutes());
    const texto = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
    return { hora, minuto, texto };
  } catch {
    const agora = new Date();
    const hora = agora.getHours();
    const minuto = agora.getMinutes();
    return {
      hora,
      minuto,
      texto: `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`,
    };
  }
}

export function resolverFase(modo: CicloIluminacaoModo): FaseIluminacao {
  if (modo !== 'auto') return modo;
  const { hora } = getHorarioBrasilia();
  // 06h00 às 17h00: Dia claro
  // 17h00 às 19h00: Tarde / Pôr do sol (golden hour suave)
  // 19h00 às 06h00: Noite aconchegante com lâmpadas e monitores acesos
  if (hora >= 6 && hora < 17) return 'dia';
  if (hora >= 17 && hora < 19) return 'tarde';
  return 'noite';
}

export function getInfoFase(fase: FaseIluminacao): InfoFaseIluminacao {
  switch (fase) {
    case 'dia':
      return {
        fase: 'dia',
        rotulo: 'Dia Claro',
        icone: '☀️',
        descricao: 'Luz natural do dia em Brasília',
        corAmbiente: 'rgba(255, 255, 255, 0)',
        intensidadeLuz: 0,
      };
    case 'tarde':
      return {
        fase: 'tarde',
        rotulo: 'Pôr do Sol',
        icone: '🌅',
        descricao: 'Golden hour âmbar das 17h às 19h',
        corAmbiente: 'rgba(255, 140, 40, 0.14)',
        intensidadeLuz: 0.35,
      };
    case 'noite':
      return {
        fase: 'noite',
        rotulo: 'Noite',
        icone: '🌙',
        descricao: 'Luz ambiente noturna com monitores e luminárias acesos',
        corAmbiente: 'rgba(10, 14, 30, 0.52)',
        intensidadeLuz: 0.85,
      };
  }
}
