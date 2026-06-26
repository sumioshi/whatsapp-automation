"use client";

/**
 * Affordance visível da command palette (⌘K). Abre a paleta via evento de window
 * (`cmdk:open`), que o CommandPalette escuta — a paleta vive no layout, separada da
 * Sidebar, então isso evita prop drilling. Mostra o atalho como dica discreta.
 */
export function CmdkButton() {
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <button
      type="button"
      title="Buscar e navegar (comandos)"
      onClick={() => window.dispatchEvent(new Event("cmdk:open"))}
      className="focus-ring flex items-center gap-1.5 rounded-control border border-line bg-surface-2 px-2 py-1 text-fg-faint transition-colors hover:border-line-2 hover:text-fg"
      aria-label="Abrir paleta de comandos"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3Z" />
      </svg>
      <kbd className="mono text-[10px] leading-none tracking-tight">
        {isMac ? "⌘K" : "^K"}
      </kbd>
    </button>
  );
}
