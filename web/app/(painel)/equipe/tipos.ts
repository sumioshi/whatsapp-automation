import type { Comando } from "@/lib/equipe/admin";
import type { UsuarioPublico } from "@/lib/equipe/usuarios";

export interface ChatLiberavel {
  slug: string;
  nome: string;
  etiquetas: string[];
}

export interface DadosEquipe {
  usuarios: UsuarioPublico[];
  chats: ChatLiberavel[];
}

/** Roda um comando da tela de equipe; devolve a resposta ou null se falhou (o erro já foi avisado). */
export type RodarComando = (c: Comando) => Promise<{ senhaGerada?: string } | null>;

export type { Comando, UsuarioPublico };
