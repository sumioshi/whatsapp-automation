"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CorpoPagina, Grade12 } from "@/app/components/ui";
import { secaoAtiva } from "@/lib/secao-ativa";
import { ConexaoCard } from "./ConexaoCard";
import { GruposCard } from "./GruposCard";
import { NavSecoes } from "./NavSecoes";
import { RadarCard } from "./RadarCard";
import { type IdSecao, type Resumo, SECOES } from "./secoes";
import { SincronizacaoCard } from "./SincronizacaoCard";
import { TimeCard } from "./TimeCard";
import { TranscricaoCard } from "./TranscricaoCard";

/** Configurações: navegação por seção à esquerda (faixa no topo no celular) e um card por seção. */
export function ConfigView() {
  const rolagem = useRef<HTMLDivElement>(null);
  const [ativa, setAtiva] = useState<IdSecao>("conexao");
  const [resumos, setResumos] = useState<Partial<Record<IdSecao, Resumo>>>({});

  const resumir = useCallback((id: IdSecao, r: Resumo) => {
    setResumos((prev) => (prev[id]?.texto === r.texto && prev[id]?.tom === r.tom ? prev : { ...prev, [id]: r }));
  }, []);

  // A seção marcada acompanha a rolagem (e a mudança de tamanho dos cards ao carregar).
  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const base = el.getBoundingClientRect().top - el.scrollTop;
      const posicoes = SECOES.flatMap((s) => {
        const alvo = document.getElementById(s.id);
        return alvo ? [{ id: s.id, topo: alvo.getBoundingClientRect().top - base }] : [];
      });
      const id = secaoAtiva(posicoes, { topo: el.scrollTop, altura: el.clientHeight, total: el.scrollHeight });
      if (id) setAtiva(id as IdSecao);
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    agendar();
    el.addEventListener("scroll", agendar, { passive: true });
    window.addEventListener("resize", agendar);
    return () => {
      el.removeEventListener("scroll", agendar);
      window.removeEventListener("resize", agendar);
      cancelAnimationFrame(quadro);
    };
  }, []);

  // Link direto para uma seção (/config#radar).
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (SECOES.some((s) => s.id === id)) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  const irPara = useCallback((id: IdSecao) => {
    const alvo = document.getElementById(id);
    if (!alvo) return;
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    alvo.scrollIntoView({ behavior: reduzir ? "auto" : "smooth", block: "start" });
    // O foco vai junto, como num link de âncora comum: o Tab seguinte continua dentro da seção.
    if (!alvo.hasAttribute("tabindex")) alvo.setAttribute("tabindex", "-1");
    alvo.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${id}`);
    setAtiva(id);
  }, []);

  return (
    <CorpoPagina ref={rolagem}>
      <div className="flex flex-col gap-4 min-[1021px]:grid min-[1021px]:max-w-[1160px] min-[1021px]:grid-cols-[208px_minmax(0,1fr)] min-[1021px]:items-start min-[1021px]:gap-8">
        <NavSecoes ativa={ativa} resumos={resumos} aoIr={irPara} />
        <Grade12>
          <ConexaoCard aoResumir={resumir} />
          <SincronizacaoCard aoResumir={resumir} />
          <GruposCard aoResumir={resumir} />
          <RadarCard aoResumir={resumir} />
          <TranscricaoCard aoResumir={resumir} />
          <TimeCard aoResumir={resumir} />
        </Grade12>
      </div>
    </CorpoPagina>
  );
}
