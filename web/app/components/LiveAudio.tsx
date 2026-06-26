"use client";

import { useEffect, useRef, useState } from "react";

const BAR_COUNT = 7;
const REST = 0.3;

/** Um AudioContext compartilhado por todos os áudios (navegadores limitam ~6). */
let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedCtx) return sharedCtx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    sharedCtx = new AC();
    return sharedCtx;
  } catch {
    return null;
  }
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Player de áudio com a assinatura do equalizer reagindo ao PLAYBACK real
 * (Web Audio AnalyserNode). O som é roteado primeiro pro destino (garante áudio
 * mesmo se o analyser falhar); o analyser é só um tap. Fallback: barras estáticas.
 */
export function LiveAudio({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const analyserRef = useRef<{ analyser: AnalyserNode; data: Uint8Array } | null>(null);
  const triedRef = useRef(false);
  const rafRef = useRef(0);
  const [playing, setPlaying] = useState(false);

  function setupGraph() {
    if (triedRef.current) return;
    triedRef.current = true;
    const el = audioRef.current;
    const ctx = getCtx();
    if (!el || !ctx) return;
    try {
      const source = ctx.createMediaElementSource(el);
      source.connect(ctx.destination); // som garantido primeiro
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser); // tap passivo
      analyserRef.current = { analyser, data: new Uint8Array(analyser.frequencyBinCount) };
    } catch {
      analyserRef.current = null; // cai pro estado estático
    }
  }

  function frame() {
    const a = analyserRef.current;
    if (!a) return;
    a.analyser.getByteFrequencyData(a.data as Uint8Array<ArrayBuffer>);
    const step = Math.max(1, Math.floor(a.data.length / BAR_COUNT));
    for (let i = 0; i < BAR_COUNT; i++) {
      const v = (a.data[i * step] ?? 0) / 255;
      const h = REST + v * (1 - REST);
      const bar = barsRef.current[i];
      if (bar) bar.style.transform = `scaleY(${h.toFixed(3)})`;
    }
    rafRef.current = requestAnimationFrame(frame);
  }

  function onPlay() {
    setPlaying(true);
    if (prefersReducedMotion()) return;
    setupGraph();
    const ctx = getCtx();
    void ctx?.resume?.();
    if (analyserRef.current) {
      cancelAnimationFrame(rafRef.current);
      frame();
    }
  }

  function settle() {
    setPlaying(false);
    cancelAnimationFrame(rafRef.current);
    for (const bar of barsRef.current) {
      if (bar) bar.style.transform = `scaleY(${REST})`;
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup só no unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // Sem analyser (fallback) e tocando → usa a animação CSS decorativa.
  const cssFallback = playing && triedRef.current && !analyserRef.current;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 items-center gap-[3px]" aria-hidden>
          {Array.from({ length: BAR_COUNT }).map((_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: barras fixas
              key={i}
              ref={(el) => {
                barsRef.current[i] = el;
              }}
              className={`w-[3px] rounded-full bg-accent ${cssFallback ? "eq-bar" : "eq-live-bar"}`}
              style={{ height: "100%", animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </span>
        <span className="mono text-[10px] uppercase tracking-wider text-fg-faint">
          {playing ? "ouvindo" : "voz"}
        </span>
      </div>
      {/* biome-ignore lint/a11y/useMediaCaption: nota de voz não tem legenda */}
      <audio
        ref={audioRef}
        controls
        preload="none"
        src={src}
        onPlay={onPlay}
        onPause={settle}
        onEnded={settle}
        className="w-full max-w-sm"
      />
    </div>
  );
}
