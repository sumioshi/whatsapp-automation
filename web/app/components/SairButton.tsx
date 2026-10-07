"use client";

export function SairButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className ?? "mono text-xs text-fg-faint transition-colors hover:text-fg"}
      onClick={async () => {
        await fetch("/api/logout", { method: "POST" }).catch(() => {});
        window.location.assign("/login");
      }}
    >
      Sair
    </button>
  );
}
