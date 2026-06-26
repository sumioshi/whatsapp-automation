"use client";

import type { TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className = "", ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "focus-ring w-full resize-none rounded-control border border-line bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint transition-colors disabled:opacity-60",
        className,
      )}
      {...rest}
    />
  );
}
