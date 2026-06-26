"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "./cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...rest }: InputProps) {
  return (
    <input
      className={cn(
        "focus-ring w-full rounded-control border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint transition-colors disabled:opacity-60",
        className,
      )}
      {...rest}
    />
  );
}
