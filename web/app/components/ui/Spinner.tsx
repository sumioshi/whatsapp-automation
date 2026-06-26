import { cn } from "./cn";

/** Spinner pequeno em mono-acento, pra estados de loading. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}
