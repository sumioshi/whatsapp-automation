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
  onOpenOrca?: () => void;
  onClose: () => void;
}

export function QuickActionHud({
  cliente,
  palette,
  baiaIndex,
  onWalkTo,
  onOpenDrawer,
  onOpenOrca,
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

  const dmsPendentes = cliente.dmsAguardando ?? 0;
  const isDanger = Boolean(cliente.aguardando || dmsPendentes > 0);
  const isCritico = cliente.aguardando && (cliente.band === 'hot' || cliente.band === 'warm');

  return (
    <div
      role="region"
      aria-label={`Ações rápidas para ${cliente.nome}`}
      style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
      }}
      className="flex max-w-[94vw] items-center gap-2 rounded-2xl border border-white/15 bg-[#121420]/95 px-3 py-2 shadow-2xl backdrop-blur-md sm:gap-3 sm:px-4 sm:py-2.5"
    >
      {/* Sprite do NPC + Info Básica */}
      <div className="flex items-center gap-2.5 border-r border-white/10 pr-2.5 sm:pr-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#1c1f30]">
          <CharSprite charIndex={palette} size={28} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                isDanger ? 'animate-pulse bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-emerald-500'
              }`}
              aria-hidden="true"
            />
            <span className="truncate text-xs font-semibold text-white sm:text-[13px]">
              {cliente.nome}
            </span>
          </div>
          <span className="block truncate text-[10.5px] font-medium text-white/65">
            {baiaIndex > 0 ? `Baia #${baiaIndex}` : 'Lounge'} ·{' '}
            {cliente.aguardando
              ? `${isCritico ? 'Crítico' : 'Sem resposta'} (${cliente.waitingLabel ?? 'pendente'})`
              : dmsPendentes > 0
                ? `${dmsPendentes} DM sem resposta`
                : 'Em dia'}
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
          aria-label={`Abrir conversa de ${cliente.nome} no WhatsApp`}
          title="Abrir no WhatsApp"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 text-[11px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-[0.98] sm:text-xs"
        >
          <span aria-hidden="true">💬</span>
          <span className="hidden sm:inline">WhatsApp</span>
        </a>

        {/* Produção / Vercel */}
        {linkProd && (
          <a
            href={linkProd}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir app em produção (${linkProd})`}
            title="Abrir site/app em produção"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 active:scale-[0.98] sm:text-xs"
          >
            <span aria-hidden="true">🌐</span>
            <span className="hidden sm:inline">App Prod</span>
          </a>
        )}

        {/* GitHub */}
        {linkGithub && (
          <a
            href={linkGithub}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir repositório GitHub de ${cliente.nome}`}
            title="Abrir repositório no GitHub"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-2.5 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-[0.98] sm:text-xs"
          >
            <span aria-hidden="true">📦</span>
            <span className="hidden md:inline">GitHub</span>
          </a>
        )}

        {/* Copiar Dados */}
        <button
          type="button"
          onClick={handleCopiarDados}
          aria-label="Copiar resumo do projeto e contatos"
          title="Copiar resumo do projeto e contatos"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-2.5 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-[0.98] sm:text-xs"
        >
          <span aria-hidden="true">{copiado ? '✓' : '📋'}</span>
          <span className="hidden sm:inline">{copiado ? 'Copiado!' : 'Copiar'}</span>
        </button>

        {/* Ir até a mesa com seu personagem */}
        <button
          type="button"
          onClick={onWalkTo}
          aria-label={`Caminhar até a mesa de ${cliente.nome}`}
          title="Caminhar até a mesa do cliente"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-2.5 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-[0.98] sm:text-xs"
        >
          <span aria-hidden="true">🚶</span>
          <span className="hidden lg:inline">Ir à Mesa</span>
        </button>

        {/* Abrir Agente Orca */}
        {onOpenOrca && (
          <button
            type="button"
            onClick={onOpenOrca}
            aria-label={`Abrir agente Orca de ${cliente.nome}`}
            title="Abrir chat e terminal do Agente Orca deste projeto"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-2.5 text-[11px] font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 active:scale-[0.98] sm:text-xs"
          >
            <span aria-hidden="true">🐋</span>
            <span>Agente Orca</span>
          </button>
        )}

        {/* Abrir Ficha Completa */}
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label={`Abrir ficha lateral de ${cliente.nome}`}
          title="Abrir ficha e conversas completas na lateral"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-blue-500/45 bg-blue-500/20 px-2.5 text-[11px] font-semibold text-blue-200 transition-colors hover:bg-blue-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 active:scale-[0.98] sm:text-xs"
        >
          <span aria-hidden="true">📖</span>
          <span>Ficha</span>
        </button>

        {/* Fechar HUD */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar barra de ações rápidas (Esc)"
          title="Fechar barra rápida (Esc)"
          className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
