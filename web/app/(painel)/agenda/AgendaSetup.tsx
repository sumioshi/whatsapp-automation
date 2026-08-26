"use client";

import { useState } from "react";
import { Button, Input } from "@/app/components/ui";

/** Primeira configuração: pede o e-mail da agenda e grava via /api/agenda. */
export function AgendaSetup() {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendario: valor.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "falha ao salvar");
      window.location.reload();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro");
      setSalvando(false);
    }
  }

  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-5">
        <h2 className="mb-1 font-medium text-fg">Conectar sua agenda</h2>
        <p className="mb-4 text-sm text-fg-dim">
          Informe o e-mail da sua agenda do Google. O calendário aparece aqui
          usando a sessão Google deste navegador — agenda privada só é visível
          pra quem tem acesso.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="email"
            placeholder="voce@exemplo.com"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void salvar()}
          />
          <Button onClick={() => void salvar()} disabled={salvando || !valor.trim()}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
        {erro && <p className="mono mt-2 text-xs text-danger">{erro}</p>}
      </div>
    </div>
  );
}
