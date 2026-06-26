"use client";

import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className = "", children, ...rest }: SelectProps) {
  return (
    <select
      className={cn(
        "w-full rounded-control border border-line bg-surface-2 px-3 py-2 text-sm text-fg transition-colors focus:border-accent/40 focus:outline-none disabled:opacity-60",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
