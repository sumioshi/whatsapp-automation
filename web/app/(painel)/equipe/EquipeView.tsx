"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { UsuarioPublico } from "@/lib/equipe/usuarios";
import { Button, Input, Select } from "@/app/components/ui";

interface Chat { slug: string; nome: string; etiquetas: string[] }
interface Dados { usuarios: UsuarioPublico[]; chats: Chat[] }

async function comando(body: Record<string, unknown>): Promise<{ ok?: boolean; error?: string; senhaGerada?: string }> {
  try {
    const res = await fetch("/api/equipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json().catch(() => ({ error: `falhou (${res.status})` }))) as {
      ok?: boolean;
      error?: string;
      senhaGerada?: string;
    };
  } catch {
    return { error: "sem conexão com o painel — tente de novo" };
  }
}

function quando(iso: string | null): string {
  if (!iso) return "nunca entrou";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function EquipeView() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [novo, setNovo] = useState({ login: "", nome: "", senha: "" });
  const [editando, setEditando] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<{ login: string; nome: string } | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [etiqueta, setEtiqueta] = useState("");

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/equipe", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setDados((await res.json()) as Dados);
    } catch {
      setErro("não consegui carregar a equipe — recarregue a página");
    }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function rodar(body: Record<string, unknown>, sucesso?: (r: { senhaGerada?: string }) => void) {
    setErro(null);
    setAviso(null);
    const r = await comando(body);
    if (!r.ok) { setErro(r.error ?? "falhou"); return; }
    sucesso?.(r);
    await carregar();
  }

  const etiquetas = useMemo(
    () => [...new Set((dados?.chats ?? []).flatMap((c) => c.etiquetas))].sort(),
    [dados],
  );
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (dados?.chats ?? []).filter(
      (c) => (!q || c.nome.toLowerCase().includes(q) || c.slug.includes(q)) && (!etiqueta || c.etiquetas.includes(etiqueta)),
    );
  }, [dados, busca, etiqueta]);

  function abrirChats(u: UsuarioPublico) {
    setEditando(u.login);
    setMarcados(new Set(u.chats));
  }
  function alternar(slug: string) {
    setMarcados((m) => { const n = new Set(m); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
  }
  function marcarVisiveis(valor: boolean) {
    setMarcados((m) => { const n = new Set(m); for (const c of visiveis) { if (valor) n.add(c.slug); else n.delete(c.slug); } return n; });
  }

  if (!dados) return <div className="p-6 text-sm text-fg-dim">{erro ?? "Carregando…"}</div>;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5 md:px-10">
      <h1 className="mb-1 font-medium text-fg">Equipe</h1>
      <p className="mb-5 text-sm text-fg-dim">
        Quem atende pelo seu WhatsApp. Cada pessoa só vê os chats marcados aqui.
      </p>
      {erro && <p className="mono mb-3 text-xs text-danger">{erro}</p>}
      {aviso && <p className="mb-3 rounded-control border border-accent/30 bg-accent/5 p-2.5 text-sm text-fg">{aviso}</p>}

      <form
        className="mb-6 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void rodar({ acao: "criar", ...novo }, (r) => {
            setAviso(r.senhaGerada ? `Conta criada. Senha de ${novo.login}: ${r.senhaGerada} — anote agora, ela não aparece de novo.` : "Conta criada.");
            setNovo({ login: "", nome: "", senha: "" });
          });
        }}
      >
        <Input className="w-44" placeholder="login (ex.: ana)" value={novo.login} onChange={(e) => setNovo({ ...novo, login: e.target.value })} required />
        <Input className="w-52" placeholder="nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required />
        <Input className="w-52" placeholder="senha (vazio = gerar)" type="password" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} />
        <Button type="submit">Criar conta</Button>
      </form>

      <div className="flex flex-col gap-3">
        {dados.usuarios.length === 0 && <p className="text-sm text-fg-faint">Nenhuma conta ainda.</p>}
        {dados.usuarios.map((u) => (
          <div key={u.login} className="rounded-card border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0">
                {renomeando?.login === u.login ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rodar({ acao: "editar", login: u.login, nome: renomeando.nome }, () => setRenomeando(null));
                    }}
                  >
                    <Input
                      className="w-52"
                      aria-label={`Nome de ${u.login}`}
                      value={renomeando.nome}
                      onChange={(e) => setRenomeando({ login: u.login, nome: e.target.value })}
                      required
                      autoFocus
                    />
                    <Button type="submit" size="sm">Salvar</Button>
                    <Button type="button" variant="subtle" size="sm" onClick={() => setRenomeando(null)}>Cancelar</Button>
                  </form>
                ) : (
                  <div className="font-medium text-fg">
                    {u.nome} <span className="mono text-xs text-fg-faint">@{u.login}</span>{" "}
                    <button
                      type="button"
                      className="mono text-[11px] text-fg-faint underline-offset-2 hover:text-fg hover:underline"
                      onClick={() => setRenomeando({ login: u.login, nome: u.nome })}
                    >
                      editar nome
                    </button>
                  </div>
                )}
                <div className="mono text-[11px] text-fg-faint">
                  {u.ativo ? "ativa" : "desativada"} · {u.chats.length} {u.chats.length === 1 ? "chat" : "chats"} · último acesso: {quando(u.ultimoAcesso)}
                </div>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="subtle" size="sm" onClick={() => abrirChats(u)}>Chats</Button>
                <Button variant="subtle" size="sm" onClick={() => {
                  if (!window.confirm(`Gerar nova senha para ${u.nome}? A senha atual deixa de valer e a sessão aberta cai.`)) return;
                  void rodar({ acao: "senha", login: u.login }, (r) => setAviso(`Nova senha de ${u.login}: ${r.senhaGerada} — anote agora.`));
                }}>Nova senha</Button>
                <Button variant="subtle" size="sm" onClick={() => void rodar({ acao: "ativo", login: u.login, ativo: !u.ativo })}>{u.ativo ? "Desativar" : "Ativar"}</Button>
                <Button variant="danger" size="sm" onClick={() => { if (window.confirm(`Apagar a conta de ${u.nome}?`)) void rodar({ acao: "apagar", login: u.login }); }}>Apagar</Button>
              </div>
            </div>

            {editando === u.login && (
              <div className="mt-4 border-t border-line pt-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Input className="w-56" placeholder="buscar chat" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  <Select className="w-auto" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}>
                    <option value="">todas as etiquetas</option>
                    {etiquetas.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                  <Button variant="subtle" size="sm" onClick={() => marcarVisiveis(true)}>Marcar visíveis</Button>
                  <Button variant="subtle" size="sm" onClick={() => marcarVisiveis(false)}>Desmarcar visíveis</Button>
                </div>
                <div className="max-h-80 overflow-y-auto rounded-control border border-line">
                  {visiveis.map((c) => (
                    <label key={c.slug} className="flex cursor-pointer items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0 hover:bg-surface-2">
                      <input type="checkbox" checked={marcados.has(c.slug)} onChange={() => alternar(c.slug)} />
                      <span className="truncate text-fg">{c.nome}</span>
                      <span className="mono ml-auto text-[10px] text-fg-faint">{c.etiquetas.join(", ")}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => void rodar({ acao: "chats", login: u.login, chats: [...marcados] }, () => { setEditando(null); setAviso("Chats salvos."); })}>
                    Salvar ({marcados.size})
                  </Button>
                  <Button variant="subtle" onClick={() => setEditando(null)}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
