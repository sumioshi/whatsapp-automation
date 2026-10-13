"use client";

import type { Ref, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> };

export function Textarea({ className = "", ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "focus-ring w-full resize-none rounded-control border border-line-2 bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint transition-colors disabled:opacity-60 aria-[invalid=true]:border-danger",
        className,
      )}
      {...rest}
    />
  );
}
