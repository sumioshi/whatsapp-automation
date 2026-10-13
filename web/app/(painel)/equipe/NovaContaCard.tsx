"use client";

import { useState } from "react";
import { Button, Card, Field, Icone, Input } from "@/app/components/ui";
import type { RodarComando } from "./tipos";

/** Formulário de conta nova. Senha vazia faz o servidor gerar uma; ela aparece uma vez, no topo da tela. */
export function NovaContaCard({
  carregando,
  podeCancelar,
  rodar,
  aoCancelar,
  aoCriar,
}: {
  carregando: boolean;
  podeCancelar: boolean;
  rodar: RodarComando;
  aoCancelar: () => void;
  aoCriar: (login: string, senhaGerada?: string) => void;
}) {
  const [login, setLogin] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    const r = await rodar({ acao: "criar", login: login.trim(), nome: nome.trim(), senha });
    setEnviando(false);
    if (!r) return;
    const criado = login.trim();
    setLogin("");
    setNome("");
    setSenha("");
    aoCriar(criado, r.senhaGerada);
  }

  const pronto = login.trim() !== "" && nome.trim() !== "";

  return (
    <form onSubmit={(e) => void criar(e)} aria-labelledby="nova-conta-titulo">
      <Card
        id="nova-conta"
        titulo="Nova conta"
        icone={<Icone nome="user-plus" />}
        rodape={
          <>
            <span className="min-w-0 truncate">A pessoa entra pelo mesmo link e cai no atendimento.</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {podeCancelar && (
                <Button variant="ghost" size="sm" onClick={aoCancelar}>
                  Cancelar
                </Button>
              )}
              <Button type="submit" size="sm" variant={pronto ? "primary" : "subtle"} loading={enviando} disabled={carregando}>
                Criar conta
              </Button>
            </div>
          </>
        }
      >
        <p className="max-w-[64ch] text-[13.5px] leading-relaxed text-fg-dim">
          Cada pessoa da equipe tem login e senha próprios e só enxerga as conversas que você liberar, sem notas, contrato nem
          copiloto. O que ela envia sai como você, passando pelos mesmos bloqueios de texto.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 max-[860px]:grid-cols-1">
          <Field label="Login" htmlFor="nova-login" hint="De 2 a 32 letras minúsculas, números, ponto, hífen ou _.">
            <Input
              id="nova-login"
              value={login}
              onChange={(e) => setLogin(e.target.value.toLowerCase())}
              placeholder="ana"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="font-mono"
            />
          </Field>
          <Field label="Nome" htmlFor="nova-nome" hint="Como aparece nas mensagens que a pessoa enviar.">
            <Input id="nova-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ana Souza" autoComplete="off" required />
          </Field>
          <Field label="Senha" htmlFor="nova-senha" hint="Deixe vazio para gerar uma senha forte. Se digitar, use pelo menos 8 caracteres.">
            <Input id="nova-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
      </Card>
    </form>
  );
}
