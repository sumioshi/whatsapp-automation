"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/app/components/ui";
import type { LinksMap, LinkTipo } from "@/lib/links";

export const dynamic = "force-dynamic";

interface ChatOpt {
  slug: string;
  name: string;
  messageCount: number;
  tipo: "dm" | "grupo";
}

interface Data {
  links: LinksMap;
  chats: ChatOpt[];
}

const TIPOS: LinkTipo[] = ["projeto", "grupo", "dm"];

const EMPTY = { slug: "", repoPath: "", cliente: "", tipo: "projeto" as LinkTipo, notas: "" };

export default function LinksPage() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/links", { cache: "no-store" });
    setData((await res.json()) as Data);
  }

  useEffect(() => {
    load().catch(() => setData({ links: {}, chats: [] }));
  }, []);

  const chatName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of data?.chats ?? []) map.set(c.slug, c.name);
    return map;
  }, [data]);

  // Ao escolher um chat, sugere tipo (dm/grupo) e — se vazio — o cliente.
  function onPickChat(slug: string) {
    const chat = data?.chats.find((c) => c.slug === slug);
    setForm((f) => ({
      ...f,
      slug,
      tipo: chat ? chat.tipo : f.tipo,
      cliente: f.cliente || (chat?.name ?? ""),
    }));
  }

  function editLink(slug: string, entry: Data["links"][string]) {
    setForm({
      slug,
      repoPath: entry.repoPath,
      cliente: entry.cliente,
      tipo: entry.tipo,
      notas: entry.notas,
    });
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (saving) return;
    if (!form.slug || !form.repoPath.trim()) {
      setError("Escolha um chat e informe o caminho do repositório.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await res.json()) as { links?: LinksMap; error?: string };
      if (!res.ok) throw new Error(body.error ?? "falha ao salvar");
      await load();
      setForm({ ...EMPTY });
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    } finally {
      setSaving(false);
    }
  }

  async function remove(slug: string) {
    await fetch(`/api/links?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    await load();
  }

  const links = Object.entries(data?.links ?? {});

  return (
    <div className="flex-1 overflow-y-auto bg-bg px-6 py-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <header className="space-y-1">
          <h1 className="mono text-sm uppercase tracking-wider text-fg-faint">Links de projeto</h1>
          <p className="text-sm text-fg-dim">
            Amarra um repositório de cliente a um grupo ou DM. Grava o índice central
            aqui e o <span className="mono">.claude/whatsapp.json</span> + uma linha no{" "}
            <span className="mono">CLAUDE.md</span> do repo, pro Claude já saber o link ao abrir o projeto.
          </p>
        </header>

        {/* Form */}
        <Card className="space-y-3">
          <Field label="Conversa (grupo ou DM)">
            <Select value={form.slug} onChange={(e) => onPickChat(e.target.value)}>
              <option value="">Selecione…</option>
              {(data?.chats ?? []).map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name} {c.tipo === "dm" ? "· DM" : ""} ({c.messageCount})
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Caminho do repositório"
            hint="Caminho absoluto, ex.: /Users/voce/projetos/cliente-x"
          >
            <Input
              value={form.repoPath}
              onChange={(e) => setForm((f) => ({ ...f, repoPath: e.target.value }))}
              placeholder="/Users/…/cliente-x"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cliente">
              <Input
                value={form.cliente}
                onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
                placeholder="Nome do cliente"
              />
            </Field>
            <Field label="Tipo">
              <Select
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as LinkTipo }))}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Notas" error={error ?? undefined}>
            <Textarea
              value={form.notas}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              rows={2}
              placeholder="Contexto curto do projeto…"
            />
          </Field>

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={!form.slug || !form.repoPath.trim()} loading={saving}>
              {saving ? "Salvando…" : "Salvar link"}
            </Button>
            {form.slug && (
              <button
                type="button"
                onClick={() => { setForm({ ...EMPTY }); setError(null); }}
                className="mono text-xs text-fg-dim transition-colors hover:text-fg"
              >
                limpar
              </button>
            )}
          </div>
        </Card>

        {/* Lista */}
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {data === null ? (
            <li className="mono p-3 text-sm text-fg-dim">Carregando…</li>
          ) : links.length === 0 ? (
            <li className="mono p-3 text-sm text-fg-dim">Nenhum link ainda.</li>
          ) : (
            links.map(([slug, entry]) => (
              <li key={slug} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-fg">{chatName.get(slug) ?? slug}</span>
                    <Badge variant={entry.tipo === "dm" ? "info" : "neutral"}>{entry.tipo}</Badge>
                  </div>
                  <div className="mono truncate text-[11px] text-fg-dim">{entry.repoPath}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => editLink(slug, entry)}
                    className="mono text-xs text-fg-dim transition-colors hover:text-fg"
                  >
                    editar
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(slug)}
                    className="mono text-xs text-fg-dim transition-colors hover:text-danger"
                  >
                    excluir
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
