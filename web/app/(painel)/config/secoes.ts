import type { NomeIcone } from "@/app/components/ui";

export type IdSecao = "conexao" | "sincronizacao" | "grupos" | "radar" | "transcricao" | "time";

/** Estado curto de uma seção, mostrado ao lado do nome na navegação ("21/201", "ligado"). */
export interface Resumo {
  texto: string;
  tom?: "ok" | "danger" | "accent";
}

export type AoResumir = (id: IdSecao, resumo: Resumo) => void;

/** Ordem da página. A navegação agrupa por `grupo`, na ordem em que os grupos aparecem. */
export const SECOES: Array<{ id: IdSecao; rotulo: string; grupo: string; icone: NomeIcone }> = [
  { id: "conexao", rotulo: "Conexão", grupo: "WhatsApp", icone: "phone" },
  { id: "sincronizacao", rotulo: "Sincronização", grupo: "WhatsApp", icone: "refresh" },
  { id: "grupos", rotulo: "Grupos", grupo: "WhatsApp", icone: "users" },
  { id: "radar", rotulo: "Radar", grupo: "Avisos e áudio", icone: "bell" },
  { id: "transcricao", rotulo: "Transcrição", grupo: "Avisos e áudio", icone: "mic" },
  { id: "time", rotulo: "Meu time", grupo: "Pessoas", icone: "user" },
];

/** Margem de rolagem dos cards: abaixo da barra parada no topo (e da faixa de seções no celular). */
export const ANCORA_CARD = "scroll-mt-8 max-[1020px]:scroll-mt-20";
