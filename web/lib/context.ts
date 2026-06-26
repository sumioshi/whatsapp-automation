/*
 * Copyright 2026 Rodrigo Sumioshi
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  type Contacts,
  numberFromJid,
  resolveMentions,
  roleOf,
} from "./contacts";
import type { MessageView } from "./data";

/** Versão compacta de uma mensagem (com papel e menções resolvidas), pronta pra IA consumir. */
export type CompactMsg = {
  timestamp: string;
  /** Hora local de Brasília (BRT) já formatada — o `timestamp` é UTC (sufixo Z),
   * e ler UTC como se fosse local foi fonte de confusão (msg das 22h BRT lida
   * como "01h"). Este campo dá a hora certa pronta, sem a IA precisar converter. */
  hora_brt: string;
  de: string;
  papel: ReturnType<typeof roleOf>;
  tipo: MessageView["type"];
  /** Texto de uma mensagem de TEXTO. Mutuamente exclusivo com `legenda`. */
  texto?: string;
  /** Texto que veio JUNTO com uma mídia (caption do vídeo/imagem/documento) — é a
   * descrição DAQUELA mídia, não uma mensagem solta. Distinguir os dois evita a IA
   * confundir "ele mandou vídeo e escreveu na legenda" com "mandou vídeo e DEPOIS
   * mandou um texto à parte". */
  legenda?: string;
  citacao?: string;
  citacao_de?: string;
  reacoes?: string;
  transcricao?: string;
  midia?: string;
  /** true quando é mídia (vídeo/imagem/áudio/doc) mas o arquivo não está no disco
   * local. Com a nuvem ligada (WAC_CLOUD_*), isso é NORMAL — o arquivo está na
   * nuvem e ver_imagem/transcrever/etc. baixam sob demanda; NÃO é erro, pode ver
   * normalmente. Só em setup 100% local é que significa "mídia não capturada". */
  midia_pendente?: true;
};

/** Formata um timestamp UTC ISO como data+hora local de Brasília (America/Sao_Paulo).
 * Ex.: "2026-06-26T01:11:00.000Z" → "25/06 22:11" (a msg da noite de quinta, BRT).
 * Usa Intl, que aplica o offset (-3h) corretamente. Cai pro ISO cru se a data for inválida. */
export function horaBRT(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return isoUtc;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Resolve um jid para um rótulo legível: "você", o nome do contato, ou o número cru. */
export function label(c: Contacts, jid: string | null | undefined): string | undefined {
  if (!jid) return undefined;
  const num = numberFromJid(jid);
  if (c.ownIds.has(num)) return "você";
  return c.names.get(num) ?? num;
}

/**
 * Versão compacta de uma mensagem para a IA consumir (com papel e menções resolvidas).
 * Usada tanto pelo MCP (`mcp/server.ts`) quanto pelo copiloto in-app (`lib/copilot.ts`).
 */
export function compact(m: MessageView, c: Contacts): CompactMsg {
  const reacoes = m.reactions.length
    ? m.reactions.map((r) => `${r.emoji} (${r.fromMe ? "você" : r.by})`).join(", ")
    : undefined;
  // Texto que veio numa mensagem de MÍDIA é legenda (descreve a mídia); numa
  // mensagem de texto é `texto` (mensagem solta). O Baileys já entrega a caption
  // do vídeo/imagem/doc no mesmo `text`, então a distinção é só pelo tipo.
  const textoResolvido = m.text ? resolveMentions(m.text, c) : undefined;
  const ehMidia = m.type !== "text";
  return {
    timestamp: m.timestamp,
    hora_brt: horaBRT(m.timestamp),
    de: m.senderName,
    papel: roleOf(c, numberFromJid(m.sender)), // 'me' | 'team' | 'client'
    tipo: m.type,
    texto: ehMidia ? undefined : textoResolvido,
    legenda: ehMidia ? textoResolvido : undefined,
    citacao: m.quotedText ? resolveMentions(m.quotedText, c) : undefined,
    citacao_de: label(c, m.quotedSender),
    reacoes,
    transcricao: m.transcript || undefined,
    midia: m.mediaPath || undefined,
    // Tipo com arquivo mas sem path local = pendente (na nuvem, baixa sob demanda).
    ...(TIPOS_COM_ARQUIVO.has(m.type) && !m.mediaPath ? { midia_pendente: true as const } : {}),
  };
}

/** Tipos cujo conteúdo é um arquivo no disco (têm mediaPath quando baixados). */
const TIPOS_COM_ARQUIVO = new Set(["audio", "video", "image", "gif", "sticker", "document"]);
