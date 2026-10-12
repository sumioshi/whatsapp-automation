"use client";

import { useEffect, useState } from "react";

interface PromptInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Só pode instalar quando o navegador ofereceu (beforeinstallprompt); some depois de instalado. */
export function usePromptInstalacao(): { podeInstalar: boolean; instalar: () => void } {
  const [prompt, setPrompt] = useState<PromptInstalacao | null>(null);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    const captura = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptInstalacao);
    };
    window.addEventListener("beforeinstallprompt", captura);
    const instalado = () => setPrompt(null);
    window.addEventListener("appinstalled", instalado);
    return () => {
      window.removeEventListener("beforeinstallprompt", captura);
      window.removeEventListener("appinstalled", instalado);
    };
  }, []);

  return {
    podeInstalar: prompt !== null,
    instalar: () => {
      if (!prompt) return;
      void prompt.prompt();
      void prompt.userChoice.then(() => setPrompt(null));
    },
  };
}

export function InstallButton() {
  const { podeInstalar, instalar } = usePromptInstalacao();
  if (!podeInstalar) return null;
  return (
    <button
      type="button"
      onClick={instalar}
      title="Instalar o Balcão como aplicativo"
      className="flex h-7 items-center gap-1.5 rounded-control border border-line-2 px-2 text-xs font-medium text-fg-dim transition-colors hover:bg-elevated hover:text-fg"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m7 10 5 5 5-5" />
        <path d="M12 15V3" />
      </svg>
      Instalar
    </button>
  );
}
