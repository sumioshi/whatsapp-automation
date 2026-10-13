import { buildContacts, numberFromJid, roleOf } from './contacts';
import { listGroups, readGroupRecords } from './data';
import { listarFeatures } from './features';
import {
  autorDaMensagem,
  type ConversaPainel,
  conversaDeTrabalho,
  montarPainel,
  type Painel,
  type Periodo,
} from './painel';
import { readTriage } from './triage';

const CACHE_MS = 60_000;

let cache: { emMs: number; valor: ConversaPainel[] } | null = null;

/**
 * As conversas de trabalho com cada mensagem já classificada (cliente, você no
 * celular, você no painel, equipe, IA). Varre todos os chats, por isso fica
 * 60 s em memória; Hoje e Painel leem daqui. O dono é o `PANEL_USER`: envio do
 * painel carimbado com outro login é da equipe.
 */
export async function conversasDoAtendimento(): Promise<ConversaPainel[]> {
  const agora = Date.now();
  if (cache && agora - cache.emMs < CACHE_MS) return cache.valor;
  const [grupos, triagem, contatos] = await Promise.all([listGroups(), readTriage(), buildContacts()]);
  const dono = process.env.PANEL_USER?.trim() || null;
  const valor = await Promise.all(
    grupos
      .filter((g) => conversaDeTrabalho(g, triagem.muted[g.slug] === true, contatos.ownIds))
      .map(async (g): Promise<ConversaPainel> => {
        const msgs = (await readGroupRecords(g.slug))
          .map((r) => ({
            ms: Date.parse(r.timestamp),
            autor: autorDaMensagem(
              {
                fromMe: r.fromMe,
                papel: roleOf(contatos, numberFromJid(r.sender ?? '')),
                origem: r.origem,
                ator: r.ator,
                usuario: r.usuario,
              },
              dono,
            ),
          }))
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
