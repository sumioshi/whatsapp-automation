"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

/** Largura e altura da caixa de conteúdo do elemento, acompanhando o redimensionamento. */
export function useTamanho<T extends HTMLElement>(): [RefObject<T | null>, { largura: number; altura: number } | null] {
  const ref = useRef<T>(null);
  const [tamanho, setTamanho] = useState<{ largura: number; altura: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setTamanho({ largura: el.clientWidth, altura: el.clientHeight });
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, tamanho];
}
