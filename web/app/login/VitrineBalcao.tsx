import type { CSSProperties } from "react";
import { AnelEspera, Avatar, cn } from "@/app/components/ui";
import clara from "./campainha-clara.webp";
import escura from "./campainha-escura.webp";

const CARTAO =
  "vitrine-cartao absolute rounded-[12px] border border-line bg-surface p-3.5 [box-shadow:var(--float)] max-[1180px]:p-3";

/** Ícone de IA do Balcão (a mesma faísca da Caixa). */
function Faisca() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 16l.6 1.6 1.6.6-1.6.6L19 20.4l-.6-1.6-1.6-.6 1.6-.6z" />
    </svg>
  );
}

/**
 * Vitrine do login: a campainha do Balcão (clara no tema claro, escura no escuro, trocada
 * no CSS como .vitrine-balcao em globals.css) e dois pedaços do produto, quem espera e o
 * rascunho da IA. Os cartões são ilustração, como num anúncio: não leem dado nenhum.
 */
export function VitrineBalcao({ className }: { className?: string }) {
  const fotos = {
    "--campainha-clara": `url(${clara.src})`,
    "--campainha-clara-borrada": `url(${clara.blurDataURL})`,
    "--campainha-escura": `url(${escura.src})`,
    "--campainha-escura-borrada": `url(${escura.blurDataURL})`,
  } as CSSProperties;
  return (
    <aside
      aria-label="Sobre o Balcão"
      className={cn("vitrine-balcao relative isolate flex flex-col overflow-hidden bg-elevated", className)}
      style={fotos}
    >
      <div aria-hidden className="relative min-h-0 flex-1 max-[860px]:hidden">
        <div className={cn(CARTAO, "left-[7%] top-[9%] w-[min(296px,46%)]")} style={{ animationDelay: "140ms" }}>
          <div className="flex items-center gap-2.5">
            <Avatar nome="Clínica Ébano" tamanho="sm" />
            <b className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">Clínica Ébano</b>
            <AnelEspera ms={(5 * 60 + 12) * 60_000} />
          </div>
          <p className="mt-2 text-[12.5px] leading-snug text-fg-dim">
            Dr. Paulo: E o lembrete de hoje? Preciso saber se amanhã vai funcionar.
          </p>
        </div>

        <div className={cn(CARTAO, "right-[6%] top-[47%] w-[min(318px,50%)]")} style={{ animationDelay: "300ms" }}>
          <div className="flex items-center gap-1.5 text-[12px]">
            <span className="text-id-ia">
              <Faisca />
            </span>
            <b className="font-medium text-id-ia">Rascunho da IA</b>
            <span className="truncate text-fg-faint">na sua voz</span>
          </div>
          <p className="mt-2 text-[13px] leading-snug text-fg">
            Dr. Paulo, achei a causa e já liberei a fila. Amanhã às 8h confirmo aqui que os lembretes saíram.
          </p>
          <div className="mt-3 flex gap-2">
            <span className="rounded-control bg-ink px-2.5 py-1 text-[12px] font-medium text-on-ink">Usar texto</span>
            <span className="rounded-control border border-line-2 px-2.5 py-1 text-[12px] font-medium text-fg">
              Outra versão
            </span>
          </div>
        </div>
      </div>

      <div className="relative px-10 pb-10 max-[1180px]:px-8 max-[1180px]:pb-8 max-[860px]:hidden">
        <p className="max-w-[22ch] text-balance font-title text-[40px] font-medium leading-[1.05] tracking-[-0.02em] text-fg max-[1180px]:text-[32px]">
          Ninguém fica esperando no seu WhatsApp.
        </p>
        <p className="mt-3 max-w-[46ch] text-[14.5px] text-fg-dim">
          A fila por tempo de espera, a IA que escreve na sua voz e a agenda no mesmo lugar.
        </p>
      </div>
    </aside>
  );
}
