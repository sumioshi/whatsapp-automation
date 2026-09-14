/**
 * Presença coerente com a entrega: online ao ler e enquanto digita, offline
 * um pouco depois do último balão. Nada fora de uma entrega — presença
 * "fantasma" pra quem não está em conversa fica de fora de propósito.
 */
export interface PortaPresenca {
  sendPresence(estado: 'available' | 'unavailable'): Promise<void>;
}

type Agendar = (fn: () => void, ms: number) => { cancelar(): void };
const agendarPadrao: Agendar = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return { cancelar: () => clearTimeout(t) };
};

const INDISPONIVEL_MIN_MS = 20_000;
const INDISPONIVEL_MAX_MS = 90_000;

export class Presenca {
  private pendente: { cancelar(): void } | null = null;

  constructor(
    private readonly porta: PortaPresenca,
    private readonly ativo: boolean,
    private readonly rng: () => number = Math.random,
    private readonly agendar: Agendar = agendarPadrao,
  ) {}

  aoLer(): void {
    this.disponivel();
  }

  aoEntregar(): void {
    this.disponivel();
  }

  aoTerminar(): void {
    if (!this.ativo) return;
    this.pendente?.cancelar();
    const ms = INDISPONIVEL_MIN_MS + this.rng() * (INDISPONIVEL_MAX_MS - INDISPONIVEL_MIN_MS);
    this.pendente = this.agendar(() => {
      this.pendente = null;
      void this.porta.sendPresence('unavailable');
    }, Math.round(ms));
  }

  parar(): void {
    this.pendente?.cancelar();
    this.pendente = null;
  }

  private disponivel(): void {
    if (!this.ativo) return;
    this.pendente?.cancelar();
    this.pendente = null;
    void this.porta.sendPresence('available');
  }
}
