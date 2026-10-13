"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input } from "@/app/components/ui";
import { caminhoInterno } from "@/lib/equipe/destino-login";
import { mascararEmail, textoDoErro } from "@/lib/login-tela";

const ROTULO = "mb-1.5 block text-[13px] font-medium text-fg-dim";
const CAMPO = "h-10 text-[14px]";
const ALTERNATIVA =
  "focus-ring flex h-10 w-full items-center justify-center gap-2.5 rounded-control border border-line-2 bg-surface text-[14px] font-medium text-fg transition-colors hover:bg-elevated";
const LINK = "rounded-[4px] text-[13px] font-medium text-accent hover:underline disabled:text-fg-mute disabled:no-underline";
const ESPERA_REENVIO_S = 30;

type Modo = "inicio" | "email" | "codigo";

export interface LoginFormProps {
  googleAtivo: boolean;
  codigoAtivo: boolean;
  /** Frase do erro com que a volta do Google caiu aqui (?erro=). */
  erroInicial: string | null;
}

function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

function IconeEmail() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function Alerta({ texto }: { texto: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-control bg-danger-bg px-3 py-2.5 text-[13px] leading-snug text-danger">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="mt-px shrink-0" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5v.01" />
      </svg>
      {texto}
    </p>
  );
}

async function postar(url: string, corpo: unknown): Promise<{ ok: boolean; destino?: string; error?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const data = (await res.json().catch(() => null)) as { destino?: string; error?: string } | null;
  return { ok: res.ok, destino: data?.destino, error: data?.error };
}

export function LoginForm({ googleAtivo, codigoAtivo, erroInicial }: LoginFormProps) {
  // Só caminhos internos: evita open redirect via ?next=.
  const next = caminhoInterno(useSearchParams().get("next"));
  const [modo, setModo] = useState<Modo>("inicio");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [reenvioEm, setReenvioEm] = useState(0);
  const [erro, setErro] = useState<string | null>(erroInicial);
  const [enviando, setEnviando] = useState(false);

  // Contagem do "Reenviar código": um tique por segundo enquanto houver espera.
  useEffect(() => {
    if (reenvioEm <= 0) return;
    const t = setTimeout(() => setReenvioEm((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [reenvioEm]);

  function irPara(m: Modo) {
    setErro(null);
    setModo(m);
  }

  /** Entrou: navegação completa, para o documento já chegar com o cookie novo e o progresso nativo aparecer. */
  function entrar(destino: string | undefined) {
    window.location.assign(destino ?? next);
  }

  async function comSenha(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await postar("/api/login", { user, pass, next });
      if (r.ok) return entrar(r.destino); // mantém "Entrando…" até a página trocar
      setErro(textoDoErro(r.error));
    } catch {
      setErro("Sem conexão com o painel. Confira a internet e tente de novo.");
    }
    setEnviando(false);
  }

  async function pedirCodigo(e?: React.FormEvent) {
    e?.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await postar("/api/login/codigo", { email });
      if (r.ok) {
        setCodigo("");
        setReenvioEm(ESPERA_REENVIO_S);
        setModo("codigo");
      } else setErro(textoDoErro(r.error));
    } catch {
      setErro("Sem conexão com o painel. Confira a internet e tente de novo.");
    }
    setEnviando(false);
  }

  async function conferir(valor: string) {
    setErro(null);
    setEnviando(true);
    try {
      const r = await postar("/api/login/codigo/verificar", { email, codigo: valor, next });
      if (r.ok) return entrar(r.destino);
      setErro(textoDoErro(r.error));
      setCodigo("");
    } catch {
      setErro("Sem conexão com o painel. Confira a internet e tente de novo.");
    }
    setEnviando(false);
  }

  const conferirCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  if (modo === "email") {
    return (
      <form onSubmit={pedirCodigo} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className={ROTULO}>
            E-mail
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className={CAMPO}
          />
        </div>
        {erro && <Alerta texto={erro} />}
        <Button type="submit" loading={enviando} className="h-10 w-full text-[14px]">
          {enviando ? "Enviando…" : "Enviar código"}
        </Button>
        <button type="button" onClick={() => irPara("inicio")} className={`${LINK} self-center`}>
          Voltar
        </button>
      </form>
    );
  }

  if (modo === "codigo") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void conferir(codigo);
        }}
        className="flex flex-col gap-4"
      >
        <p className="text-[13.5px] leading-snug text-fg-dim">
          Se esse e-mail tiver acesso, mandamos um código para{" "}
          <b className="font-medium text-fg">{mascararEmail(email.trim().toLowerCase())}</b>. Ele vale por 10 minutos.
        </p>
        <div>
          <label htmlFor="codigo" className={ROTULO}>
            Código
          </label>
          <Input
            id="codigo"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={codigo}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCodigo(v);
              // Seis dígitos digitados ou colados: entra sem precisar do botão.
              if (v.length === 6 && !enviando) void conferir(v);
            }}
            required
            autoFocus
            className="h-12 text-center font-mono text-[22px] tracking-[0.35em]"
          />
        </div>
        {erro && <Alerta texto={erro} />}
        <Button type="submit" loading={enviando} disabled={codigo.length !== 6} className="h-10 w-full text-[14px]">
          {enviando ? "Entrando…" : "Entrar"}
        </Button>
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => irPara("email")} className={LINK}>
            Trocar e-mail
          </button>
          <button type="button" onClick={() => void pedirCodigo()} disabled={reenvioEm > 0 || enviando} className={LINK}>
            {reenvioEm > 0 ? (
              <>
                Reenviar em <span className="font-mono tabular-nums">{reenvioEm}s</span>
              </>
            ) : (
              "Reenviar código"
            )}
          </button>
        </div>
      </form>
    );
  }

  const alternativas = googleAtivo || codigoAtivo;
  return (
    <div className="flex flex-col gap-4">
      {alternativas && (
        <div className="flex flex-col gap-2.5">
          {googleAtivo && (
            <a href={`/api/login/google?next=${encodeURIComponent(next)}`} className={ALTERNATIVA}>
              <LogoGoogle />
              Entrar com Google
            </a>
          )}
          {codigoAtivo && (
            <button type="button" onClick={() => irPara("email")} className={ALTERNATIVA}>
              <IconeEmail />
              Receber código por e-mail
            </button>
          )}
        </div>
      )}
      {alternativas && (
        <div className="flex items-center gap-3 text-[12.5px] text-fg-faint" aria-hidden>
          <span className="h-px flex-1 bg-line" />
          ou com usuário e senha
          <span className="h-px flex-1 bg-line" />
        </div>
      )}

      <form onSubmit={comSenha} method="post" className="flex flex-col gap-4">
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
            autoFocus={!alternativas}
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

        {erro && <Alerta texto={erro} />}

        <Button type="submit" loading={enviando} className="mt-1 h-10 w-full text-[14px]">
          {enviando ? "Entrando…" : "Entrar"}
        </Button>

        <p className="text-center text-[12.5px] text-fg-faint">A sessão fica salva por 30 dias neste navegador.</p>
      </form>
    </div>
  );
}
