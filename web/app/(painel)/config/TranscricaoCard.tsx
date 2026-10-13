"use client";

import { useEffect, useState } from "react";
import { pedirJson, useCarregar } from "@/app/components/pedirJson";
import { Card, Field, Icone, Input, Select } from "@/app/components/ui";
import type { PanelSettings } from "@/lib/config";
import { Carregando, FalhaAoCarregar, RodapeSalvar, useSalvar } from "./partes";
import { ANCORA_CARD, type AoResumir } from "./secoes";

const MODELOS = [
  { value: "mlx-community/whisper-large-v3-mlx", label: "large-v3 (máxima precisão)" },
  { value: "mlx-community/whisper-large-v3-turbo", label: "large-v3-turbo (mais rápido)" },
];

/** Modelo e idioma da transcrição de áudio no Mac (MLX). */
export function TranscricaoCard({ aoResumir }: { aoResumir: AoResumir }) {
  const { dados, erro, recarregar } = useCarregar<PanelSettings>("/api/settings");
  const [salvos, setSalvos] = useState<PanelSettings | null>(null);
  const [campos, setCampos] = useState<PanelSettings | null>(null);
  const [idiomaVazio, setIdiomaVazio] = useState(false);
  const salvar = useSalvar();

  useEffect(() => {
    if (!dados) return;
    setSalvos(dados);
    setCampos(dados);
  }, [dados]);

  useEffect(() => {
    if (salvos) aoResumir("transcricao", { texto: salvos.language });
  }, [aoResumir, salvos]);

  async function aoSalvar() {
    if (!campos) return;
    const language = campos.language.trim();
    if (!language) {
      setIdiomaVazio(true);
      return;
    }
    await salvar.rodar(async () => {
      const novos = await pedirJson<PanelSettings>("/api/settings", { corpo: { model: campos.model, language } });
      setSalvos(novos);
      setCampos(novos);
    });
  }

  // Modelo definido por variável de ambiente e fora da lista continua escolhível.
  const modelos = campos && !MODELOS.some((m) => m.value === campos.model) ? [...MODELOS, { value: campos.model, label: campos.model }] : MODELOS;
  const alterado = Boolean(campos && salvos && (campos.model !== salvos.model || campos.language !== salvos.language));

  return (
    <Card
      id="transcricao"
      largura="inteiro"
      className={ANCORA_CARD}
      titulo="Transcrição"
      icone={<Icone nome="mic" />}
      rodape={
        campos ? (
          <RodapeSalvar info="Vale para os próximos áudios." estado={salvar.estado} erro={salvar.erro} alterado={alterado} aoSalvar={() => void aoSalvar()} />
        ) : undefined
      }
    >
      {erro ? (
        <FalhaAoCarregar erro={erro} aoTentar={() => void recarregar()} />
      ) : !campos ? (
        <Carregando linhas={2} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-4 max-[860px]:grid-cols-1">
          <Field label="Modelo (MLX, local)" htmlFor="transcricao-modelo">
            <Select id="transcricao-modelo" value={campos.model} onChange={(e) => setCampos({ ...campos, model: e.target.value })}>
              {modelos.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Idioma" htmlFor="transcricao-idioma" error={idiomaVazio ? "Informe o idioma." : undefined} hint="Código, como pt ou en.">
            <Input
              id="transcricao-idioma"
              value={campos.language}
              onChange={(e) => {
                setCampos({ ...campos, language: e.target.value });
                setIdiomaVazio(false);
              }}
              aria-invalid={idiomaVazio || undefined}
              className="font-mono"
            />
          </Field>
        </div>
      )}
    </Card>
  );
}
