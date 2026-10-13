"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icone } from "../caixa/icones";
import { checarSessao, useRotas } from "../RotasPainel";
import { Button, IconButton } from "../ui";

/* Compositor da conversa: rascunho da IA (quando há), campo de resposta,
   anexos (imagem/vídeo/áudio/doc, também colando imagem) e envio. */

function kindOf(file: File): "image" | "video" | "audio" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

const ALTURA_MAX = 160;

export function Composer({
  slug,
  groupJid,
  nome,
  onSent,
  draft,
  rascunho,
  onPedirRascunho,
}: {
  slug: string;
  groupJid: string | null;
  /** Nome da conversa, para o rótulo do campo. */
  nome: string;
  onSent: () => void;
  /** Texto vindo do copiloto do painel. `nonce` muda a cada pedido para reaplicar o mesmo texto. */
  draft?: { text: string; nonce: number } | null;
  /** Card "Rascunho da IA" (recebe o "usar texto" que preenche o campo). */
  rascunho?: (usar: (texto: string) => void) => ReactNode;
  /** Botão da IA no compositor; ausente, o botão não aparece. */
  onPedirRascunho?: () => void;
}) {
  const rotas = useRotas();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ file: File; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const semDestino = !rotas.enviarTexto(slug, groupJid, "x");

  // O campo cresce com o texto até um teto; passou disso, rola.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mede de novo a cada texto
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ALTURA_MAX, ta.scrollHeight)}px`;
  }, [text]);

  function usar(texto: string) {
    setText(texto);
    requestAnimationFrame(() => taRef.current?.focus());
  }

  // Copiloto do painel manda um rascunho: preenche o campo (nunca envia) e foca para revisar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reaplica só quando o nonce muda
  useEffect(() => {
    if (draft?.text) usar(draft.text);
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

  // Revoga o ObjectURL da imagem colada ao trocar ou desmontar.
  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.url);
    };
  }, [pendingImage]);

  // Enter ou Enviar: manda a imagem colada (legenda = texto) se houver, senão o texto.
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
    const pedido = body ? rotas.enviarTexto(slug, groupJid, body) : null;
    if (!pedido || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = checarSessao(
        await fetch(pedido.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pedido.body),
        }),
        rotas,
      );
      // Corpo que não é JSON (proxy, página de erro) não vira erro de parse na tela.
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
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
    const alvo = rotas.enviarMidia(slug, groupJid);
    if (!alvo || sending) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      for (const [k, v] of Object.entries(alvo.campos)) form.set(k, v);
      form.set("kind", kindOf(file));
      form.set("file", file);
      if (text.trim()) form.set("caption", text.trim());
      const res = checarSessao(await fetch(alvo.url, { method: "POST", body: form }), rotas);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
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
    <div className="shrink-0 bg-bg px-7 pb-5 max-[860px]:px-3 max-[860px]:pb-3">
      <div className="mx-auto max-w-[720px] rounded-[12px] border border-line-2 bg-surface transition-[border-color,box-shadow] focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]">
        {rascunho?.(usar)}
        {pendingImage && (
          <div className="pop-in mx-2.5 mt-2.5 inline-flex items-center gap-2 rounded-control border border-line bg-surface-2 p-1.5 pr-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingImage.url} alt="" className="h-10 w-10 rounded object-cover" />
            <span className="text-[12px] text-fg-dim">Imagem colada, sai com o texto como legenda</span>
            <button
              type="button"
              onClick={clearPending}
              aria-label="Remover imagem"
              className="grid h-6 w-6 place-items-center rounded-[6px] text-fg-faint hover:bg-elevated hover:text-danger"
            >
              <Icone nome="fechar" tamanho={13} />
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mx-3.5 mt-2.5 text-[12.5px] text-danger">
            Não saiu: {error}
          </p>
        )}
        <label className="sr-only" htmlFor={`resposta-${slug}`}>
          Mensagem para {nome}
        </label>
        <textarea
          id={`resposta-${slug}`}
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={semDestino ? "Ainda não há mensagem nesta conversa para responder" : "Responder como você…"}
          disabled={semDestino || sending}
          className="block max-h-40 min-h-[46px] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[14px] leading-[1.5] text-fg outline-none placeholder:text-fg-mute disabled:opacity-60 max-[860px]:text-[16px]"
        />
        <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
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
            size="sm"
            title="Anexar arquivo (o texto escrito vai como legenda)"
            aria-label="Anexar arquivo"
            onClick={() => fileRef.current?.click()}
            disabled={semDestino || sending}
            className="max-[860px]:h-10 max-[860px]:w-10"
          >
            <Icone nome="clipe" />
          </IconButton>
          {onPedirRascunho && (
            <IconButton
              size="sm"
              title="Pedir um rascunho à IA"
              aria-label="Pedir um rascunho à IA"
              onClick={onPedirRascunho}
              className="max-[860px]:h-10 max-[860px]:w-10"
            >
              <Icone nome="ia" />
            </IconButton>
          )}
          <span className="flex-1" />
          <span className="mr-2.5 text-[12px] text-fg-faint max-[860px]:hidden">Enter envia · ⇧ Enter quebra linha</span>
          <Button
            size="sm"
            onClick={submit}
            loading={sending}
            disabled={semDestino || (!text.trim() && !pendingImage)}
            className="max-[860px]:h-10"
          >
            {!sending && <Icone nome="enviar" tamanho={15} />}
            {sending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
