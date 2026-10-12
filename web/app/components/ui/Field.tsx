import type { ReactNode } from "react";
import { cn } from "./cn";

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/** Wrapper de campo: rótulo em texto normal + controle + dica/erro. */
export function Field({ label, hint, error, htmlFor, className = "", children }: FieldProps) {
  return (
    <div className={cn("block", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="mb-1.5 block text-[12.5px] font-medium text-fg-dim first-letter:uppercase first-letter:uppercase"
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mono mt-1 text-xs text-danger">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-fg-dim">{hint}</p>
      )}
    </div>
  );
}
