"use client";

import { useEffect, useRef, useState } from "react";
import { Button, IconButton } from "../ui";

/* Composer do chat: campo de resposta, anexos (imagem/vídeo/áudio/doc) e envio.
   Extraído do Timeline — dono de TUDO que monta uma mensagem de saída. */

function kindOf(file: File): "image" | "video" | "audio" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

export function Composer({
  groupJid,
  onSent,
  draft,
}: {
  groupJid: string | null;
  onSent: () => void;
  /** Rascunho injetado pelo copiloto. `nonce` muda a cada envio pra reaplicar o mesmo texto. */
  draft?: { text: string; nonce: number } | null;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ file: File; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Copiloto manda um rascunho → preenche o composer (nunca envia) e foca pro operador revisar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reaplica só quando o nonce muda
  useEffect(() => {
    if (draft?.text) {
      setText(draft.text);
      taRef.current?.focus();
    }
  }, [draft?.nonce]);

  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file, url: URL.createObjectURL(file) };
    });
  }

  function clearPending() {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  // Revoga o ObjectURL da imagem colada ao trocar/desmontar (evita leak de memória).
  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.url);
    };
  }, [pendingImage]);

  // Enter / botão Enviar: manda a imagem colada (legenda = texto) se houver, senão texto.
  async function submit() {
    if (pendingImage) {
      const file = pendingImage.file;
      clearPending();
      await sendFile(file);
      return;
    }
    send();
  }

  async function send() {
    const body = text.trim();
    if (!body || !groupJid || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid: groupJid, text: body }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "falha no envio");
      setText("");
      // Atualiza assim que o coletor registrar a própria mensagem.
      setTimeout(onSent, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    } finally {
      setSending(false);
    }
  }

  async function sendFile(file: File) {
    if (!groupJid || sending) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("jid", groupJid);
      form.set("kind", kindOf(file));
      form.set("file", file);
      if (text.trim()) form.set("caption", text.trim());
      const res = await fetch("/api/send-media", { method: "POST", body: form });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "falha no envio");
      setText("");
      setTimeout(onSent, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-line bg-surface px-4 py-3">
      {error && <p className="mono mb-1.5 text-xs text-danger">{error}</p>}
      {pendingImage && (
        <div className="pop-in mb-2 inline-flex items-center gap-2 rounded-control border border-line bg-surface-2 p-1.5 pr-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pendingImage.url} alt="" className="h-10 w-10 rounded object-cover" />
          <span className="mono text-[11px] text-fg-dim">imagem colada</span>
          <button
            type="button"
            onClick={clearPending}
            aria-label="Remover imagem"
            className="mono text-xs text-fg-faint hover:text-danger"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) sendFile(f);
            e.target.value = "";
          }}
        />
        <IconButton
          title="Anexar arquivo (a legenda usa o texto escrito)"
          onClick={() => fileRef.current?.click()}
          disabled={!groupJid || sending}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-label="Anexar"
            role="img"
          >
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </IconButton>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={groupJid ? "Responder…  (Enter envia · Ctrl+V cola imagem)" : "Sem grupo para responder"}
          disabled={!groupJid || sending}
          className="focus-ring max-h-32 min-h-[40px] flex-1 resize-none rounded-control border border-line bg-surface-2 px-3 py-2.5 text-sm text-fg placeholder:text-fg-faint disabled:opacity-60"
        />
        <Button
          onClick={submit}
          loading={sending}
          disabled={!groupJid || (!text.trim() && !pendingImage)}
          className="h-10"
        >
          {sending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
    </div>
  );
}

