"use client";

import { useEffect, useState } from "react";

/** Antes da conexão: os passos de configuração (sem credencial) ou o botão de conectar. */
export function ConectarGoogle({ configurado, aviso }: { configurado: boolean; aviso: string | null }) {
  const [origem, setOrigem] = useState("");
  useEffect(() => setOrigem(window.location.origin), []);

  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-5">
        <h2 className="mb-1 font-medium text-fg">Agenda do Google</h2>
        {aviso && <p className="mb-3 text-sm text-danger">{aviso}</p>}
        {configurado ? (
          <>
            <p className="mb-4 text-sm text-fg-dim">
              Conecte sua conta Google uma vez. O painel passa a mostrar e editar suas agendas, e a IA
              consegue marcar reuniões.
            </p>
            <a
              href="/api/google/conectar"
              className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-accent-ink"
            >
              Conectar Google
            </a>
          </>
        ) : (
          <ol className="list-decimal space-y-2 pl-5 text-sm text-fg-dim">
            <li>
              No Google Cloud, crie um projeto e ative a <b className="text-fg">Google Calendar API</b>.
            </li>
            <li>
              Na tela de consentimento OAuth (Externo), publique o app como <b className="text-fg">Em produção</b>.
              Em “Teste” a conexão cai a cada 7 dias.
            </li>
            <li>
              Crie um <b className="text-fg">ID do cliente OAuth</b> do tipo Aplicativo da Web com este URI de
              redirecionamento: <code className="mono break-all text-fg">{origem}/api/google/callback</code>
            </li>
            <li>
              No serviço da hospedagem, defina <code className="mono text-fg">GOOGLE_CLIENT_ID</code> e{" "}
              <code className="mono text-fg">GOOGLE_CLIENT_SECRET</code> e publique de novo.
            </li>
          </ol>
        )}
      </div>
    </div>
  );
}
