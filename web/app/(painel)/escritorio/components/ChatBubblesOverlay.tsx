'use client';

import { useEffect, useState } from 'react';
import type { PresenceView } from '@/lib/presence';
import { CHARACTER_SITTING_OFFSET_PX } from '../constants';
import type { OfficeState } from '../office/engine/officeState';
import { CharacterState, TILE_SIZE } from '../office/types';

export interface ChatBubbleInfo {
  id: number;
  slug: string;
  nome: string;
  autor?: string;
  texto?: string | null;
  aguardando?: boolean;
  urgente?: boolean;
  presenca?: PresenceView;
}

interface ChatBubblesOverlayProps {
  officeState: OfficeState;
  bubbles: Record<number, ChatBubbleInfo>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  visible?: boolean;
  onSelectAgent?: (id: number) => void;
}

export function ChatBubblesOverlay({
  officeState,
  bubbles,
  containerRef,
  zoom,
  panRef,
  visible = true,
  onSelectAgent,
}: ChatBubblesOverlayProps) {
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
  const isMobile = rect.width < 640;
  const dpr = window.devicePixelRatio || 1;
  const canvasW = Math.round(rect.width * dpr);
  const canvasH = Math.round(rect.height * dpr);
  const layout = officeState.getLayout();
  const mapW = layout.cols * TILE_SIZE * zoom;
  const mapH = layout.rows * TILE_SIZE * zoom;
  const deviceOffsetX = Math.floor((canvasW - mapW) / 2) + Math.round(panRef.current.x);
  const deviceOffsetY = Math.floor((canvasH - mapH) / 2) + Math.round(panRef.current.y);

  const selectedId = officeState.selectedAgentId;

  return (
    <>
      {Object.entries(bubbles).map(([idStr, b]) => {
        const id = Number(idStr);
        const ch = officeState.characters.get(id);
        if (!ch || ch.matrixEffect === 'despawn') return null;

        const isTyping = b.presenca?.status === 'typing';
        const isRecording = b.presenca?.status === 'recording';
        const hasText = Boolean(b.texto && b.texto.trim().length > 0);

        // Só exibe se estiver digitando, gravando ou tiver texto de mensagem recente/aguardando
        if (!isTyping && !isRecording && !hasText) return null;

        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
        // Posicionado logo acima do nome do personagem
        const screenY = (deviceOffsetY + (ch.y + sittingOffset - 24) * zoom) / dpr - (isMobile ? 36 : 46);

        const isSelected = selectedId === id;
        const isUrgente = b.urgente ?? false;

        // Limita o texto do balão
        const maxLen = isMobile ? 32 : 55;
        let preview = b.texto ?? '';
        if (preview.length > maxLen) {
          preview = `${preview.slice(0, maxLen).trim()}…`;
        }

        return (
          <div
            key={`chat-bubble-${id}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectAgent?.(id);
            }}
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              transform: 'translate(-50%, -100%)',
              zIndex: isSelected ? 48 : isUrgente ? 46 : 44,
              pointerEvents: 'auto',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            {/* Caixa do Balão Pixel-Art */}
            <div
              className="group transition-all hover:scale-105"
              style={{
                background: isUrgente
                  ? 'rgba(45, 12, 18, 0.96)'
                  : isSelected
                    ? 'rgba(24, 30, 48, 0.97)'
                    : 'rgba(15, 18, 28, 0.94)',
                border: isUrgente
                  ? '1.5px solid #f87171'
                  : isSelected
                    ? '1.5px solid #60a5fa'
                    : '1px solid rgba(255, 255, 255, 0.22)',
                borderRadius: 4,
                padding: '3px 8px',
                boxShadow: isUrgente
                  ? '0 0 10px rgba(239, 68, 68, 0.4), 0 3px 8px rgba(0,0,0,0.6)'
                  : '0 3px 8px rgba(0,0,0,0.5)',
                maxWidth: isMobile ? 180 : 260,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {isRecording ? (
                <span className="flex items-center gap-1 text-[11px] text-red-400">
                  <span className="inline-block animate-pulse">🎙️</span>
                  <span className="font-semibold">Gravando áudio…</span>
                </span>
              ) : isTyping ? (
                <span className="flex items-center gap-1.5 text-[11px] text-blue-300">
                  <span className="inline-block animate-bounce">💬</span>
                  <span className="font-semibold">Digitando…</span>
                </span>
              ) : (
                <div className="flex flex-col text-left">
                  {b.autor && (
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        color: isUrgente ? '#fca5a5' : '#93c5fd',
                        lineHeight: 1.1,
                      }}
                    >
                      {b.autor}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: isMobile ? '10px' : '11px',
                      color: isUrgente ? '#fee2e2' : 'rgba(255, 255, 255, 0.95)',
                      lineHeight: 1.2,
                      fontStyle: 'normal',
                      wordBreak: 'break-word',
                    }}
                  >
                    {preview}
                  </span>
                </div>
              )}
            </div>

            {/* Rabinho do balão apontando para o NPC */}
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: `6px solid ${
                  isUrgente
                    ? '#f87171'
                    : isSelected
                      ? '#60a5fa'
                      : 'rgba(255, 255, 255, 0.22)'
                }`,
                marginTop: -1,
              }}
            />
          </div>
        );
      })}
    </>
  );
}
