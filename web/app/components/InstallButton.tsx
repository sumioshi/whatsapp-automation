"use client";

import { useEffect, useState } from "react";

interface PromptInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Botão "Instalar" do PWA: só existe quando o navegador ofereceu a instalação
 * (beforeinstallprompt) — some sozinho depois de instalado, rodando standalone
 * ou em navegador sem suporte (Safari usa Arquivo → Adicionar à Dock).
 */
export function InstallButton() {
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

  if (!prompt) return null;

  return (
    <button
      type="button"
      onClick={() => {
        void prompt.prompt();
        void prompt.userChoice.then(() => setPrompt(null));
      }}
      title="Instalar o Signal Room como aplicativo"
      className="pressable flex h-7 items-center gap-1.5 rounded-[6px] border border-line px-2 text-xs font-medium text-fg-dim transition-colors hover:bg-surface-2 hover:text-fg"
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
