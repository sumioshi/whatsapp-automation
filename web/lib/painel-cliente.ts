import { cache } from 'react';
import { desdeQuando, midiaDaConversa, type PainelCliente, pessoasDaConversa, resumoContrato, rotuloSinal, chaveDia } from './caixa';
import { buildContacts, displayNameOf, roleOf } from './contacts';
import { readContratos } from './contratos';
import { explicarSinal, montarDashboard } from './dashboard';
import type { MessageRecord } from './data';
import { lerUsuarios } from './equipe/usuarios';
import { listarFeatures } from './features';
import type { TriageState } from './triage';

/** O mapa de contatos relê todos os chats: uma vez por renderização. */
const contatosDaRequisicao = cache(() => buildContacts());

interface Base {
  slug: string;
  nome: string;
  avatarPath: string | null;
  /** Todos os registros da conversa (não só a janela da tela). */
  registros: MessageRecord[];
}

/**
 * Painel do cliente da conversa. Sem `triage`, é a versão da equipe: só
 * quem fala e a mídia, nada de etiqueta, contrato, sinal ou modo da IA.
 */
export async function dadosDoPainel(b: Base, triage: TriageState | null): Promise<PainelCliente> {
  const contatos = await contatosDaRequisicao();
  const pessoas = pessoasDaConversa(b.registros, {
    papel: (id) => roleOf(contatos, id),
    nome: (senderName, id) => displayNameOf(contatos, senderName, id),
  });
  const base = {
    slug: b.slug,
    nome: b.nome,
    tipo: b.slug.startsWith('dm-') ? ('dm' as const) : ('grupo' as const),
    avatarPath: b.avatarPath,
    pessoas,
    midia: midiaDaConversa(b.registros),
  };
  if (!triage) return { ...base, desde: desdeQuando(null, b.registros[0]?.timestamp ?? null), dono: null };

  const agora = Date.now();
  const hoje = chaveDia(new Date(agora).toISOString());
  const [contratos, features, usuarios] = await Promise.all([readContratos(), listarFeatures({ slug: b.slug }), lerUsuarios()]);
  const contrato = contratos[b.slug] ?? null;
  const linha = montarDashboard(
    [{ slug: b.slug, nome: b.nome, mensagens: b.registros.map((r) => ({ timestamp: r.timestamp, fromMe: Boolean(r.fromMe) })) }],
    contratos,
    features,
    agora,
  ).linhas[0];
  // Como no painel: conversa direta só tem sinal quando há negócio registrado (contrato ou entrega).
  const comNegocio = base.tipo === 'grupo' || contrato !== null || features.length > 0;
  return {
    ...base,
    desde: desdeQuando(contrato, b.registros[0]?.timestamp ?? null),
    dono: {
      etiquetas: triage.etiquetas[b.slug] ?? [],
      conhecidas: [...new Set(Object.values(triage.etiquetas).flat())],
      sinais: comNegocio
        ? (linha?.sinais ?? []).map((s) => ({ id: s, ...rotuloSinal(s, contrato, hoje), explicacao: explicarSinal(s) }))
        : [],
      contrato,
      resumo: resumoContrato(contrato, hoje),
      entregas: { d30: linha?.features30d ?? 0, total: linha?.featuresTotal ?? features.length },
      mensagens30d: linha?.msgs30d ?? 0,
      equipe: usuarios.filter((u) => u.ativo && u.chats.includes(b.slug)).map((u) => ({ login: u.login, nome: u.nome })),
      autonomo: Boolean(triage.autonomo[b.slug]),
      silenciado: Boolean(triage.muted[b.slug]),
    },
  };
}
