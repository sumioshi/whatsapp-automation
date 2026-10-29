'use client';

import { useState } from 'react';
import type { ClienteEscritorio } from '@/lib/escritorio-estado';
import { CharSprite } from './CharSprite';

interface QuickActionHudProps {
  cliente: ClienteEscritorio;
  palette: number;
  baiaIndex: number;
  onWalkTo: () => void;
  onOpenDrawer: () => void;
  onClose: () => void;
}

export function QuickActionHud({
  cliente,
  palette,
  baiaIndex,
  onWalkTo,
  onOpenDrawer,
  onClose,
}: QuickActionHudProps) {
  const [copiado, setCopiado] = useState(false);

  // Link do WhatsApp
  const primeiroContatoComDm = cliente.contatosVinculados?.find((c) => c.dmSlug);
  const telefoneLimpo = primeiroContatoComDm?.dmSlug
    ? primeiroContatoComDm.dmSlug.replace(/^dm-/, '').replace(/\D/g, '')
    : null;
  const linkWhatsApp =
    telefoneLimpo && telefoneLimpo.length >= 8
      ? `https://wa.me/${telefoneLimpo}`
      : 'https://web.whatsapp.com/';

  // Link do GitHub / Repositório
  const linkGithub = cliente.github
    ? `https://github.com/${cliente.github}`
    : cliente.repoNome
      ? `https://github.com/<owner>/${cliente.repoNome}`
      : null;

  // Link de Produção / Web estimado
  const linkProd = cliente.repoNome ? `https://${cliente.repoNome}.vercel.app` : null;

  const handleCopiarDados = async () => {
    const dados = [
      `Projeto: ${cliente.nome}`,
      `Slug: ${cliente.slug}`,
      cliente.repoNome ? `Repo: ${cliente.repoNome}` : null,
      primeiroContatoComDm ? `Contato: ${primeiroContatoComDm.nome}` : null,
      cliente.contrato?.estado && cliente.contrato.estado !== 'sem'
        ? `Contrato: ${cliente.contrato.estado}`
        : null,
      cliente.contrato?.valorMensal
        ? `Valor: R$ ${cliente.contrato.valorMensal.toLocaleString('pt-BR')}/mês`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await navigator.clipboard.writeText(dados);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // fallback
    }
  };

  const isDanger = cliente.aguardando && (cliente.band === 'hot' || cliente.band === 'warm');

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
      }}
      className="flex max-w-[92vw] items-center gap-2 rounded-xl border border-white/15 bg-[#141624]/95 px-3 py-2 shadow-2xl backdrop-blur-md sm:gap-3 sm:px-4 sm:py-2.5"
    >
      {/* Sprite do NPC + Info Básica */}
      <div className="flex items-center gap-2 border-r border-white/10 pr-2.5 sm:pr-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#1e2030]">
          <CharSprite charIndex={palette} size={28} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                isDanger
                  ? 'animate-pulse bg-red-500'
                  : cliente.aguardando
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
            />
            <span className="truncate text-xs font-semibold text-white sm:text-sm">
              {cliente.nome}
            </span>
          </div>
          <span className="block truncate text-[10px] text-white/60">
            {baiaIndex > 0 ? `Baia #${baiaIndex}` : 'Lounge'} ·{' '}
            {cliente.aguardando ? `Aguardando (${cliente.waitingLabel ?? 'pendente'})` : 'Em dia'}
          </span>
        </div>
      </div>

      {/* Botões de Ação Rápida */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* WhatsApp */}
        <a
          href={linkWhatsApp}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir no WhatsApp"
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 sm:px-2.5 sm:text-xs"
        >
          <span>💬</span>
          <span className="hidden sm:inline">WhatsApp</span>
        </a>

        {/* Produção / Vercel */}
        {linkProd && (
          <a
            href={linkProd}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir site/app em produção"
            className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/25 sm:px-2.5 sm:text-xs"
          >
            <span>🌐</span>
            <span className="hidden sm:inline">App Prod</span>
          </a>
        )}

        {/* GitHub */}
        {linkGithub && (
          <a
            href={linkGithub}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir repositório no GitHub"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 sm:px-2.5 sm:text-xs"
          >
            <span>📦</span>
            <span className="hidden md:inline">GitHub</span>
          </a>
        )}

        {/* Copiar Dados */}
        <button
          type="button"
          onClick={handleCopiarDados}
          title="Copiar resumo do projeto e contatos"
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 sm:px-2.5 sm:text-xs"
        >
          <span>{copiado ? '✓' : '📋'}</span>
          <span className="hidden sm:inline">{copiado ? 'Copiado!' : 'Copiar'}</span>
        </button>

        {/* Ir até a mesa com seu personagem */}
        <button
          type="button"
          onClick={onWalkTo}
          title="Caminhar até a mesa do cliente"
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 sm:px-2.5 sm:text-xs"
        >
          <span>🚶</span>
          <span className="hidden lg:inline">Ir à Mesa</span>
        </button>

        {/* Abrir Ficha Completa */}
        <button
          type="button"
          onClick={onOpenDrawer}
          title="Abrir ficha e conversas completas na lateral"
          className="inline-flex items-center gap-1 rounded-lg border border-blue-500/40 bg-blue-500/20 px-2 py-1 text-[11px] font-medium text-blue-300 transition-colors hover:bg-blue-500/30 sm:px-2.5 sm:text-xs"
        >
          <span>📖</span>
          <span>Ficha</span>
        </button>

        {/* Fechar HUD */}
        <button
          type="button"
          onClick={onClose}
          className="ml-1 rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
          title="Fechar barra rápida"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
