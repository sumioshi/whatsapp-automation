'use client';

import { useEffect, useState } from 'react';

import { CHARACTER_SITTING_OFFSET_PX } from '../constants';
import type { SubagentCharacter } from '../office/components/ToolOverlay';
import { offsetPuloPx } from '../office/engine/characters';
import type { OfficeState } from '../office/engine/officeState';
import { LEADER_ID, PLAYER_ID } from '../office/engine/officeState';
import { CharacterState, TILE_SIZE } from '../office/types';

export interface AgentLabelMeta {
  nome: string;
  subLabel?: string;
  dotColor?: string;
  pulse?: boolean;
  urgente?: boolean;
}

interface AgentLabelsProps {
  officeState: OfficeState;
  agents: number[];
  agentMeta: Record<number, AgentLabelMeta>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  panRef: React.RefObject<{ x: number; y: number }>;
  subagentCharacters: SubagentCharacter[];
  onSelectAgent?: (id: number) => void;
  playerLabel?: string;
}

export function AgentLabels({
  officeState,
  agents,
  agentMeta,
  containerRef,
  zoom,
  panRef,
  subagentCharacters,
  onSelectAgent,
  playerLabel = 'Você',
}: AgentLabelsProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setTick((n) => n + 1);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

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

  const subLabelMap = new Map<number, string>();
  for (const sub of subagentCharacters) {
    subLabelMap.set(sub.id, sub.label);
  }

  const allIds = [
    ...(officeState.characters.has(LEADER_ID) ? [LEADER_ID] : []),
    ...(officeState.characters.has(PLAYER_ID) ? [PLAYER_ID] : []),
    ...agents,
    ...subagentCharacters.map((s) => s.id),
  ];

  const selectedId = officeState.selectedAgentId;
  const hoveredId = officeState.hoveredAgentId;

  return (
    <>
      {allIds.map((id) => {
        const ch = officeState.characters.get(id);
        if (!ch) return null;

        if (ch.matrixEffect === 'despawn') return null;

        const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
        const screenX = (deviceOffsetX + ch.x * zoom) / dpr;
        const screenY = (deviceOffsetY + (ch.y + sittingOffset + offsetPuloPx(ch) - 24) * zoom) / dpr - (isMobile ? 12 : 16);

        const isLeader = id === LEADER_ID;
        const isPlayer = id === PLAYER_ID;
        const isSub = subLabelMap.has(id);
        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;

        const meta = agentMeta[id];
        let dotColor = meta?.dotColor ?? 'transparent';
        const isPulse = meta?.pulse ?? false;
        const isUrgente = meta?.urgente ?? false;

        if (isLeader) {
          dotColor = '#f59e0b';
        } else if (isPlayer) {
          dotColor = '#60a5fa';
        }

        // On mobile, if there are many characters (> 12), hide non-urgent lounge labels unless selected/hovered
        const isIdleInLounge =
          !isLeader &&
          !isPlayer &&
          !isSub &&
          !isSelected &&
          !isHovered &&
          !isUrgente &&
          !isPulse &&
          !meta?.subLabel;

        if (isMobile && agents.length > 10 && isIdleInLounge) {
          return null;
        }

        const rawLabel = isLeader
          ? 'Recepção'
          : isPlayer
            ? playerLabel
            : isSub
              ? subLabelMap.get(id)!
              : meta?.nome || ch.folderName || `Cliente #${id}`;

        const labelText =
          isMobile && !isSelected && !isLeader && !isPlayer
            ? rawLabel.split(/\s+/).slice(0, 2).join(' ')
            : rawLabel;

        const canClick = !isLeader && !isPlayer && !isSub && Boolean(onSelectAgent);

        return (
          <div
            key={id}
            role={canClick ? 'button' : undefined}
            tabIndex={canClick ? 0 : undefined}
            aria-label={
              canClick
                ? `${rawLabel}${meta?.subLabel ? `, aguardando ${meta.subLabel}` : ''}`
                : undefined
            }
            onClick={
              canClick
                ? (e) => {
                    e.stopPropagation();
                    onSelectAgent?.(id);
                  }
                : undefined
            }
            onKeyDown={
              canClick
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectAgent?.(id);
                    }
                  }
                : undefined
            }
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
            style={{
              position: 'absolute',
              left: screenX,
              top: screenY,
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: canClick ? 'auto' : 'none',
              cursor: canClick ? 'pointer' : 'default',
              zIndex: isSelected ? 42 : isUrgente ? 41 : 40,
            }}
          >
            {isLeader && (
              <span
                style={{
                  fontSize: '12px',
                  lineHeight: 1,
                  marginBottom: 1,
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))',
                }}
              >
                👑
              </span>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: isLeader
                  ? 'rgba(245, 158, 11, 0.25)'
                  : isPlayer
                    ? 'rgba(59, 130, 246, 0.28)'
                    : isSelected
                      ? 'rgba(30, 32, 48, 0.96)'
                      : isUrgente
                        ? 'rgba(69, 18, 24, 0.92)'
                        : 'rgba(18, 20, 30, 0.86)',
                border: isLeader
                  ? '1px solid rgba(245, 158, 11, 0.6)'
                  : isPlayer
                    ? '1px solid rgba(96, 165, 250, 0.7)'
                    : isSelected
                      ? '1.5px solid #93c5fd'
                      : isUrgente
                        ? '1px solid rgba(248, 113, 113, 0.65)'
                        : '1px solid rgba(255,255,255,0.16)',
                borderRadius: 3,
                padding: isMobile ? '1px 4px' : '1px 6px',
                whiteSpace: 'nowrap',
                maxWidth: isMobile ? 120 : 165,
                boxShadow: isSelected
                  ? '0 0 0 2px rgba(59, 130, 246, 0.35), 0 2px 6px rgba(0,0,0,0.6)'
                  : '0 2px 4px rgba(0,0,0,0.45)',
              }}
            >
              {dotColor !== 'transparent' && (
                <span
                  className={isPulse ? 'pixel-agents-pulse' : undefined}
                  style={{
                    width: isMobile ? 5 : 6,
                    height: isMobile ? 5 : 6,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                    boxShadow: isUrgente ? `0 0 6px ${dotColor}` : undefined,
                  }}
                />
              )}
              <span
                style={{
                  fontSize: isMobile ? '10px' : isSub ? '11px' : '12px',
                  fontStyle: isSub ? 'italic' : undefined,
                  fontWeight: isLeader || isPlayer || isSelected ? 700 : 600,
                  fontFamily: 'var(--font-sans), system-ui, sans-serif',
                  color: isLeader
                    ? '#fbbf24'
                    : isPlayer
                      ? '#93c5fd'
                      : 'rgba(255, 255, 255, 0.94)',
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {labelText}
              </span>
              {meta?.subLabel && (!isMobile || isSelected || isUrgente) && (
                <span
                  style={{
                    fontSize: isMobile ? '9px' : '10px',
                    fontFamily: 'var(--font-mono), monospace',
                    fontWeight: 600,
                    color: isUrgente ? '#fca5a5' : 'rgba(255, 255, 255, 0.7)',
                    marginLeft: 2,
                    flexShrink: 0,
                  }}
                >
                  · {meta.subLabel}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
