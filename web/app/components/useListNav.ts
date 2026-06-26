"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GroupSummary } from "@/lib/data";

/**
 * useListNav — navegação por teclado estilo Superhuman/Linear para a lista de
 * conversas na sidebar.
 *
 * Atalhos:
 *   j / ↓  — próximo item
 *   k / ↑  — item anterior
 *   Enter  — abre a conversa selecionada (/g/<slug>)
 *   u      — pula para a próxima conversa com unread > 0 (cicla)
 *
 * Guarda silenciosamente quando:
 *   - foco está em input / textarea / [contenteditable]
 *   - a paleta ⌘K está aberta (detectado via atributo aria-modal no DOM)
 */
export function useListNav(
  groups: GroupSummary[],
  containerRef: React.RefObject<HTMLElement | null>,
) {
  const router = useRouter();
  const [navIndex, setNavIndex] = useState<number>(-1);
  // Track last groups length to reset when filter changes
  const prevLenRef = useRef(groups.length);

  // Reset navIndex when the list shrinks past the current index (e.g., search filter)
  useEffect(() => {
    const prev = prevLenRef.current;
    prevLenRef.current = groups.length;
    if (groups.length === 0) {
      setNavIndex(-1);
      return;
    }
    setNavIndex((idx) => {
      if (idx >= groups.length) return groups.length - 1;
      // If list changed from 0 to something, start at -1 (no selection)
      if (prev === 0 && groups.length > 0) return -1;
      return idx;
    });
  }, [groups.length]);

  /** Returns true if keyboard navigation should be suppressed */
  const shouldBlock = useCallback((): boolean => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = (el as HTMLElement).tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if ((el as HTMLElement).isContentEditable) return true;
    // Check if command palette is open (aria-modal dialog in DOM)
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return true;
    return false;
  }, []);

  const scrollItemIntoView = useCallback(
    (index: number) => {
      const container = containerRef.current;
      if (!container) return;
      // Each SidebarLink carries data-nav-item — query within the nav container
      const items = container.querySelectorAll<HTMLElement>("[data-nav-item]");
      const el = items[index];
      if (!el) return;
      // Respect prefers-reduced-motion: skip smooth scroll, use instant
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "instant" : "smooth" });
    },
    [containerRef],
  );

  const moveNext = useCallback(
    (e: KeyboardEvent) => {
      if (shouldBlock()) return;
      e.preventDefault();
      setNavIndex((i) => {
        const next = Math.min(i + 1, groups.length - 1);
        // Use requestAnimationFrame so DOM has updated before scrolling
        requestAnimationFrame(() => scrollItemIntoView(next));
        return next;
      });
    },
    [shouldBlock, groups.length, scrollItemIntoView],
  );

  const movePrev = useCallback(
    (e: KeyboardEvent) => {
      if (shouldBlock()) return;
      e.preventDefault();
      setNavIndex((i) => {
        const next = Math.max(i - 1, 0);
        requestAnimationFrame(() => scrollItemIntoView(next));
        return next;
      });
    },
    [shouldBlock, scrollItemIntoView],
  );

  const openSelected = useCallback(
    (e: KeyboardEvent) => {
      if (shouldBlock()) return;
      if (navIndex < 0 || navIndex >= groups.length) return;
      e.preventDefault();
      const g = groups[navIndex];
      if (g) router.push(`/g/${g.slug}`);
    },
    [shouldBlock, navIndex, groups, router],
  );

  const jumpNextUnread = useCallback(
    (e: KeyboardEvent) => {
      if (shouldBlock()) return;
      e.preventDefault();
      const len = groups.length;
      if (len === 0) return;
      // Search forward from navIndex+1, wrapping around
      for (let i = 1; i <= len; i++) {
        const idx = (navIndex + i) % len;
        if (groups[idx]!.unread > 0) {
          setNavIndex(idx);
          requestAnimationFrame(() => scrollItemIntoView(idx));
          return;
        }
      }
      // No unread found — no-op (could add a brief flash in the future)
    },
    [shouldBlock, navIndex, groups, scrollItemIntoView],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "j":
        case "ArrowDown":
          moveNext(e);
          break;
        case "k":
        case "ArrowUp":
          movePrev(e);
          break;
        case "Enter":
          openSelected(e);
          break;
        case "u":
          jumpNextUnread(e);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveNext, movePrev, openSelected, jumpNextUnread]);

  return { navIndex, setNavIndex };
}
