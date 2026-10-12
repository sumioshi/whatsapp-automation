"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/app/components/ui";
import { caminhoInterno } from "@/lib/equipe/destino-login";
import { textoDoErro } from "@/lib/login-tela";

const ROTULO = "mb-1.5 block text-[13px] font-medium text-fg-dim";
const CAMPO = "h-10 text-[14px]";

export function LoginForm() {
  // Só caminhos internos: evita open redirect via ?next=.
  const next = caminhoInterno(useSearchParams().get("next"));
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
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
      setErro(textoDoErro(data?.error));
      setEnviando(false);
    } catch {
      setErro("Sem conexão com o painel. Confira a internet e tente de novo.");
      setEnviando(false);
    }
  }

  const conferirCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  return (
    <form onSubmit={onSubmit} method="post" className="flex flex-col gap-4">
      <div>
        <label htmlFor="usuario" className={ROTULO}>
          Usuário
        </label>
        <Input
          id="usuario"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={user}
          onChange={(e) => setUser(e.target.value)}
          required
          autoFocus
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor="senha" className={ROTULO}>
          Senha
        </label>
        <div className="relative">
          <Input
            id="senha"
            name="password"
            type={verSenha ? "text" : "password"}
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={conferirCapsLock}
            onKeyUp={conferirCapsLock}
            onBlur={() => setCapsLock(false)}
            aria-describedby={capsLock ? "aviso-caps" : undefined}
            required
            className={`${CAMPO} pr-11`}
          />
          <button
            type="button"
            onClick={() => setVerSenha((v) => !v)}
            aria-label={verSenha ? "Esconder a senha" : "Mostrar a senha"}
            aria-pressed={verSenha}
            className="focus-ring absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-[6px] text-fg-faint transition-colors hover:bg-elevated hover:text-fg"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              {verSenha && <path d="M4 4l16 16" />}
            </svg>
          </button>
        </div>
        {capsLock && (
          <p id="aviso-caps" className="mt-1.5 text-[12.5px] text-warn">
            Caps Lock está ligado.
          </p>
        )}
      </div>

      {erro && (
        <p role="alert" className="flex items-start gap-2 rounded-control bg-danger-bg px-3 py-2.5 text-[13px] leading-snug text-danger">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="mt-px shrink-0" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.5v.01" />
          </svg>
          {erro}
        </p>
      )}

      <Button type="submit" loading={enviando} className="mt-1 h-10 w-full text-[14px]">
        {enviando ? "Entrando…" : "Entrar"}
      </Button>

      <p className="text-center text-[12.5px] text-fg-faint">A sessão fica salva por 30 dias neste navegador.</p>
    </form>
  );
}
