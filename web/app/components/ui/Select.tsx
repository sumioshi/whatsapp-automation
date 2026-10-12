"use client";

import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className = "", children, ...rest }: SelectProps) {
  return (
    <select
      className={cn(
        "focus-ring w-full rounded-control border border-line-2 bg-surface px-2.5 py-1.5 text-sm text-fg transition-colors disabled:opacity-60",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}
