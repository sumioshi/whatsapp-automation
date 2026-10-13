"use client";

import QRCode from "qrcode";
import { type ReactNode, useEffect, useState } from "react";
import { Badge, Card, Icone } from "@/app/components/ui";
import type { CollectorStatus } from "@/lib/config";
import { ANCORA_CARD, type AoResumir, type Resumo } from "./secoes";

type Conn = CollectorStatus["connection"];

/** Selo do cabeçalho, estado curto da navegação e tom de cada estado. */
const ESTADOS: Record<Conn, { selo: string; curto: string; badge: "ok" | "accent" | "danger" | "neutral"; tom?: Resumo["tom"] }> = {
  open: { selo: "Conectado", curto: "conectado", badge: "ok", tom: "ok" },
  connecting: { selo: "Conectando", curto: "conectando", badge: "accent", tom: "accent" },
  qr: { selo: "Aguardando o QR", curto: "QR", badge: "accent", tom: "accent" },
  close: { selo: "Desconectado", curto: "desconectado", badge: "danger", tom: "danger" },
  logged_out: { selo: "Sessão encerrada", curto: "sessão caiu", badge: "danger", tom: "danger" },
  unknown: { selo: "Sem estado", curto: "sem estado", badge: "neutral" },
  offline: { selo: "Coletor offline", curto: "offline", badge: "neutral" },
};

function explicacao(conn: Conn, status: CollectorStatus | null): ReactNode {
  switch (conn) {
    case "open": {
      const n = status?.watchedCount ?? 0;
      return (
        <>
          Monitorando <span className="font-mono tabular-nums text-fg">{n}</span> {n === 1 ? "grupo" : "grupos"}.
        </>
      );
    }
    case "connecting":
      return "Conectando ao WhatsApp…";
    case "close":
      return "A conexão caiu. Com o coletor rodando, ele tenta reconectar sozinho.";
    case "logged_out":
      return "A sessão foi encerrada no celular. Um QR novo aparece aqui em instantes para conectar de novo.";
    case "unknown":
      return "O coletor ainda não informou o estado da conexão.";
    case "offline":
      return (
        <>
          O coletor não está rodando. Inicie com{" "}
          <code className="rounded-tag bg-elevated px-1.5 py-0.5 font-mono text-[12.5px] text-fg">npm run dev</code> na raiz do
          projeto.
        </>
      );
    default:
      return null;
  }
}

/** Conexão do coletor com o WhatsApp: estado ao vivo (a cada 2,5 s) e o QR quando é preciso parear. */
export function ConexaoCard({ aoResumir }: { aoResumir: AoResumir }) {
  const [status, setStatus] = useState<CollectorStatus | null>(null);

  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const dados = (await res.json()) as CollectorStatus;
        if (vivo) setStatus(dados);
      } catch {
        /* coletor pode estar fora do ar: segue mostrando o último estado */
      }
    };
    void ler();
    const id = setInterval(ler, 2500);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, []);

  const conn = status?.connection ?? "offline";
  const estado = ESTADOS[conn];

  useEffect(() => {
    aoResumir("conexao", { texto: estado.curto, tom: estado.tom });
  }, [aoResumir, estado]);

  return (
    <Card
      id="conexao"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Conexão com o WhatsApp"
      icone={<Icone nome="phone" />}
      acoes={
        <Badge variant={estado.badge} dot>
          {estado.selo}
        </Badge>
      }
    >
      {conn === "qr" && status?.qr ? (
        <Pareamento qr={status.qr} />
      ) : (
        <p className="text-[13.5px] leading-relaxed text-fg-dim">{explicacao(conn, status)}</p>
      )}
    </Card>
  );
}

const PASSOS = [
  "No celular, abra o WhatsApp.",
  "Toque em Aparelhos conectados › Conectar um aparelho.",
  "Aponte a câmera para este código.",
];

function Pareamento({ qr }: { qr: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(qr, { width: 232, margin: 2 })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [qr]);

  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
      <div className="grid h-[232px] w-[232px] shrink-0 place-items-center overflow-hidden rounded-card border border-line bg-surface-2">
        {src ? (
          // biome-ignore lint/performance/noImgElement: data URL local, next/image não cabe
          <img src={src} alt="QR code para conectar o WhatsApp" width={232} height={232} />
        ) : (
          <span className="text-[12.5px] text-fg-faint">Gerando o QR…</span>
        )}
      </div>
      <div className="min-w-[220px] flex-1">
        <ol className="flex flex-col gap-3">
          {PASSOS.map((passo, i) => (
            <li key={passo} className="flex items-start gap-3 text-[13.5px] text-fg">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-elevated font-mono text-[12px] text-fg-dim">
                {i + 1}
              </span>
              <span className="pt-0.5">{passo}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 max-w-[52ch] text-[12.5px] leading-relaxed text-fg-faint">
          Use o celular do número que este painel atende. O código se renova sozinho; deixe esta tela aberta até aparecer
          Conectado.
        </p>
      </div>
    </div>
  );
}
