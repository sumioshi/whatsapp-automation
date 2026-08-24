"use client";

import { useEffect, useState } from "react";

/** Alterna claro ⇄ escuro; persiste e aplica via data-theme na raiz. */
export function ThemeToggle({ compacto = false }: { compacto?: boolean }) {
  const [claro, setClaro] = useState(false);

  useEffect(() => {
    setClaro(document.documentElement.dataset.theme === "light");
  }, []);

  function alternar() {
    const novo = !claro;
    setClaro(novo);
    if (novo) {
      document.documentElement.dataset.theme = "light";
      window.localStorage.setItem("wac-tema", "light");
    } else {
      delete document.documentElement.dataset.theme;
      window.localStorage.setItem("wac-tema", "dark");
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title={claro ? "Mudar pro tema escuro" : "Mudar pro tema claro"}
      className={`grid place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg ${
        compacto ? "h-8 w-8" : "h-7 w-7"
      }`}
    >
      {claro ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      )}
    </button>
  );
}
