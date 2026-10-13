"use client";

import type { ReactNode } from "react";
import { Button } from "@/app/components/ui";

/** Abre a paleta ⌘K (que vive no layout e escuta o evento `cmdk:open`). */
export function Buscar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Button
      variant="subtle"
      aria-label="Buscar ou ir para, atalho Command K"
      onClick={() => window.dispatchEvent(new Event("cmdk:open"))}
      className={className}
    >
      {children}
    </Button>
  );
}
