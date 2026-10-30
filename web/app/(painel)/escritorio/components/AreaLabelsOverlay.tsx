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
  { id: 'reuniao', label: '📋 Sala de Contratos & Reuniões', col: 7.5, row: 1.5, color: '#fbbf24' },
  { id: 'recepcao', label: '🏛️ Recepção & Diretoria', col: 24, row: 1.5, color: '#c084fc' },
  { id: 'lounge', label: '☕ Cafeteria, Coffee Lab & Lounge', col: 40, row: 1.5, color: '#34d399' },
  { id: 'ala-oeste', label: '💻 Ala SaaS & AI Core (Baias 1–14)', col: 11, row: 8.8, color: '#60a5fa' },
  { id: 'ala-leste', label: '🚀 Ala Operações & Automação (Baias 15–28)', col: 36, row: 8.8, color: '#38bdf8' },
  // Exterior world zones
  { id: 'vila-norte', label: '🏘️ Vila Tech & Vale Norte', col: 24, row: -5.2, color: '#a7f3d0' },
  { id: 'riacho-oeste', label: '🌊 Riacho & Ponte do Bosque', col: -8, row: 15.2, color: '#7dd3fc' },
  { id: 'deck-leste', label: '☂️ Deck Bistrô & Jardim Leste', col: 50.2, row: 5.5, color: '#fcd34d' },
  { id: 'praca-sul', label: '🎄 Praça de Entrada & Avenida Sul', col: 24, row: 34.2, color: '#fda4af' },
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
