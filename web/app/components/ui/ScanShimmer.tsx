import { cn } from "./cn";

export interface ScanShimmerProps {
  lines?: number;
  className?: string;
}

/**
 * Skeleton "varredura de terminal": N linhas hairline com uma faixa ember fina
 * percorrendo de cima a baixo (sweep). Reduced-motion → barras estáticas, sem sweep.
 * Pra loading de transcrição/documento/inbox — parece um terminal trabalhando, não um spinner.
 */
export function ScanShimmer({ lines = 3, className = "" }: ScanShimmerProps) {
  const id = "scan-shimmer";
  return (
    <div
      aria-hidden
      className={cn("scan-shimmer relative flex flex-col gap-2 overflow-hidden p-3", className)}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: linhas puramente decorativas, sem reordenação
          key={`${id}-${i}`}
          className="h-2.5 rounded bg-line-2/70"
          style={{ width: `${Math.max(40, 90 - i * 12)}%` }}
        />
      ))}
      <style>{`
        .scan-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(
            to bottom,
            transparent,
            color-mix(in oklab, var(--color-accent) 14%, transparent) 48%,
            color-mix(in oklab, var(--color-accent) 22%, transparent) 50%,
            transparent
          );
          background-size: 100% 60%;
          background-repeat: no-repeat;
          animation: scan-shimmer-sweep 1100ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes scan-shimmer-sweep {
          0% { background-position: 0 -60%; }
          100% { background-position: 0 160%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .scan-shimmer::after { animation: none; background: none; }
        }
      `}</style>
    </div>
  );
}
