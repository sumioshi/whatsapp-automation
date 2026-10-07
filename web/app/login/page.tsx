"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Input } from "@/app/components/ui";
import { caminhoInterno } from "@/lib/equipe/destino-login";

/** Só caminhos internos — evita open redirect via ?next=. */
function safeNext(raw: string | null): string {
  return caminhoInterno(raw);
}

function LoginForm() {
  const next = safeNext(useSearchParams().get("next"));
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, pass, next }),
      });
      if (res.ok) {
        // Navegação completa (não client-side): o navegador mostra o progresso
        // nativo enquanto a home renderiza no servidor — sem "clique morto" —
        // e o documento já chega com o cookie novo pro proxy.
        const data = (await res.json().catch(() => null)) as { destino?: string } | null;
        window.location.assign(data?.destino ?? next);
        return; // mantém "Entrando…" até a página trocar
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setErro(data?.error ?? "não foi possível entrar");
      setEnviando(false);
    } catch {
      setErro("falha de rede — tenta de novo");
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      method="post"
      className="w-full max-w-sm rounded-card border border-line bg-surface p-6"
    >
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-fg">WhatsApp Painel</h1>
        <p className="mt-1 text-sm text-fg-dim">Entre para acessar as conversas.</p>
      </div>

      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-medium text-fg-dim">Usuário</span>
        <Input
          name="username"
          autoComplete="username"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          required
          autoFocus
          className="w-full"
        />
      </label>

      <label className="mb-4 block">
        <span className="mb-1 block text-xs font-medium text-fg-dim">Senha</span>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          required
          className="w-full"
        />
      </label>

      {erro && (
        <p className="mb-3 text-sm text-danger" role="alert">
          {erro}
        </p>
      )}

      <Button type="submit" disabled={enviando} className="w-full">
        {enviando ? "Entrando…" : "Entrar"}
      </Button>

      <p className="mono mt-4 text-center text-[10px] text-fg-faint">
        sessão válida por 30 dias neste navegador
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
