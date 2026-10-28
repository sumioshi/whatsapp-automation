'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MedidorUso } from '@/app/components/ui';
import type {
  ClienteEscritorio,
  ContatoProjetoEscritorio,
  DmDisponivelEscritorio,
} from '@/lib/escritorio-estado';
import { instanteLongo } from '@/lib/formatar-data';
import type { PresenceView } from '@/lib/presence';
import { CharSprite } from './CharSprite';

interface MensagemResumo {
  id: string;
  timestamp: string;
  senderName: string;
  fromMe?: boolean;
  type: string;
  text: string;
  quotedText?: string | null;
}

interface PainelClienteEscritorioProps {
  cliente: ClienteEscritorio;
  palette: number;
  presenca?: PresenceView;
  autonomo?: boolean;
  notaInicial?: string;
  seatLabel?: string;
  canalSelecionado?: string | null;
  onSelectCanal?: (canalSlug: string | null) => void;
  dmsDisponiveis?: DmDisponivelEscritorio[];
  onClose: () => void;
  onWalkTo: () => void;
  onRefreshEstado: () => void;
  onToggleMesa?: (slug: string, acao: 'ocupar_mesa' | 'liberar_mesa') => Promise<void>;
}

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

export function PainelClienteEscritorio({
  cliente,
  palette,
  presenca,
  autonomo,
  notaInicial = '',
  seatLabel,
  canalSelecionado,
  onSelectCanal,
  dmsDisponiveis = [],
  onClose,
  onWalkTo,
  onRefreshEstado,
  onToggleMesa,
}: PainelClienteEscritorioProps) {
  const [mensagens, setMensagens] = useState<MensagemResumo[]>([]);
  const [carregandoMsgs, setCarregandoMsgs] = useState(true);
  const [nota, setNota] = useState(notaInicial);
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [marcandoResolvido, setMarcandoResolvido] = useState(false);
  const [alterandoMesa, setAlterandoMesa] = useState(false);

  // Canal de conversa exibido no drawer: null = grupo/conversa principal do projeto; ou dmSlug de um contato vinculado
  const [canalInterno, setCanalInterno] = useState<string | null>(canalSelecionado ?? null);

  // Formulário para vincular novo contato / DM ao projeto
  const [mostrarFormContato, setMostrarFormContato] = useState(false);
  const [novoContatoNome, setNovoContatoNome] = useState('');
  const [novoContatoPapel, setNovoContatoPapel] = useState('Cliente');
  const [novoContatoDmSlug, setNovoContatoDmSlug] = useState('');
  const [salvandoContato, setSalvandoContato] = useState(false);

  useEffect(() => {
    setCanalInterno(canalSelecionado ?? null);
  }, [canalSelecionado, cliente.slug]);

  function selecionarCanal(novo: string | null) {
    setCanalInterno(novo);
    onSelectCanal?.(novo);
  }

  // Encontra o contato vinculado correspondente ao canal ativo, se houver
  const contatoCanalAtivo: ContatoProjetoEscritorio | undefined = canalInterno
    ? cliente.contatosVinculados?.find(
        (ct) => ct.dmSlug === canalInterno || ct.dmSlugs.includes(canalInterno),
      )
    : undefined;

  const querySlugsAtivo = contatoCanalAtivo
    ? contatoCanalAtivo.dmSlugs.join(',')
    : (canalInterno ?? cliente.slug);

  const linkConversaAtiva = contatoCanalAtivo?.dmSlug ?? canalInterno ?? cliente.slug;

  useEffect(() => {
    setNota(notaInicial);
  }, [notaInicial, cliente.slug]);

  useEffect(() => {
    let cancelado = false;
    setCarregandoMsgs(true);

    async function load() {
      try {
        const res = await fetch(
          `/api/escritorio/mensagens?slug=${encodeURIComponent(querySlugsAtivo)}&limit=20`,
          {
            cache: 'no-store',
          },
        );
        if (!res.ok) return;
        const data = (await res.json()) as MensagemResumo[] | { messages?: MensagemResumo[] };
        const lista = Array.isArray(data)
          ? data
          : Array.isArray(data?.messages)
            ? data.messages
            : [];
        if (!cancelado) {
          setMensagens(lista.slice(-20));
        }
      } catch {
        // ignore
      } finally {
        if (!cancelado) setCarregandoMsgs(false);
      }
    }

    load();
    const timer = setInterval(load, 6000);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, [querySlugsAtivo]);

  async function handleVincularContato(e: React.FormEvent) {
    e.preventDefault();
    const nomeLimpo = novoContatoNome.trim();
    if (!nomeLimpo) return;
    setSalvandoContato(true);
    try {
      await fetch('/api/escritorio/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: cliente.slug,
          acao: 'vincular_contato',
          contato: {
            nome: nomeLimpo,
            papel: novoContatoPapel.trim() || 'Contato',
            dmSlug: novoContatoDmSlug.trim() || null,
          },
        }),
      });
      setNovoContatoNome('');
      setNovoContatoDmSlug('');
      setMostrarFormContato(false);
      onRefreshEstado();
    } finally {
      setSalvandoContato(false);
    }
  }

  async function handleRemoverContato(nomeContato: string) {
    try {
      await fetch('/api/escritorio/estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: cliente.slug,
          acao: 'remover_contato',
          contato: { nome: nomeContato },
        }),
      });
      onRefreshEstado();
    } catch {
      // ignore
    }
  }

  async function handleMarcarResolvido() {
    setMarcandoResolvido(true);
    try {
      await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'resolved',
          slug: cliente.slug,
          value: new Date().toISOString(),
        }),
      });
      onRefreshEstado();
    } finally {
      setMarcandoResolvido(false);
    }
  }

  async function handleSalvarNota() {
    setSalvandoNota(true);
    try {
      await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'note',
          slug: cliente.slug,
          value: nota,
        }),
      });
      onRefreshEstado();
    } finally {
      setSalvandoNota(false);
    }
  }

  const valorMensal = cliente.contrato.valorMensal;

  const ehUrgente = cliente.band === 'hot' || cliente.band === 'warm';

  return (
    <aside
      className="flex shrink-0 flex-col border-line bg-surface text-fg shadow-2xl max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-14 max-md:w-full max-md:rounded-t-2xl max-md:border-t md:relative md:h-full md:w-[380px] md:border-l"
      style={{ zIndex: 55 }}
    >
      {/* Topo com Sprite + Nome + Status */}
      <div className="flex items-start gap-3 border-b border-line bg-elevated px-4 py-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-[#161822]">
          <CharSprite charIndex={palette} size={36} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-[14px] font-semibold leading-tight text-fg">
              {cliente.nome}
            </h2>
            <button
              type="button"
              onClick={onClose}
              title="Fechar painel (Esc)"
              className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded text-fg-faint hover:bg-surface hover:text-fg"
            >
              ✕
            </button>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-fg-dim">
              {cliente.tipo === 'dm' ? 'DM' : 'Grupo'}
            </span>
            {cliente.aguardando ? (
              <span
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  ehUrgente
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    ehUrgente ? 'bg-red-400' : 'bg-amber-400'
                  }`}
                />
                Aguardando {cliente.waitingLabel ?? ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Em dia
              </span>
            )}
            {autonomo && (
              <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
                Autônomo
              </span>
            )}
            {presenca?.status === 'typing' && (
              <span className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
                Digitando…
              </span>
            )}
            {presenca?.status === 'recording' && (
              <span className="inline-flex items-center gap-1 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
                Gravando áudio…
              </span>
            )}
          </div>

          {cliente.repoNome && (
            <p className="mt-1 text-[11px] font-mono text-fg-dim">
              📦 repo: <strong>{cliente.repoNome}</strong>
              {cliente.github ? ` (${cliente.github})` : ''}
            </p>
          )}
          {seatLabel && <p className="mt-0.5 text-[11px] text-fg-faint">🪑 {seatLabel}</p>}
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        {cliente.emDesenvolvimento && (
          <button
            type="button"
            onClick={onWalkTo}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[12px] font-medium text-fg-dim transition-colors hover:text-fg"
            title="Caminhar com seu personagem até a mesa deste projeto"
          >
            <span>🚶</span>
            Ir até a mesa
          </button>
        )}

        <Link
          href={`/g/${encodeURIComponent(linkConversaAtiva)}`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-accent-ink transition-opacity hover:opacity-90"
        >
          {contatoCanalAtivo
            ? `Abrir DM: ${contatoCanalAtivo.nome.split(' ')[0]} →`
            : 'Abrir conversa →'}
        </Link>

        {cliente.aguardando && (
          <button
            type="button"
            disabled={marcandoResolvido}
            onClick={handleMarcarResolvido}
            className="inline-flex items-center gap-1 rounded-md border border-line bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-fg-dim hover:text-fg disabled:opacity-50"
            title="Marcar conversa como resolvida até agora"
          >
            ✓ Resolvido
          </button>
        )}

        {onToggleMesa && (
          <button
            type="button"
            disabled={alterandoMesa}
            onClick={async () => {
              setAlterandoMesa(true);
              try {
                await onToggleMesa(
                  cliente.slug,
                  cliente.emDesenvolvimento ? 'liberar_mesa' : 'ocupar_mesa',
                );
              } finally {
                setAlterandoMesa(false);
              }
            }}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
              cliente.emDesenvolvimento
                ? 'border-line bg-elevated text-fg-faint hover:border-red-500/40 hover:text-red-300'
                : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            }`}
          >
            {cliente.emDesenvolvimento
              ? '🪑 Liberar mesa (Não estou desenvolvendo agora)'
              : '🪑 Colocar em uma mesa (Em desenvolvimento)'}
          </button>
        )}
      </div>

      {/* Corpo rolável */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {/* Contatos do Projeto & Conversas Fora do Grupo (DMs Monitoradas) */}
        <div className="rounded-lg border border-line bg-elevated p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-faint">
              👥 Contatos &amp; Chats ({cliente.contatosVinculados?.length ?? 0})
            </span>
            <button
              type="button"
              onClick={() => setMostrarFormContato((v) => !v)}
              className="rounded border border-line bg-surface px-2 py-0.5 text-[10px] font-medium text-fg-dim hover:text-fg"
            >
              {mostrarFormContato ? 'Cancelar' : '+ Vincular'}
            </button>
          </div>

          {mostrarFormContato && (
            <form
              onSubmit={handleVincularContato}
              className="mt-2.5 space-y-2 rounded-md border border-line bg-surface p-2.5"
            >
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={novoContatoNome}
                  onChange={(e) => setNovoContatoNome(e.target.value)}
                  placeholder="Nome (ex: Ana, Bruno)"
                  required
                  className="rounded border border-line bg-elevated px-2 py-1 text-[11px] text-fg placeholder:text-fg-faint focus:outline-none"
                />
                <input
                  type="text"
                  value={novoContatoPapel}
                  onChange={(e) => setNovoContatoPapel(e.target.value)}
                  placeholder="Papel (ex: Cliente)"
                  className="rounded border border-line bg-elevated px-2 py-1 text-[11px] text-fg placeholder:text-fg-faint focus:outline-none"
                />
              </div>
              <select
                value={novoContatoDmSlug}
                onChange={(e) => {
                  const val = e.target.value;
                  setNovoContatoDmSlug(val);
                  if (val && !novoContatoNome.trim()) {
                    const found = dmsDisponiveis.find((d) => d.slug === val);
                    if (found) setNovoContatoNome(found.nome);
                  }
                }}
                className="w-full rounded border border-line bg-elevated px-2 py-1 text-[11px] text-fg focus:outline-none"
              >
                <option value="">Sem DM vinculada (apenas contato do grupo)</option>
                {dmsDisponiveis.map((dm) => (
                  <option key={dm.slug} value={dm.slug}>
                    💬 {dm.nome} ({dm.slug}) · {dm.mensagens}m
                    {dm.atividadeLabel ? ` · ${dm.atividadeLabel}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={salvandoContato}
                className="w-full rounded bg-accent py-1 text-[11px] font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
              >
                {salvandoContato ? 'Vinculando…' : 'Salvar vínculo no projeto'}
              </button>
            </form>
          )}

          {/* Aba do Grupo Principal */}
          <div className="mt-2.5 space-y-1.5">
            {cliente.tipo === 'grupo' && (
              <div
                onClick={() => selecionarCanal(null)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors ${
                  canalInterno === null
                    ? 'border-accent bg-accent-soft text-fg'
                    : 'border-line bg-surface/60 text-fg-dim hover:bg-surface hover:text-fg'
                }`}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span>👥</span>
                  <span className="truncate font-semibold">Grupo: {cliente.nome}</span>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-fg-faint">
                  {cliente.atividadeLabel ?? `${cliente.mensagens}m`}
                </span>
              </div>
            )}

            {(cliente.contatosVinculados ?? []).map((ct) => {
              const temDm = Boolean(ct.dmSlug);
              const selecionado =
                temDm &&
                canalInterno !== null &&
                (ct.dmSlug === canalInterno || ct.dmSlugs.includes(canalInterno));
              const dmUrgente = ct.aguardando && (ct.band === 'hot' || ct.band === 'warm');

              return (
                <div
                  key={ct.id}
                  onClick={() => {
                    if (temDm && ct.dmSlug) {
                      selecionarCanal(selecionado ? null : ct.dmSlug);
                    }
                  }}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] transition-colors ${
                    temDm ? 'cursor-pointer' : ''
                  } ${
                    selecionado
                      ? 'border-accent bg-accent-soft text-fg'
                      : ct.aguardando
                        ? 'border-amber-500/40 bg-amber-500/10 text-fg hover:bg-amber-500/15'
                        : 'border-line bg-surface/60 text-fg-dim hover:bg-surface hover:text-fg'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span>{temDm ? '💬' : '👤'}</span>
                      <span className="truncate font-semibold text-fg">{ct.nome}</span>
                      {ct.papel && (
                        <span className="shrink-0 rounded border border-line bg-elevated px-1.5 py-0.2 text-[9px] text-fg-faint">
                          {ct.papel}
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {ct.aguardando ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                            dmUrgente
                              ? 'bg-red-500/25 text-red-300'
                              : 'bg-amber-500/25 text-amber-300'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              dmUrgente ? 'bg-red-400' : 'bg-amber-400'
                            }`}
                          />
                          {ct.waitingLabel ?? 'Aguardando'}
                        </span>
                      ) : temDm ? (
                        <span className="font-mono text-[10px] text-fg-faint">
                          {ct.atividadeLabel ? `DM · ${ct.atividadeLabel}` : `DM · ${ct.mensagensDm}m`}
                        </span>
                      ) : (
                        <span className="text-[10px] text-fg-faint">No grupo</span>
                      )}

                      {temDm && ct.dmSlug && (
                        <Link
                          href={`/g/${encodeURIComponent(ct.dmSlug)}`}
                          onClick={(e) => e.stopPropagation()}
                          title={`Abrir chat individual de ${ct.nome}`}
                          className="rounded border border-line bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-fg-dim hover:border-accent hover:text-fg"
                        >
                          ↗
                        </Link>
                      )}

                      {ct.custom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoverContato(ct.nome);
                          }}
                          title="Remover vínculo"
                          className="rounded px-1 text-[10px] text-fg-faint hover:text-red-300"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {temDm && ct.ultimaPreview && (
                    <p className="mt-1 truncate pl-5 text-[10px] text-fg-faint">
                      {ct.ultimaPreview}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Resumo de contrato / uso 30d */}
        <div className="rounded-lg border border-line bg-elevated p-3">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-fg-faint">
            <span>Contrato &amp; Uso (30d)</span>
            {valorMensal != null && (
              <span className="font-mono text-[12px] font-semibold text-fg">
                {BRL.format(valorMensal)}/mês
              </span>
            )}
          </div>

          <div className="mt-2.5">
            <MedidorUso valor={cliente.msgsCliente30d} limite={cliente.limite} compacto />
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-dim">
            <span>
              Total histórico: <strong className="font-mono text-fg">{cliente.mensagens}</strong>{' '}
              msgs
            </span>
            <span>
              Entregas (30d):{' '}
              <strong className="font-mono text-fg">{cliente.entregas30d}</strong> (
              {cliente.entregasTotal} total)
            </span>
          </div>

          {cliente.etiquetas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
              {cliente.etiquetas.map((et) => (
                <span
                  key={et}
                  className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-fg-dim"
                >
                  {et}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Sinais do dia se houver */}
        {cliente.sinais.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              Sinais de Atenção ({cliente.sinais.length})
            </div>
            <ul className="mt-1.5 space-y-1 text-[12px] text-fg">
              {cliente.sinais.map((s) => (
                <li key={s} className="leading-snug">
                  • {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Notas rápidas do cliente */}
        <div className="rounded-lg border border-line bg-elevated p-3">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-fg-faint">
            <span>Nota interna (CRM)</span>
            {nota !== notaInicial && (
              <button
                type="button"
                disabled={salvandoNota}
                onClick={handleSalvarNota}
                className="rounded bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50"
              >
                {salvandoNota ? 'Salvando…' : 'Salvar'}
              </button>
            )}
          </div>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder="Anotações sobre contrato, combinado ou pendência..."
            className="mt-1.5 w-full resize-none rounded border border-line bg-surface px-2 py-1.5 text-[12px] text-fg placeholder:text-fg-faint focus:outline-none"
          />
        </div>

        {/* Últimas mensagens do WhatsApp */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-medium uppercase tracking-wider text-fg-faint">
              {contatoCanalAtivo
                ? `💬 Mensagens DM: ${contatoCanalAtivo.nome}`
                : '👥 Últimas mensagens no Grupo'}
            </span>
            {contatoCanalAtivo ? (
              <button
                type="button"
                onClick={() => selecionarCanal(null)}
                className="shrink-0 rounded border border-line bg-elevated px-1.5 py-0.5 text-[10px] text-fg-dim hover:text-fg"
              >
                ← Voltar ao grupo
              </button>
            ) : (
              <span className="shrink-0 font-mono text-[10px] text-fg-faint">Somente leitura</span>
            )}
          </div>

          {carregandoMsgs ? (
            <div className="rounded-lg border border-line bg-elevated p-4 text-center text-[12px] text-fg-faint">
              Carregando histórico…
            </div>
          ) : mensagens.length === 0 ? (
            <div className="rounded-lg border border-line bg-elevated p-4 text-center text-[12px] text-fg-faint">
              Nenhuma mensagem recente.
            </div>
          ) : (
            <div className="space-y-2">
              {mensagens.map((m) => {
                const ehMinha = Boolean(m.fromMe);
                return (
                  <div
                    key={m.id}
                    className={`rounded-lg border px-3 py-2 text-[12px] ${
                      ehMinha
                        ? 'ml-4 border-blue-500/25 bg-blue-500/10 text-fg'
                        : 'mr-4 border-line bg-elevated text-fg'
                    }`}
                  >
                    <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] text-fg-faint">
                      <span className="truncate font-semibold text-fg-dim">
                        {ehMinha ? 'Você' : m.senderName || 'Cliente'}
                      </span>
                      <span className="shrink-0 font-mono">{instanteLongo(m.timestamp)}</span>
                    </div>
                    {m.quotedText && (
                      <div className="mb-1 truncate border-l-2 border-line pl-2 text-[11px] italic text-fg-faint">
                        {m.quotedText}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {m.type !== 'text' && !m.text
                        ? `[${m.type}]`
                        : m.type !== 'text'
                          ? `[${m.type}] ${m.text}`
                          : m.text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
