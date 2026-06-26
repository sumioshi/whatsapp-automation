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

/** Wrapper de campo: rótulo mono uppercase + controle + hint/erro. */
export function Field({ label, hint, error, htmlFor, className = "", children }: FieldProps) {
  return (
    <div className={cn("block", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="mono mb-1.5 block text-[11px] uppercase tracking-wider text-fg-faint"
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
