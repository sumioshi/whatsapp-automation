"use client";

import { type KeyboardEvent, type MouseEvent, useMemo, useRef, useState } from "react";
import { Icone } from "./caixa/icones";
import { cn } from "./ui";

const BARRAS = 34;

/** Onda decorativa estável por arquivo: o mesmo áudio tem sempre o mesmo desenho. */
function alturas(src: string): number[] {
  let h = 7;
  for (const ch of src) h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) >>> 0;
  const a = (h % 1000) / 160;
  const b = ((h >>> 10) % 1000) / 220;
  return Array.from({ length: BARRAS }, (_, k) => 6 + Math.round(20 * Math.abs(Math.sin(k * 1.7 + a) * Math.cos(k * 0.45 + b))));
}

function tempo(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const t = Math.floor(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * Player da nota de voz: tocar/pausar, a onda que enche conforme toca (clique
 * ou setas para buscar) e o tempo em mono. O <audio> fica escondido.
 */
export function LiveAudio({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [duracao, setDuracao] = useState(0);
  const [posicao, setPosicao] = useState(0);
  const [falhou, setFalhou] = useState(false);
  const onda = useMemo(() => alturas(src), [src]);
  const fracao = duracao > 0 ? Math.min(1, posicao / duracao) : 0;

  function alternar() {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setFalhou(true));
    else a.pause();
  }

  function irPara(s: number) {
    const a = ref.current;
    if (!a || !(duracao > 0)) return;
    a.currentTime = Math.max(0, Math.min(duracao, s));
    setPosicao(a.currentTime);
  }

  function clicarOnda(e: MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    irPara(((e.clientX - r.left) / r.width) * duracao);
  }

  function teclaOnda(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      irPara(posicao + (e.key === "ArrowRight" ? 5 : -5));
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      alternar();
    }
  }

  return (
    <div className="flex w-[clamp(220px,52vw,320px)] max-w-full items-center gap-2.5">
      <button
        type="button"
        onClick={alternar}
        aria-label={tocando ? "Pausar áudio" : duracao > 0 ? `Ouvir áudio de ${tempo(duracao)}` : "Ouvir áudio"}
        className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-on-ink transition-colors hover:bg-ink/85"
      >
        <Icone nome={tocando ? "pausa" : "play"} tamanho={12} />
      </button>
      {/* biome-ignore lint/a11y/useSemanticElements: onda clicável com teclado; input range não desenha barras */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Posição no áudio"
        aria-valuemin={0}
        aria-valuemax={Math.round(duracao)}
        aria-valuenow={Math.round(posicao)}
        aria-valuetext={`${tempo(posicao)} de ${tempo(duracao)}`}
        onClick={clicarOnda}
        onKeyDown={teclaOnda}
        className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-[2px] overflow-hidden rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {onda.map((h, i) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: barras fixas
            key={i}
            className={cn("block w-[2px] shrink-0 rounded-[1px]", (i + 0.5) / BARRAS <= fracao ? "bg-accent" : "bg-fg-mute")}
            style={{ height: h }}
          />
        ))}
      </div>
      <span className="shrink-0 font-mono text-[12px] tabular-nums text-fg-faint">
        {falhou ? "indisponível" : tempo(tocando || posicao > 0 ? posicao : duracao)}
      </span>
      {/* biome-ignore lint/a11y/useMediaCaption: nota de voz não tem legenda */}
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={(e) => setDuracao(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuracao(e.currentTarget.duration)}
        onTimeUpdate={(e) => setPosicao(e.currentTarget.currentTime)}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setPosicao(0);
        }}
        onError={() => setFalhou(true)}
      />
    </div>
  );
}
