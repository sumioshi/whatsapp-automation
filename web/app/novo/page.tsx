"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Field, Input, Textarea } from "@/app/components/ui";
import type { GroupWithTags } from "@/lib/config";
import { slugify } from "@/lib/slug";
import type { ContactEntry } from "@/app/api/contacts/route";

export const dynamic = "force-dynamic";

type Mode = "group" | "contact";

function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Sanitiza para só dígitos — remove espaços, +, traços, parênteses. */
function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Deriva o slug de uma DM a partir do número (dígitos puros).
 * Espelha a lógica de directSlug() em src/whatsapp/mapper.ts:
 *   directSlug(jid) = `dm-${slugify(jid.split("@")[0])}`
 * Como o número é só dígitos, slugify não transforma nada — é `dm-<número>`.
 */
function dmSlug(number: string): string {
  const digits = digitsOnly(number);
  return `dm-${slugify(digits)}`;
}

export default function NovoPage() {
  const router = useRouter();

  // ── Modo ─────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("group");

  // Abre direto no modo Contato quando vier ?modo=contato (link "Contatos" da sidebar).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("modo") === "contato") {
      setMode("contact");
    }
  }, []);

  // ── Modo grupo ────────────────────────────────────────────────────────
  const [groups, setGroups] = useState<GroupWithTags[] | null>(null);
  const [groupQuery, setGroupQuery] = useState("");
  const [selGroup, setSelGroup] = useState<GroupWithTags | null>(null);

  // ── Modo contato ──────────────────────────────────────────────────────
  const [contacts, setContacts] = useState<ContactEntry[] | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [selContact, setSelContact] = useState<ContactEntry | null>(null);
  /** Número digitado manualmente (fallback quando contato não está na lista). */
  const [manualNumber, setManualNumber] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  /** true = usuário escolheu digitar manualmente. */
  const [useManual, setUseManual] = useState(false);

  // ── Compartilhado ─────────────────────────────────────────────────────
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Carregamento de grupos ────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/groups", { cache: "no-store" })
      .then((r) => r.json())
      .then((g: GroupWithTags[]) => setGroups(g))
      .catch(() => setGroups([]));
  }, []);

  // ── Carregamento de contatos ──────────────────────────────────────────
  useEffect(() => {
    if (mode === "contact" && contacts === null) {
      fetch("/api/contacts", { cache: "no-store" })
        .then((r) => r.json())
        .then((c: ContactEntry[]) => setContacts(c))
        .catch(() => setContacts([]));
    }
  }, [mode, contacts]);

  // ── Filtros ───────────────────────────────────────────────────────────
  const filteredGroups = useMemo(() => {
    const q = normalize(groupQuery.trim());
    return (groups ?? []).filter((g) => !q || normalize(g.name).includes(q)).slice(0, 300);
  }, [groups, groupQuery]);

  const filteredContacts = useMemo(() => {
    const q = normalize(contactQuery.trim());
    return (contacts ?? [])
      .filter((c) => !q || normalize(c.name).includes(q) || c.number.includes(q))
      .slice(0, 200);
  }, [contacts, contactQuery]);

  // ── Resetar ao trocar de modo ─────────────────────────────────────────
  function switchMode(m: Mode) {
    setMode(m);
    setSelGroup(null);
    setSelContact(null);
    setManualNumber("");
    setManualError(null);
    setUseManual(false);
    setText("");
    setError(null);
    setGroupQuery("");
    setContactQuery("");
  }

  // ── Envio ─────────────────────────────────────────────────────────────
  async function send() {
    if (sending) return;
    if (!text.trim()) return;

    let jid: string;
    let redirectSlug: string;

    if (mode === "group") {
      if (!selGroup) return;
      jid = selGroup.id;
      redirectSlug = slugify(selGroup.name);
    } else {
      // Modo contato
      if (useManual || !selContact) {
        const digits = digitsOnly(manualNumber);
        if (!digits || digits.length < 8) {
          setManualError("Número inválido — informe ao menos 8 dígitos com DDI.");
          return;
        }
        jid = `${digits}@s.whatsapp.net`;
        redirectSlug = dmSlug(digits);
      } else {
        // Contato sem telefone real resolvido (id é só LID) — não dá pra mandar DM.
        if (!selContact.jid) {
          setError(
            "Esse contato só tem ID de privacidade (sem telefone). Use o número manual.",
          );
          return;
        }
        jid = selContact.jid;
        redirectSlug = dmSlug(selContact.number);
      }
    }

    setSending(true);
    setError(null);
    setManualError(null);

    try {
      // Grupo: garante watch antes de enviar.
      if (mode === "group" && selGroup && !selGroup.watch) {
        await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selGroup.id, watch: true }),
        });
        await new Promise((r) => setTimeout(r, 800));
      }

      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jid, text: text.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "falha no envio");

      // Aguarda o coletor gravar a mensagem enviada.
      await new Promise((r) => setTimeout(r, 1200));
      router.push(`/g/${redirectSlug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
      setSending(false);
    }
  }

  const canSend =
    text.trim().length > 0 &&
    (mode === "group"
      ? selGroup !== null
      : useManual
        ? digitsOnly(manualNumber).length >= 8
        : selContact !== null);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto bg-bg px-6 py-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <h1 className="mono text-sm uppercase tracking-wider text-fg-faint">Nova conversa</h1>

        {/* Seletor de modo */}
        <div className="inline-flex rounded-control border border-line bg-surface-2 p-0.5">
          {(["group", "contact"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={[
                "mono rounded-[calc(var(--radius-control)-2px)] px-4 py-1.5 text-xs uppercase tracking-wide transition-colors",
                mode === m
                  ? "bg-surface text-fg [box-shadow:var(--shadow-pressable)]"
                  : "text-fg-dim hover:text-fg",
              ].join(" ")}
            >
              {m === "group" ? "Grupo" : "Contato"}
            </button>
          ))}
        </div>

        {/* ── MODO GRUPO ─────────────────────────────────────────────── */}
        {mode === "group" && (
          <>
            <p className="text-sm text-fg-dim">
              Escolha um grupo (mesmo sem histórico) e envie a primeira mensagem.
              Ele passa a ser monitorado e a conversa abre em seguida.
            </p>

            {!selGroup ? (
              <>
                <Input
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  placeholder="Buscar grupo…"
                />
                <ul className="max-h-[480px] divide-y divide-line overflow-y-auto rounded-card border border-line">
                  {groups === null ? (
                    <li className="mono p-3 text-sm text-fg-dim">Carregando…</li>
                  ) : (
                    filteredGroups.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          onClick={() => setSelGroup(g)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-2"
                        >
                          <span className="truncate text-fg">{g.name}</span>
                          {g.watch && <Badge variant="accent">monitorado</Badge>}
                        </button>
                      </li>
                    ))
                  )}
                  {groups !== null && filteredGroups.length === 0 && (
                    <li className="mono p-3 text-sm text-fg-dim">
                      Nenhum grupo bate com a busca.
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-fg">{selGroup.name}</div>
                  <button
                    type="button"
                    onClick={() => setSelGroup(null)}
                    className="mono text-xs text-fg-dim transition-colors hover:text-fg"
                  >
                    trocar
                  </button>
                </div>
                <Field error={error ?? undefined}>
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    placeholder="Primeira mensagem…"
                  />
                </Field>
                <Button onClick={send} disabled={!canSend} loading={sending}>
                  {sending ? "Enviando…" : "Iniciar conversa"}
                </Button>
              </Card>
            )}
          </>
        )}

        {/* ── MODO CONTATO ───────────────────────────────────────────── */}
        {mode === "contact" && (
          <>
            <p className="text-sm text-fg-dim">
              Escolha um contato com quem já houve troca de mensagens, ou digite
              o número manualmente (com DDI, ex.: 5511999999999).
            </p>

            {/* Etapa 1: escolher destino */}
            {!selContact && !useManual ? (
              <>
                <Input
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  placeholder="Buscar por nome ou número…"
                />
                <ul className="max-h-[400px] divide-y divide-line overflow-y-auto rounded-card border border-line">
                  {contacts === null ? (
                    <li className="mono p-3 text-sm text-fg-dim">Carregando…</li>
                  ) : (
                    filteredContacts.map((c) => (
                      <li key={c.number}>
                        <button
                          type="button"
                          onClick={() => setSelContact(c)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-2"
                        >
                          <div className="min-w-0">
                            <span className="block truncate text-fg">{c.name}</span>
                            <span className="mono block text-[11px] text-fg-dim">
                              {c.dmReady ? `+${c.number}` : "sem telefone"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {!c.dmReady && <Badge variant="neutral">sem DM</Badge>}
                            {c.role === "team" && <Badge variant="info">time</Badge>}
                          </div>
                        </button>
                      </li>
                    ))
                  )}
                  {contacts !== null && filteredContacts.length === 0 && (
                    <li className="mono p-3 text-sm text-fg-dim">
                      Nenhum contato encontrado.
                    </li>
                  )}
                </ul>

                {/* Opção de digitar número manualmente */}
                <button
                  type="button"
                  onClick={() => setUseManual(true)}
                  className="mono text-xs text-fg-dim underline-offset-2 hover:text-fg hover:underline"
                >
                  Digitar número manualmente
                </button>
              </>
            ) : useManual ? (
              /* Etapa 1b: número manual */
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="mono text-xs uppercase tracking-wide text-fg-faint">
                    Número manual
                  </span>
                  <button
                    type="button"
                    onClick={() => { setUseManual(false); setManualNumber(""); setManualError(null); }}
                    className="mono text-xs text-fg-dim transition-colors hover:text-fg"
                  >
                    voltar
                  </button>
                </div>
                <Field
                  label="Número (com DDI)"
                  hint="Ex.: 5511999999999 — só dígitos, sem espaços ou símbolos."
                  error={manualError ?? undefined}
                >
                  <Input
                    value={manualNumber}
                    onChange={(e) => { setManualNumber(e.target.value); setManualError(null); }}
                    placeholder="5511999999999"
                    inputMode="numeric"
                  />
                </Field>
                <Field error={error ?? undefined}>
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    placeholder="Mensagem…"
                  />
                </Field>
                <Button onClick={send} disabled={!canSend} loading={sending}>
                  {sending ? "Enviando…" : "Enviar mensagem"}
                </Button>
              </Card>
            ) : (
              /* Etapa 2: contato selecionado */
              <Card className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-fg">{selContact!.name}</div>
                    <div className="mono text-[11px] text-fg-dim">+{selContact!.number}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelContact(null)}
                    className="mono text-xs text-fg-dim transition-colors hover:text-fg"
                  >
                    trocar
                  </button>
                </div>
                <Field error={error ?? undefined}>
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    placeholder="Mensagem…"
                  />
                </Field>
                <Button onClick={send} disabled={!canSend} loading={sending}>
                  {sending ? "Enviando…" : "Enviar mensagem"}
                </Button>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
