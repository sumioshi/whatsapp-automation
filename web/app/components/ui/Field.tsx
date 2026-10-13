import type { ReactNode } from "react";
import { cn } from "./cn";

export interface FieldProps {
  label?: string;
  hint?: ReactNode;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/** Wrapper de campo: rótulo em texto normal + controle + dica (ou erro, que toma o lugar da dica). */
export function Field({ label, hint, error, htmlFor, className = "", children }: FieldProps) {
  return (
    <div className={cn("block min-w-0", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="mb-1.5 block text-[12.5px] font-medium text-fg-dim first-letter:uppercase"
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-[12.5px] leading-snug text-danger">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-[12px] leading-snug text-fg-faint">{hint}</p>
      )}
    </div>
  );
}
