'use client';

import { useEffect } from 'react';
import { PALETTE_COUNT } from '../constants';
import { CharSprite } from './CharSprite';

interface PlayerAvatarModalProps {
  currentPalette: number;
  isOpen: boolean;
  onSelectPalette: (palette: number) => void;
  onClose: () => void;
}

const PALETTE_NAMES = [
  'Executivo Clássico',
  'Dev Casual',
  'Tech Lead Sênior',
  'Cyberpunk Neon',
  'Minimalista Dark',
  'Operador (Padrão)',
  'Startup Founder',
  'Hacker Urbano',
  'Engenheiro Cloud',
  'Design Studio',
  'Data Scientist',
  'Security White-Hat',
  'Full-Stack Retro',
  'Arquiteto de IA',
  'DevOps Ninja',
  'Product Manager',
  'Growth Specialist',
  'Gamer Pro',
];

export function PlayerAvatarModal({
  currentPalette,
  isOpen,
  onSelectPalette,
  onClose,
}: PlayerAvatarModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-modal-title"
      aria-describedby="avatar-modal-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/20 bg-[#151724] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[#1e2133] text-lg" aria-hidden="true">
              👤
            </span>
            <div>
              <h2 id="avatar-modal-title" className="text-sm font-semibold text-white">
                Visual do Seu Personagem
              </h2>
              <p id="avatar-modal-desc" className="text-[11px] text-white/65">
                Escolha a roupa e paleta do seu avatar no escritório
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de personalização (Esc)"
            title="Fechar (Esc)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            ✕
          </button>
        </div>

        {/* Preview do Personagem Atual */}
        <div className="my-4 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#1c1f30] p-3.5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#121420]">
              <CharSprite charIndex={currentPalette} size={40} />
            </div>
            <div>
              <span className="font-mono text-[10px] font-semibold tracking-wider uppercase text-blue-400">
                Paleta Ativa #{currentPalette}
              </span>
              <h3 className="text-sm font-bold text-white">
                {PALETTE_NAMES[currentPalette] ?? `Estilo #${currentPalette}`}
              </h3>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/65">
                Controle com{' '}
                <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                  WASD
                </kbd>{' '}
                ou{' '}
                <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                  Setas
                </kbd>
              </span>
            </div>
          </div>
        </div>

        {/* Grade de Seleção de Paletas */}
        <div
          role="group"
          aria-label="Paletas de personagem disponíveis"
          className="grid grid-cols-6 gap-2"
        >
          {Array.from({ length: PALETTE_COUNT }).map((_, idx) => {
            const isSelected = idx === currentPalette;
            const nome = PALETTE_NAMES[idx] ?? `Visual #${idx}`;
            return (
              <button
                key={idx}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${nome} (Paleta #${idx})`}
                onClick={() => onSelectPalette(idx)}
                title={nome}
                className={`group relative flex flex-col items-center justify-center rounded-xl border p-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  isSelected
                    ? 'border-blue-400 bg-blue-500/20 shadow-md ring-2 ring-blue-500/40'
                    : 'border-white/10 bg-[#1e2133] hover:border-white/30 hover:bg-[#25293d]'
                }`}
              >
                <CharSprite charIndex={idx} size={28} />
                <span className="mt-1 font-mono text-[9px] tabular-nums text-white/65 group-hover:text-white">
                  #{idx}
                </span>
                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white shadow"
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end border-t border-white/10 pt-3.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center justify-center rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
