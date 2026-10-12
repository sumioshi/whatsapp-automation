import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { configDoEnvio } from "@/lib/equipe/codigo-email";
import { emailsDoDono } from "@/lib/equipe/login-externo";
import { configOAuth } from "@/lib/google/oauth";
import { erroDaVolta, saudacaoDoMomento } from "@/lib/login-tela";
import { LoginForm } from "./LoginForm";
import { VitrineBalcao } from "./VitrineBalcao";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar no Balcão" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  // No servidor e pela hora de Brasília: a saudação não muda na hidratação.
  const saudacao = saudacaoDoMomento(new Date());
  // Google e código só aparecem configurados (e-mail do dono e o serviço de cada um).
  const temDono = emailsDoDono().length > 0;
  const googleAtivo = temDono && configOAuth() !== null;
  const codigoAtivo = temDono && configDoEnvio() !== null;
  return (
    <main className="grid min-h-dvh bg-surface max-[860px]:grid-rows-[auto_1fr] min-[861px]:grid-cols-[minmax(400px,1fr)_minmax(0,1.45fr)]">
      <section className="flex min-h-dvh flex-col px-8 py-6 max-[860px]:min-h-0 max-[860px]:px-5 max-[860px]:pb-8 max-[860px]:pt-5">
        <header className="flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-ink">
              <span className="h-[3px] w-3.5 rounded-sm bg-on-ink shadow-[0_-6px_0_-0.5px_color-mix(in_srgb,var(--color-on-ink)_55%,transparent)]" />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Balcão</span>
          </span>
          <ThemeToggle compacto />
        </header>

        <div className="surgir mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12 max-[860px]:flex-none max-[860px]:justify-start max-[860px]:pb-10 max-[860px]:pt-8">
          <h1 className="text-balance font-title text-[36px] font-medium leading-[1.05] tracking-[-0.02em] text-fg max-[860px]:text-[30px]">
            {saudacao}
          </h1>
          <p className="mt-2.5 text-[14.5px] text-fg-dim">
            {googleAtivo || codigoAtivo ? "Como você quer entrar?" : "Entre com o seu usuário e a sua senha."}
          </p>
          <div className="mt-8">
            <Suspense>
              <LoginForm googleAtivo={googleAtivo} codigoAtivo={codigoAtivo} erroInicial={erroDaVolta(erro)} />
            </Suspense>
          </div>
        </div>

        <footer className="mt-auto text-[12.5px] text-fg-faint">
          <Link href="/privacidade" className="rounded-[4px] transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            Política de privacidade
          </Link>
        </footer>
      </section>

      <VitrineBalcao className="m-3 rounded-[18px] max-[860px]:order-first max-[860px]:mb-0 max-[860px]:h-[188px] max-[860px]:rounded-[14px]" />
    </main>
  );
}
