"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...rest }: InputProps) {
  return (
    <input
      className={cn(
        "focus-ring w-full rounded-control border border-line-2 bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-faint transition-colors disabled:opacity-60",
        className,
      )}
      {...rest}
    />
  );
}
