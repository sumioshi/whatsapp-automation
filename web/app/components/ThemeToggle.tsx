"use client";

import { useCallback, useEffect, useState } from "react";

/** Cor da barra do navegador/PWA (meta theme-color) acompanha o tema escolhido. */
function pintarBarraDoApp(tema: "light" | "dark") {
  const cor = tema === "dark" ? "#0a0b0d" : "#eef0f3";
  for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = cor;
}

/** Tema atual (escolha salva ou o do sistema) e a troca, que grava a escolha explícita. */
export function useTema(): { escuro: boolean; alternar: () => void } {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    const raiz = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const ler = () => setEscuro(raiz.dataset.theme ? raiz.dataset.theme === "dark" : media.matches);
    ler();
    // Algumas metas de cor chegam depois do script do <head>: repinta com a escolha salva.
    const salvo = raiz.dataset.theme;
    if (salvo === "light" || salvo === "dark") pintarBarraDoApp(salvo);
    media.addEventListener("change", ler);
    // Mais de um menu usa o hook (trilho e barra do celular): todos acompanham a troca.
    const obs = new MutationObserver(ler);
    obs.observe(raiz, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media.removeEventListener("change", ler);
      obs.disconnect();
    };
  }, []);

  const alternar = useCallback(() => {
    const novo = escuro ? "light" : "dark";
    document.documentElement.dataset.theme = novo;
    pintarBarraDoApp(novo);
    try {
      window.localStorage.setItem("wac-tema", novo);
    } catch {
      /* navegador sem armazenamento: vale só nesta sessão */
    }
    setEscuro(novo === "dark");
  }, [escuro]);

  return { escuro, alternar };
}

/** Botão solto de tema (o trilho usa o hook direto no menu do avatar). */
export function ThemeToggle({ compacto = false }: { compacto?: boolean }) {
  const { escuro, alternar } = useTema();
  return (
    <button
      type="button"
      onClick={alternar}
      title={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
      className={`grid place-items-center rounded-control text-fg-faint transition-colors hover:bg-elevated hover:text-fg ${
        compacto ? "h-8 w-8" : "h-7 w-7"
      }`}
    >
      {escuro ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
