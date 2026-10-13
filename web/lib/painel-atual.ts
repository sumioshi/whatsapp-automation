import { join } from 'node:path';
import { conversasDaRequisicao } from './caixa-dados';
import { buildContacts, numberFromJid, roleOf } from './contacts';
import { readGroupRecords } from './data';
import { listarFeatures } from './features';
import { cachedByStat } from './file-cache';
import {
  autorDaMensagem,
  type ConversaPainel,
  conversaDeTrabalho,
  janelasDaFila,
  montarPainel,
  type Painel,
  type Periodo,
  type TransicaoDaFila,
} from './painel';
import { DATA_DIR } from './paths';
import { readTriage } from './triage';

const CACHE_MS = 60_000;

let cache: { emMs: number; valor: ConversaPainel[] } | null = null;

function lerTransicoes(raw: string): TransicaoDaFila[] {
  const out: TransicaoDaFila[] = [];
  for (const linha of raw.split('\n')) {
    if (!linha) continue;
    try {
      const l = JSON.parse(linha) as Record<string, unknown>;
      if (typeof l.ts !== 'string' || typeof l.ticket !== 'string' || typeof l.estado !== 'string') continue;
      out.push({
        ts: l.ts,
        ticket: l.ticket,
        estado: l.estado,
        slug: typeof l.slug === 'string' ? l.slug : undefined,
        jid: typeof l.jid === 'string' ? l.jid : undefined,
        iniciadoEm: typeof l.iniciadoEm === 'string' ? l.iniciadoEm : null,
        duracao_s: typeof l.duracao_s === 'number' ? l.duracao_s : undefined,
      });
    } catch {
      // linha cortada por escrita concorrente
    }
  }
  return out;
}

/** Registro de entregas da fila (só existe onde o coletor roda); ausente, nada é da fila. */
async function transicoesDaFila(): Promise<TransicaoDaFila[]> {
  return (await cachedByStat(join(DATA_DIR, '.entregas.jsonl'), lerTransicoes)) ?? [];
}

/**
 * As conversas de trabalho com cada mensagem já classificada (cliente, você no
 * celular, você no painel, equipe, IA). Varre todos os chats, por isso fica
 * 60 s em memória; Hoje e Painel leem daqui, sobre a lista de conversas da
 * requisição. O dono é o `PANEL_USER`: envio do painel carimbado com outro login
 * é da equipe. Saída do coletor sem carimbo só é da IA dentro de uma entrega da fila.
 */
export async function conversasDoAtendimento(): Promise<ConversaPainel[]> {
  const agora = Date.now();
  if (cache && agora - cache.emMs < CACHE_MS) return cache.valor;
  const [grupos, triagem, contatos, transicoes] = await Promise.all([
    conversasDaRequisicao(),
    readTriage(),
    buildContacts(),
    transicoesDaFila(),
  ]);
  const dono = process.env.PANEL_USER?.trim() || null;
  const daFila = janelasDaFila(transicoes);
  const valor = await Promise.all(
    grupos
      .filter((g) => conversaDeTrabalho(g, triagem.muted[g.slug] === true, contatos.ownIds))
      .map(async (g): Promise<ConversaPainel> => {
        const msgs = (await readGroupRecords(g.slug))
          .map((r) => {
            const ms = Date.parse(r.timestamp);
            const autor = autorDaMensagem(
              {
                fromMe: r.fromMe,
                papel: roleOf(contatos, numberFromJid(r.sender ?? '')),
                origem: r.origem,
                ator: r.ator,
                usuario: r.usuario,
                daFila: r.fromMe === true && r.origem === 'coletor' && !r.ator && daFila(g.slug, r.groupJid, ms),
              },
              dono,
            );
            return { ms, autor };
          })
          .filter((m) => !Number.isNaN(m.ms))
          .sort((a, b) => a.ms - b.ms);
        return { slug: g.slug, nome: g.name, avatarPath: g.avatarPath, msgs };
      }),
  );
  cache = { emMs: agora, valor };
  return valor;
}

/** O Painel do período, com as entregas registradas (o arquivo é lido a cada pedido). */
export async function painelAtual(periodo: Periodo): Promise<Painel> {
  const [conversas, features] = await Promise.all([conversasDoAtendimento(), listarFeatures()]);
  return montarPainel(conversas, features, Date.now(), periodo);
}
