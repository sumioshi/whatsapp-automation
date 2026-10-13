import type { LinkEntry, LinksMap, LinkTipo } from "@/lib/links";

export interface ChatOpcao {
  slug: string;
  name: string;
  messageCount: number;
  tipo: "dm" | "grupo";
}

export type ModoAgente = "off" | "issue" | "pr";
export type Executor = "claude" | "copilot";

export interface DadosLinks {
  links: LinksMap;
  chats: ChatOpcao[];
  agente: Record<string, ModoAgente>;
  executor: Record<string, Executor>;
}

export interface FormLink {
  slug: string;
  repoPath: string;
  cliente: string;
  tipo: LinkTipo;
  notas: string;
  github: string;
}

export const FORM_VAZIO: FormLink = { slug: "", repoPath: "", cliente: "", tipo: "projeto", notas: "", github: "" };

export const ROTULO_TIPO: Record<LinkTipo, string> = { projeto: "Projeto", grupo: "Grupo", dm: "DM" };

export type { LinkEntry, LinkTipo };
