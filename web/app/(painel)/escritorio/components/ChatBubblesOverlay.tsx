'use client';

import { useEffect, useState } from 'react';
import type { PresenceView } from '@/lib/presence';
import { CHARACTER_SITTING_OFFSET_PX } from '../constants';
import { offsetPuloPx } from '../office/engine/characters';
import type { OfficeState } from '../office/engine/officeState';
import { CharacterState, TILE_SIZE } from '../office/types';

export interface ChatBubbleInfo {
  id: number;
  slug: string;
  nome: string;
  autor?: string;
  texto?: string | null;
  aguardando?: boolean;
  waitingMs?: number;
  urgente?: boolean;
  presenca?: PresenceView;
  /** Mensagem recém-chegada: balão em destaque até `ate` (epoch ms), depois volta ao normal */
  flash?: { autor?: string; texto: string; ate: number };
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
  const hoveredId = officeState.hoveredAgentId;
  const agora = Date.now();
  const flashAtivo = (b: ChatBubbleInfo) => Boolean(b.flash && b.flash.ate > agora);

  // Um único anúncio pro leitor de tela com as mensagens recém-chegadas (não um por NPC)
  const anuncios = Object.values(bubbles)
    .filter(flashAtivo)
    .map((b) => `${b.nome}: ${b.flash?.autor ? `${b.flash.autor}: ` : ''}${b.flash?.texto}`);

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {anuncios.join('. ')}
      </div>
      {Object.entries(bubbles).map(([idStr, b]) => {
        const id = Number(idStr);
        const ch = officeState.characters.get(id);
        if (!ch || ch.matrixEffect === 'despawn') return null;

        const isTyping = b.presenca?.status === 'typing';
        const isRecording = b.presenca?.status === 'recording';
        const isFlash = flashAtivo(b);
        const hasText = isFlash || Boolean(b.texto && b.texto.trim().length > 0);
        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        const isAguardando = Boolean(b.aguardando);

        // Exibe o balão sempre que:
        // 1. Cliente está aguardando resposta (balão vermelho de alerta fica visível até responder!)
        // 2. Cliente está digitando ou gravando áudio agora
        // 3. Cliente está selecionado (clicado) ou com cursor em cima (hover)
        // 4. Acabou de chegar mensagem (flash em destaque por alguns segundos)
        const deveExibir =
          (isAguardando || isTyping || isRecording || isSelected || isHovered || isFlash) &&
          (isTyping || isRecording || hasText);

        if (!deveExibir) return null;

        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
        // Posicionado logo acima do nome do personagem
        const screenY = (deviceOffsetY + (ch.y + sittingOffset + offsetPuloPx(ch) - 24) * zoom) / dpr - (isMobile ? 36 : 46);

        const isUrgente = isFlash || (b.urgente ?? false);
        const autor = isFlash ? b.flash?.autor : b.autor;

        // Limita o texto do balão
        const maxLen = isMobile ? 32 : 55;
        let preview = (isFlash ? b.flash?.texto : b.texto) ?? '';
        if (preview.length > maxLen) {
          preview = `${preview.slice(0, maxLen).trim()}…`;
        }

        return (
          <div
            key={`chat-bubble-${id}`}
            role="button"
            tabIndex={0}
            aria-label={`Mensagem de ${b.nome}: ${preview}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectAgent?.(id);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onSelectAgent?.(id);
              }
            }}
            className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
              // Mensagem recém-chegada entra com um pop curto; o resto só aparece
              animation: isFlash ? 'pop-in 220ms var(--ease-out-quint) both' : 'fadeIn 0.2s ease-out',
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
                border: isFlash
                  ? '2px solid #fca5a5'
                  : isUrgente
                    ? '1.5px solid #f87171'
                  : isSelected
                    ? '1.5px solid #60a5fa'
                    : '1px solid rgba(255, 255, 255, 0.22)',
                borderRadius: 4,
                padding: '3px 8px',
                boxShadow: isFlash
                  ? '0 0 0 2px rgba(239, 68, 68, 0.35), 0 0 16px rgba(239, 68, 68, 0.55), 0 3px 8px rgba(0,0,0,0.6)'
                  : isUrgente
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
                  {autor && (
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        color: isUrgente ? '#fca5a5' : '#93c5fd',
                        lineHeight: 1.1,
                      }}
                    >
                      {autor}
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
