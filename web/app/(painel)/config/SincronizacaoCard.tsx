"use client";

import { useEffect, useState } from "react";
import { pedirJson, useCarregar } from "@/app/components/pedirJson";
import { haQuanto } from "@/app/components/tempo";
import { Card, Field, Icone } from "@/app/components/ui";
import { instanteLongo } from "@/lib/formatar-data";
import { lerMinutos } from "@/lib/minutos";
import { CampoMinutos, Carregando, FalhaAoCarregar, RodapeSalvar, useSalvar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

interface Reconciliador {
  intervaloMin?: number;
  status?: { ultimaExecucao?: string | null } | null;
}

/** Intervalo do reconciliador: confere nomes de grupo e busca buracos de histórico de tempos em tempos. */
export function SincronizacaoCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar } = useCarregar<Reconciliador>("/api/reconciler");
  const [salvo, setSalvo] = useState("15");
  const [intervalo, setIntervalo] = useState("15");
  const [invalido, setInvalido] = useState<string | null>(null);
  const salvar = useSalvar();

  useEffect(() => {
    if (!dados) return;
    const v = String(dados.intervaloMin ?? 15);
    setSalvo(v);
    setIntervalo(v);
  }, [dados]);

  useEffect(() => {
    aoResumir("sincronizacao", { texto: `${salvo} min` });
  }, [aoResumir, salvo]);

  async function aoSalvar() {
    const lido = lerMinutos(intervalo);
    if (!lido.ok) {
      setInvalido(lido.erro);
      return;
    }
    setInvalido(null);
    const ok = await salvar.rodar(() => pedirJson("/api/reconciler", { corpo: { intervaloMin: lido.valor } }));
    if (ok) {
      setSalvo(String(lido.valor));
      setIntervalo(String(lido.valor));
    }
  }

  const ultima = dados?.status?.ultimaExecucao ?? null;
  const info = !dados ? null : ultima ? (
    <span title={instanteLongo(ultima)}>Última execução {haQuanto(ultima)}</span>
  ) : (
    "Ainda não rodou"
  );

  return (
    <Card
      id="sincronizacao"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Sincronização automática"
      icone={<Icone nome="refresh" />}
      rodape={
        dados ? (
          <RodapeSalvar info={info} estado={salvar.estado} erro={salvar.erro} alterado={intervalo !== salvo} aoSalvar={() => void aoSalvar()} />
        ) : undefined
      }
    >
      {erro ? (
        <FalhaAoCarregar erro={erro} aoTentar={() => void recarregar()} />
      ) : !dados ? (
        <Carregando linhas={2} />
      ) : (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          <p className="max-w-[56ch] min-w-0 flex-1 basis-[320px] text-[13.5px] leading-relaxed text-fg-dim">
            De tempos em tempos o coletor confere os nomes dos grupos e busca buracos no histórico, direto do WhatsApp. Para
            rodar fora de hora, use o botão de sincronizar em Clientes.
          </p>
          <Field label="Intervalo" htmlFor="sync-intervalo" error={invalido ?? undefined} className="w-44">
            <CampoMinutos
              id="sync-intervalo"
              valor={intervalo}
              aoMudar={(v) => {
                setIntervalo(v);
                setInvalido(null);
              }}
              invalido={Boolean(invalido)}
            />
          </Field>
        </div>
      )}
    </Card>
  );
}
