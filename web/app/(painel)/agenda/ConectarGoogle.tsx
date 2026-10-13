"use client";

import { useEffect, useState } from "react";
import { CabecalhoPagina, Card } from "@/app/components/ui";
import { IcCalendario } from "./icones";

/** Antes da conexão: os passos de configuração (sem credencial) ou o botão de conectar. */
export function ConectarGoogle({ configurado, aviso }: { configurado: boolean; aviso: string | null }) {
  const [origem, setOrigem] = useState("");
  useEffect(() => setOrigem(window.location.origin), []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CabecalhoPagina
        variante="barra"
        titulo="Agenda"
        subtitulo={configurado ? "Google Agenda desconectado" : "Google Agenda ainda não configurado"}
      />
      <div className="grid flex-1 place-items-center overflow-y-auto bg-bg p-8 max-[860px]:p-4">
        <Card
          titulo={configurado ? "Conecte o Google Agenda" : "Configure o Google Agenda"}
          icone={<IcCalendario />}
          className="w-full max-w-[480px]"
        >
          {aviso && (
            <p role="alert" className="mb-3 rounded-control bg-danger-bg px-3 py-2 text-[13px] text-danger">
              {aviso}
            </p>
          )}
          {configurado ? (
            <>
              <p className="mb-4 text-[14px] leading-relaxed text-fg-dim">
                Conecte sua conta Google uma vez. A semana com as suas agendas aparece aqui, dá para marcar e
                editar eventos, e a IA consegue marcar reuniões.
              </p>
              <a
                href="/api/google/conectar"
                className="inline-flex h-8 items-center gap-1.5 rounded-control border border-ink bg-ink px-3 text-[13px] font-medium text-on-ink transition-colors hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[860px]:h-10"
              >
                Conectar Google
              </a>
            </>
          ) : (
            <>
              <p className="mb-3 text-[14px] leading-relaxed text-fg-dim">
                A agenda usa a sua conta Google pelo servidor. Para ligar, falta criar o acesso no Google Cloud:
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-[13.5px] leading-relaxed text-fg-dim marker:font-mono marker:text-fg-faint">
                <li>
                  No Google Cloud, crie um projeto e ative a <b className="font-medium text-fg">Google Calendar API</b>.
                </li>
                <li>
                  Na tela de consentimento OAuth (Externo), publique o app como{" "}
                  <b className="font-medium text-fg">Em produção</b>. Em “Teste” a conexão cai a cada 7 dias.
                </li>
                <li>
                  Crie um <b className="font-medium text-fg">ID do cliente OAuth</b> do tipo Aplicativo da Web com este
                  URI de redirecionamento:{" "}
                  <code className="break-all rounded-[4px] bg-surface-2 px-1 font-mono text-[12.5px] text-fg">
                    {origem}/api/google/callback
                  </code>
                </li>
                <li>
                  No serviço da hospedagem, defina{" "}
                  <code className="rounded-[4px] bg-surface-2 px-1 font-mono text-[12.5px] text-fg">GOOGLE_CLIENT_ID</code> e{" "}
                  <code className="rounded-[4px] bg-surface-2 px-1 font-mono text-[12.5px] text-fg">GOOGLE_CLIENT_SECRET</code> e
                  publique de novo.
                </li>
              </ol>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
