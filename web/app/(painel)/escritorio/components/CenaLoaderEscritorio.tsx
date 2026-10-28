'use client';

import { useEffect, useState } from 'react';
import { CharSprite } from './CharSprite';

interface CenaLoaderEscritorioProps {
  progress: number;
  step: string;
  totalProjetos?: number;
}

export function CenaLoaderEscritorio({
  progress,
  step,
  totalProjetos = 20,
}: CenaLoaderEscritorioProps) {
  const [frameTick, setFrameTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameTick((t) => (t + 1) % 4);
    }, 320);
    return () => clearInterval(timer);
  }, []);

  const totalBlocks = 16;
  const filledBlocks = Math.max(
    2,
    Math.min(totalBlocks, Math.round((progress / 100) * totalBlocks)),
  );

  const dots = '.'.repeat((frameTick % 3) + 1);

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#11131d] px-4 select-none"
      style={{
        backgroundImage:
          'radial-gradient(circle at 50% 42%, rgba(56, 189, 248, 0.10) 0%, rgba(17, 19, 29, 0.96) 65%), linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
        backgroundSize: '100% 100%, 24px 24px, 24px 24px',
      }}
    >
      {/* Card Central Estilo Gather v2 / Pixel Studio */}
      <div
        className="relative flex w-full max-w-md flex-col items-center rounded-xl border-2 border-[#384166] bg-[#181b2a]/95 p-6 shadow-2xl backdrop-blur-md"
        style={{
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.65), 4px 4px 0px #0a0b12',
        }}
      >
        {/* Tag superior */}
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-sky-300">
          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-sky-400" />
          Tech Studio HQ · 36×26
        </div>

        {/* Mini-Cena Diorama em Pixel Art */}
        <div className="relative mb-5 flex h-28 w-full items-center justify-center overflow-hidden rounded-lg border border-[#2d3350] bg-[#121521]">
          {/* Piso quadriculado do diorama */}
          <div
            className="absolute inset-x-0 bottom-0 h-11 border-t border-[#29304d] bg-[#1a1f33]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 16px, transparent 16px, transparent 32px)',
            }}
          />

          {/* Fileira de personagens chegando nas baias */}
          <div className="relative z-10 flex items-end gap-5 pb-2">
            {[0, 5, 2, 8, 11].map((palette, idx) => {
              const bounce = (frameTick + idx) % 2 === 0;
              return (
                <div
                  key={palette}
                  className="flex flex-col items-center transition-transform duration-200"
                  style={{
                    transform: bounce ? 'translateY(-3px)' : 'translateY(0px)',
                  }}
                >
                  {/* Balãozinho pixelado em cima do personagem */}
                  <div
                    className="mb-1 rounded border border-white/15 bg-[#232942] px-1.5 py-0.5 font-mono text-[9px] text-white/90 shadow"
                    style={{
                      opacity: (frameTick + idx) % 3 === 0 ? 1 : 0.45,
                    }}
                  >
                    {idx === 0
                      ? '👑'
                      : idx === 1
                        ? '💻'
                        : idx === 2
                          ? '💬'
                          : idx === 3
                            ? '⚡'
                            : '☕'}
                  </div>

                  {/* Sprite do personagem */}
                  <div className="flex h-11 w-10 items-center justify-center rounded border border-white/10 bg-[#171a29]/80 shadow-inner">
                    <CharSprite charIndex={palette} size={32} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Título + Subtítulo */}
        <h2
          className="text-center text-[15px] font-semibold tracking-wide text-white"
          style={{ fontFamily: "'FS Pixel Sans', monospace, sans-serif" }}
        >
          Preparando o Escritório 2D{dots}
        </h2>
        <p className="mt-1 text-center text-[12px] text-white/65">{step}</p>

        {/* Barra de Progresso Segmentada Estilo Pixel Art */}
        <div className="mt-4 w-full">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[11px]">
            <span className="text-sky-300">
              {totalProjetos > 0 ? `${totalProjetos} projetos em dev` : 'Sincronizando baias'}
            </span>
            <span className="font-semibold text-emerald-400">{Math.round(progress)}%</span>
          </div>

          <div
            className="grid grid-cols-16 gap-1 rounded-md border-2 border-[#384166] bg-[#0e101a] p-1"
            style={{
              gridTemplateColumns: `repeat(${totalBlocks}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: totalBlocks }).map((_, i) => {
              const ativo = i < filledBlocks;
              return (
                <div
                  key={i}
                  className="h-3 rounded-[2px] transition-all duration-150"
                  style={{
                    background: ativo
                      ? i >= totalBlocks - 3
                        ? '#34d399'
                        : '#38bdf8'
                      : 'rgba(255,255,255,0.06)',
                    boxShadow: ativo ? '0 0 8px rgba(56, 189, 248, 0.45)' : 'none',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Checklist de etapas */}
        <div className="mt-4 grid w-full grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center text-[10px] text-white/60">
          <div className={progress >= 25 ? 'font-medium text-emerald-300' : ''}>
            {progress >= 25 ? '✓' : '○'} Sprites 2D
          </div>
          <div className={progress >= 70 ? 'font-medium text-emerald-300' : ''}>
            {progress >= 70 ? '✓' : '○'} 28 Estações
          </div>
          <div className={progress >= 95 ? 'font-medium text-emerald-300' : ''}>
            {progress >= 95 ? '✓' : '○'} Clientes
          </div>
        </div>
      </div>
    </div>
  );
}
