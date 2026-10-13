"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRotas } from "./RotasPainel";
import { useRouter } from "next/navigation";

function ehCampo(el: HTMLElement | null): boolean {
  if (!el?.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

/**
 * Bloqueia os atalhos de uma letra quando o foco está num campo, há um diálogo
 * aberto ou a tecla já foi tratada por quem estava embaixo (a paleta ⌘K fecha
 * no próprio Enter, antes de a tecla chegar aqui).
 */
export function atalhoBloqueado(e?: KeyboardEvent): boolean {
  if (e?.defaultPrevented || ehCampo(e?.target as HTMLElement | null)) return true;
  if (ehCampo(document.activeElement as HTMLElement | null)) return true;
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
}

/**
 * useListNav: navegação por teclado da fila da Caixa.
 *
 * Atalhos:
 *   j / ↓  próxima conversa
 *   k / ↑  conversa anterior
 *   Enter  abre a conversa do cursor
 *   u      pula para a próxima conversa com não lidas (cicla)
 *
 * O cursor começa na conversa aberta (`atual`), para o J levar à seguinte.
 * Não age com o foco num campo nem com a paleta ⌘K aberta.
 */
export function useListNav(
  itens: Array<{ slug: string; naoLidas: number }>,
  containerRef: React.RefObject<HTMLElement | null>,
  atual: string | null = null,
) {
  const router = useRouter();
  const rotas = useRotas();
  const [navIndex, setNavIndex] = useState<number>(-1);
  const ultimoAtual = useRef<string | null>(null);

  // Abriu outra conversa (clique, J/K + Enter, trilho): o cursor vai para ela.
  useEffect(() => {
    if (atual === ultimoAtual.current) return;
    ultimoAtual.current = atual;
    setNavIndex(atual ? itens.findIndex((i) => i.slug === atual) : -1);
  }, [atual, itens]);

  // A lista encolheu (filtro, vista): o cursor não pode ficar fora dela.
  useEffect(() => {
    setNavIndex((idx) => (idx >= itens.length ? itens.length - 1 : idx));
  }, [itens.length]);

  const scrollItemIntoView = useCallback(
    (index: number) => {
      const el = containerRef.current?.querySelectorAll<HTMLElement>("[data-nav-item]")[index];
      if (!el) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "instant" : "smooth" });
    },
    [containerRef],
  );

  const mover = useCallback(
    (e: KeyboardEvent, delta: number) => {
      if (atalhoBloqueado(e) || itens.length === 0) return;
      e.preventDefault();
      setNavIndex((i) => {
        const next = i < 0 ? (delta > 0 ? 0 : itens.length - 1) : Math.max(0, Math.min(itens.length - 1, i + delta));
        requestAnimationFrame(() => scrollItemIntoView(next));
        return next;
      });
    },
    [itens.length, scrollItemIntoView],
  );

  const abrir = useCallback(
    (e: KeyboardEvent) => {
      if (atalhoBloqueado(e)) return;
      const alvo = itens[navIndex];
      // Enter num botão ou link fora da fila é do próprio elemento; numa linha da fila, vale o cursor.
      const foco = document.activeElement as HTMLElement | null;
      const livre = !foco || foco === document.body || foco.hasAttribute("data-nav-item");
      if (!alvo || !livre) return;
      e.preventDefault();
      router.push(rotas.chat(alvo.slug));
    },
    [navIndex, itens, router, rotas],
  );

  const proximaNaoLida = useCallback(
    (e: KeyboardEvent) => {
      if (atalhoBloqueado(e) || itens.length === 0) return;
      e.preventDefault();
      for (let i = 1; i <= itens.length; i++) {
        const idx = (navIndex + i) % itens.length;
        if ((itens[idx]?.naoLidas ?? 0) > 0) {
          setNavIndex(idx);
          requestAnimationFrame(() => scrollItemIntoView(idx));
          return;
        }
      }
    },
    [navIndex, itens, scrollItemIntoView],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "j":
        case "J":
        case "ArrowDown":
          mover(e, 1);
          break;
        case "k":
        case "K":
        case "ArrowUp":
          mover(e, -1);
          break;
        case "Enter":
          abrir(e);
          break;
        case "u":
        case "U":
          proximaNaoLida(e);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mover, abrir, proximaNaoLida]);

  return { navIndex, setNavIndex };
}
