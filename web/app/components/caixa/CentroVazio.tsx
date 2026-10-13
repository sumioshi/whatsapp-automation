import { Kbd } from "../ui/Kbd";
import { Icone } from "./icones";

/** Centro da Caixa sem conversa aberta: orienta a escolher uma na fila. */
export function CentroVazio() {
  return (
    <div className="grid flex-1 place-items-center bg-bg px-8">
      <div className="max-w-[40ch] text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-card border border-line bg-surface text-fg-faint [box-shadow:var(--shadow-card)]">
          <Icone nome="inbox" tamanho={22} />
        </span>
        <h2 className="mt-4 text-[15px] font-semibold text-fg">Escolha uma conversa na fila</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-dim">
          Quem espera há mais tempo fica no topo. Abra uma conversa para ler, responder e ver o painel do cliente.
        </p>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[12.5px] text-fg-faint">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd>
            andar na fila
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            abrir
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>U</Kbd>
            próxima não lida
          </span>
        </p>
      </div>
    </div>
  );
}
