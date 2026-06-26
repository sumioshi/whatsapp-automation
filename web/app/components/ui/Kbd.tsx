import type { ReactNode } from "react";
import { cn } from "./cn";

/** Tecla física reutilizável — bevel pressionável (Raycast). Use p/ ⌘K, Enter, Esc… */
export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "kbd mono inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-2 bg-elevated px-1.5 text-[10px] font-medium text-fg-dim",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
