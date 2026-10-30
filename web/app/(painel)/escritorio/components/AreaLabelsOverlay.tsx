'use client';

import { useEffect, useState } from 'react';
import type { OfficeState } from '../office/engine/officeState';
import { TILE_SIZE } from '../office/types';

interface AreaZone {
  id: string;
  label: string;
  col: number;
  row: number;
  color: string;
}

const DEFAULT_ZONES: AreaZone[] = [
  // Exterior world zones (as salas internas já possuem placas nativas nas paredes norte estilo AIOffice)
  { id: 'vila-norte', label: '☀️ Horizonte & Parque Norte', col: 25, row: -4.2, color: '#fef08a' },
  { id: 'riacho-oeste', label: '🌊 Riacho & Bosque Oeste', col: -6.5, row: 17, color: '#7dd3fc' },
  { id: 'deck-leste', label: '☂️ Jardim & Pátio Leste', col: 55.5, row: 12, color: '#fcd34d' },
  { id: 'praca-sul', label: '🌳 Alameda & Parque Sul', col: 25, row: 38.5, color: '#86efac' },
];

interface AreaLabelsOverlayProps {
  officeState: OfficeState;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  visible?: boolean;
}

export function AreaLabelsOverlay({
  officeState,
  containerRef,
  zoom,
  panRef,
  visible = true,
}: AreaLabelsOverlayProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [visible]);

  if (!visible) return null;
  const el = containerRef.current;
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  return (
    <>
      {DEFAULT_ZONES.map((z) => {
        const screenX = (deviceOffsetX + z.col * TILE_SIZE * zoom) / dpr;
        const screenY = (deviceOffsetY + z.row * TILE_SIZE * zoom) / dpr;

        return (
          <div
            key={z.id}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              zIndex: 15,
              background: 'rgba(12, 14, 22, 0.62)',
              border: `1px solid ${z.color}44`,
              borderRadius: 4,
              padding: '1px 7px',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.02em',
              color: z.color,
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(2px)',
              userSelect: 'none',
            }}
          >
            {z.label}
          </div>
        );
      })}
    </>
  );
}
