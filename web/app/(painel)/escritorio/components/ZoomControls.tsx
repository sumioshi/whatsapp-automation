import { useEffect, useRef, useState } from 'react';

import {
  ZOOM_DEFAULT_DPR_FACTOR,
  ZOOM_LEVEL_FADE_DELAY_MS,
  ZOOM_LEVEL_FADE_DURATION_SEC,
  ZOOM_LEVEL_HIDE_DELAY_MS,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../constants';

interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onCenterPlayer?: () => void;
}

export function ZoomControls({ zoom, onZoomChange, onCenterPlayer }: ZoomControlsProps) {
  const [showLevel, setShowLevel] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevZoomRef = useRef(zoom);

  const minDisabled = zoom <= ZOOM_MIN;
  const maxDisabled = zoom >= ZOOM_MAX;

  // Show zoom level briefly when zoom changes
  useEffect(() => {
    if (zoom === prevZoomRef.current) return;
    prevZoomRef.current = zoom;

    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

    setShowLevel(true);
    setFadeOut(false);

    fadeTimerRef.current = setTimeout(() => {
      setFadeOut(true);
    }, ZOOM_LEVEL_FADE_DELAY_MS);

    timerRef.current = setTimeout(() => {
      setShowLevel(false);
      setFadeOut(false);
    }, ZOOM_LEVEL_HIDE_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [zoom]);

  return (
    <>
      {/* Zoom level toast at top-center */}
      {showLevel && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 'var(--pixel-controls-z)',
            opacity: fadeOut ? 0 : 1,
            transition: `opacity ${ZOOM_LEVEL_FADE_DURATION_SEC}s ease-out`,
            pointerEvents: 'none',
          }}
          className="rounded-full border border-white/15 bg-[#141624]/90 px-3.5 py-1 font-mono text-xs font-bold tabular-nums text-white shadow-xl backdrop-blur-md select-none"
        >
          Zoom {zoom}x
        </div>
      )}

      {/* Floating Canvas Control Dock — top-right */}
      <div
        role="group"
        aria-label="Controles de câmera e zoom do mapa"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 'var(--pixel-controls-z)',
        }}
        className="flex flex-col items-center gap-1 rounded-xl border border-white/15 bg-[#141624]/90 p-1 shadow-2xl backdrop-blur-md"
      >
        <button
          type="button"
          onClick={() => onZoomChange(zoom + 1)}
          disabled={maxDisabled}
          aria-label="Aumentar zoom (Ctrl + Scroll)"
          title="Aumentar zoom (Ctrl + Scroll)"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <line
              x1="9"
              y1="3.5"
              x2="9"
              y2="14.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="3.5"
              y1="9"
              x2="14.5"
              y2="9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => onZoomChange(ZOOM_DEFAULT_DPR_FACTOR)}
          aria-label={`Zoom atual ${zoom}x. Clique para restaurar zoom padrão (${ZOOM_DEFAULT_DPR_FACTOR}x)`}
          title={`Restaurar zoom padrão (${ZOOM_DEFAULT_DPR_FACTOR}x)`}
          className="flex h-6 w-8 items-center justify-center rounded-md font-mono text-[11px] font-bold tabular-nums text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {zoom}x
        </button>

        <button
          type="button"
          onClick={() => onZoomChange(zoom - 1)}
          disabled={minDisabled}
          aria-label="Diminuir zoom (Ctrl + Scroll)"
          title="Diminuir zoom (Ctrl + Scroll)"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <line
              x1="3.5"
              y1="9"
              x2="14.5"
              y2="9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {onCenterPlayer && (
          <>
            <div className="my-0.5 h-px w-5 bg-white/15" aria-hidden="true" />
            <button
              type="button"
              onClick={onCenterPlayer}
              aria-label="Centralizar câmera no seu personagem"
              title="Centralizar câmera em Você"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-300 transition-colors hover:bg-blue-500/20 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-95"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
              </svg>
            </button>
          </>
        )}
      </div>
    </>
  );
}
