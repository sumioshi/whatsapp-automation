'use client';

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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/20 bg-[#161826] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            <div>
              <h2 className="text-sm font-semibold text-white">Visual do Seu Personagem</h2>
              <p className="text-[11px] text-white/60">
                Escolha a roupa e paleta do seu avatar no escritório
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Preview do Personagem Atual */}
        <div className="my-4 flex items-center justify-center gap-4 rounded-xl border border-white/10 bg-[#1c1f30] p-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-[#131522]">
            <CharSprite charIndex={currentPalette} size={40} />
          </div>
          <div>
            <span className="text-[11px] font-medium text-blue-400">PALETA ATIVA #{currentPalette}</span>
            <h3 className="text-sm font-bold text-white">
              {PALETTE_NAMES[currentPalette] ?? `Estilo #${currentPalette}`}
            </h3>
            <span className="text-[10px] text-white/60">Controle pelo teclado: WASD ou Setas</span>
          </div>
        </div>

        {/* Grade de Seleção de Paletas */}
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: PALETTE_COUNT }).map((_, idx) => {
            const isSelected = idx === currentPalette;
            const nome = PALETTE_NAMES[idx] ?? `Visual #${idx}`;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectPalette(idx)}
                title={nome}
                className={`group relative flex flex-col items-center justify-center rounded-xl border p-2 transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500/20 shadow-md ring-2 ring-blue-500/40'
                    : 'border-white/10 bg-[#1e2133] hover:border-white/30 hover:bg-[#25293d]'
                }`}
              >
                <CharSprite charIndex={idx} size={28} />
                <span className="mt-1 text-[9px] font-mono text-white/60 group-hover:text-white">
                  #{idx}
                </span>
                {isSelected && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-blue-500"
          >
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
