import { cn } from "./cn";

/** Pílula de não lidas. Em destaque (acento) quando há menção ou o chat não está silenciado. */
export function Contador({ n, destaque = false, className }: { n: number; destaque?: boolean; className?: string }) {
  if (!(n > 0)) return null;
  return (
    <span
      title={`${n} não ${n === 1 ? "lida" : "lidas"}`}
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-semibold tabular-nums leading-none",
        destaque ? "bg-accent text-accent-ink" : "bg-elevated text-fg-dim",
        className,
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
