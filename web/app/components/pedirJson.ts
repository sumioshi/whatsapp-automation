"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * fetch + JSON das telas do painel. Falta de rede e resposta fora do 2xx viram Error com a
 * mensagem do servidor (`{ error }`), para a tela dizer o que houve em vez de engolir a falha.
 */
export async function pedirJson<T>(url: string, opcoes: { metodo?: "GET" | "POST" | "DELETE"; corpo?: unknown } = {}): Promise<T> {
  const temCorpo = opcoes.corpo !== undefined;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opcoes.metodo ?? (temCorpo ? "POST" : "GET"),
      cache: "no-store",
      headers: temCorpo ? { "Content-Type": "application/json" } : undefined,
      body: temCorpo ? JSON.stringify(opcoes.corpo) : undefined,
    });
  } catch {
    throw new Error("Sem conexão com o painel. Tente de novo.");
  }
  const corpo = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const msg =
      corpo && typeof corpo === "object" && "error" in corpo && typeof corpo.error === "string" ? corpo.error : null;
    throw new Error(msg ?? `O painel respondeu ${res.status}.`);
  }
  return corpo as T;
}

export function mensagemDe(e: unknown): string {
  return e instanceof Error ? e.message : "Algo deu errado.";
}

/**
 * Carrega ao montar, com erro e recarga; `definir` troca os dados depois de uma ação. A fonte é
 * uma URL de JSON ou uma função estável (definida fora do componente) que junta mais de uma rota.
 */
export function useCarregar<T>(fonte: string | (() => Promise<T>)) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setErro(null);
    try {
      setDados(await (typeof fonte === "string" ? pedirJson<T>(fonte) : fonte()));
    } catch (e) {
      setErro(mensagemDe(e));
    }
  }, [fonte]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { dados, erro, recarregar, definir: setDados };
}
