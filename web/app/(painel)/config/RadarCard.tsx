"use client";

import { useEffect, useState } from "react";
import { mensagemDe, pedirJson, useCarregar } from "@/app/components/pedirJson";
import { haQuanto } from "@/app/components/tempo";
import { Card, Field, Icone, Input, Toggle } from "@/app/components/ui";
import { instanteLongo } from "@/lib/formatar-data";
import { lerMinutos } from "@/lib/minutos";
import { CampoMinutos, Carregando, FalhaAoCarregar, RodapeSalvar, useSalvar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

interface ConfigRadar {
  ativo?: boolean;
  dataCorte?: string | null;
  prazoMinimoMin?: number;
  digestCooldownMin?: number;
}

interface Radar {
  config?: ConfigRadar;
  status?: { ultimaExecucao?: string | null; pendencias?: unknown[] } | null;
}

/** O servidor recusa acima de 7 dias. */
const MAX_MIN = 10080;

interface Campos {
  dataCorte: string;
  prazo: string;
  cooldown: string;
}

function camposDe(c: ConfigRadar | undefined): Campos {
  return {
    dataCorte: c?.dataCorte ?? "",
    prazo: String(c?.prazoMinimoMin ?? 120),
    cooldown: String(c?.digestCooldownMin ?? 120),
  };
}

/** Radar de sem-resposta: liga/desliga na hora; data de corte e prazos pelo Salvar. */
export function RadarCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar } = useCarregar<Radar>("/api/radar");
  const [ativo, setAtivo] = useState(false);
  const [mudandoAtivo, setMudandoAtivo] = useState(false);
  const [erroAtivo, setErroAtivo] = useState<string | null>(null);
  const [salvos, setSalvos] = useState<Campos>(camposDe(undefined));
  const [campos, setCampos] = useState<Campos>(camposDe(undefined));
  const [invalidos, setInvalidos] = useState<{ prazo?: string; cooldown?: string }>({});
  const salvar = useSalvar();

  useEffect(() => {
    if (!dados) return;
    setAtivo(Boolean(dados.config?.ativo));
    setSalvos(camposDe(dados.config));
    setCampos(camposDe(dados.config));
  }, [dados]);

  useEffect(() => {
    if (dados) aoResumir("radar", { texto: ativo ? "ligado" : "desligado", tom: ativo ? "ok" : undefined });
  }, [aoResumir, ativo, dados]);

  async function alternar(v: boolean) {
    setAtivo(v);
    setMudandoAtivo(true);
    setErroAtivo(null);
    try {
      await pedirJson("/api/radar", { corpo: { ativo: v } });
    } catch (e) {
      setAtivo(!v);
      setErroAtivo(mensagemDe(e));
    } finally {
      setMudandoAtivo(false);
    }
  }

  async function aoSalvar() {
    const prazo = lerMinutos(campos.prazo, { max: MAX_MIN });
    const cooldown = lerMinutos(campos.cooldown, { max: MAX_MIN });
    setInvalidos({ prazo: prazo.ok ? undefined : prazo.erro, cooldown: cooldown.ok ? undefined : cooldown.erro });
    if (!prazo.ok || !cooldown.ok) return;
    const ok = await salvar.rodar(() =>
      pedirJson("/api/radar", {
        corpo: { ativo, dataCorte: campos.dataCorte || null, prazoMinimoMin: prazo.valor, digestCooldownMin: cooldown.valor },
      }),
    );
    if (ok) {
      const novos = { dataCorte: campos.dataCorte, prazo: String(prazo.valor), cooldown: String(cooldown.valor) };
      setSalvos(novos);
      setCampos(novos);
    }
  }

  const mudar = (k: keyof Campos) => (v: string) => {
    setCampos((c) => ({ ...c, [k]: v }));
    if (k !== "dataCorte") setInvalidos((i) => ({ ...i, [k]: undefined }));
  };

  const alterado = campos.dataCorte !== salvos.dataCorte || campos.prazo !== salvos.prazo || campos.cooldown !== salvos.cooldown;
  const ultima = dados?.status?.ultimaExecucao ?? null;
  const pendentes = dados?.status?.pendencias?.length;
  const info = !dados ? null : ultima ? (
    <span title={instanteLongo(ultima)}>
      Última varredura {haQuanto(ultima)}
      {pendentes !== undefined && (
        <>
          {" · "}
          <span className="font-mono tabular-nums">{pendentes}</span> esperando
        </>
      )}
    </span>
  ) : (
    "Ainda não varreu"
  );

  return (
    <Card
      id="radar"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Radar de sem-resposta"
      icone={<Icone nome="bell" />}
      acoes={
        dados ? (
          <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] font-medium text-fg-dim">
            {ativo ? "Ligado" : "Desligado"}
            <Toggle checked={ativo} onChange={(v) => void alternar(v)} disabled={mudandoAtivo} aria-label="Radar de sem-resposta" />
          </label>
        ) : undefined
      }
      rodape={
        dados ? <RodapeSalvar info={info} estado={salvar.estado} erro={salvar.erro} alterado={alterado} aoSalvar={() => void aoSalvar()} /> : undefined
      }
    >
      {erro ? (
        <FalhaAoCarregar erro={erro} aoTentar={() => void recarregar()} />
      ) : !dados ? (
        <Carregando linhas={3} />
      ) : (
        <>
          <p className="max-w-[72ch] text-[13.5px] leading-relaxed text-fg-dim">
            Avisa no seu próprio chat do WhatsApp e marca o cliente em Clientes quando alguém fica sem resposta além do prazo.
            Conversas paradas antes da data de corte ficam de fora.
          </p>
          {erroAtivo && <p className="mt-2 text-[12.5px] text-danger">Não deu para mudar o radar: {erroAtivo}</p>}
          <div className="mt-4 grid grid-cols-3 gap-4 max-[860px]:grid-cols-1">
            <Field label="Considerar a partir de" htmlFor="radar-corte" hint="Sem data, entram todas as conversas.">
              <Input id="radar-corte" type="date" value={campos.dataCorte} onChange={(e) => mudar("dataCorte")(e.target.value)} className="font-mono tabular-nums" />
            </Field>
            <Field label="Cobrar depois de" htmlFor="radar-prazo" error={invalidos.prazo} hint="Sem resposta por esse tempo vira aviso.">
              <CampoMinutos id="radar-prazo" valor={campos.prazo} aoMudar={mudar("prazo")} invalido={Boolean(invalidos.prazo)} />
            </Field>
            <Field label="Silêncio entre avisos" htmlFor="radar-cooldown" error={invalidos.cooldown} hint="Tempo mínimo entre dois avisos no seu chat.">
              <CampoMinutos id="radar-cooldown" valor={campos.cooldown} aoMudar={mudar("cooldown")} invalido={Boolean(invalidos.cooldown)} />
            </Field>
          </div>
        </>
      )}
    </Card>
  );
}
