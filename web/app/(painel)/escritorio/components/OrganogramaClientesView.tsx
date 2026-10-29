'use client';

import Link from 'next/link';
import { MedidorUso } from '@/app/components/ui';
import type { ClienteEscritorio } from '@/lib/escritorio-estado';
import { CharSprite } from './CharSprite';

interface ItemOrganograma {
  id: number;
  palette: number;
  cliente: ClienteEscritorio;
  autonomo?: boolean;
}

interface OrganogramaClientesViewProps {
  itens: ItemOrganograma[];
  selectedId: number | null;
  onSelectInOffice: (id: number) => void;
}

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

export function OrganogramaClientesView({
  itens,
  selectedId,
  onSelectInOffice,
}: OrganogramaClientesViewProps) {
  const urgentes = itens.filter(
    (i) => i.cliente.aguardando && (i.cliente.band === 'hot' || i.cliente.band === 'warm'),
  );
  const aguardando = itens.filter(
    (i) => i.cliente.aguardando && i.cliente.band !== 'hot' && i.cliente.band !== 'warm',
  );
  const emDia = itens.filter((i) => !i.cliente.aguardando);

  const receitaTotal = itens.reduce((acc, i) => acc + (i.cliente.contrato.valorMensal ?? 0), 0);

  const secoes = [
    {
      id: 'urgentes',
      titulo: 'Urgente · SLA > 4h',
      subtitulo: 'Na mesa aguardando retorno prioritário',
      corBorda: 'border-red-500/40',
      corPonto: 'bg-red-500',
      lista: urgentes,
    },
    {
      id: 'aguardando',
      titulo: 'Na Mesa · Aguardando resposta',
      subtitulo: 'Mensagens recentes aguardando atendimento',
      corBorda: 'border-amber-500/40',
      corPonto: 'bg-amber-500',
      lista: aguardando,
    },
    {
      id: 'em-dia',
      titulo: 'Lounge & Operação · Em dia',
      subtitulo: 'Clientes atendidos circulando pelo escritório',
      corBorda: 'border-emerald-500/30',
      corPonto: 'bg-emerald-500',
      lista: emDia,
    },
  ];

  return (
    <div className="h-full w-full overflow-y-auto bg-bg px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Nó central do Líder / Operação */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-4 rounded-2xl border-2 border-warn-mark/60 bg-surface px-6 py-4 shadow-lg">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-warn-mark/40 bg-[#161822]">
              <CharSprite charIndex={0} size={34} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-fg">
                  👑 Central de Operações · Balcão
                </span>
                <span className="rounded border border-warn-mark/40 bg-warn-bg px-2 py-0.5 text-[11px] font-bold text-warn">
                  {itens.length} clientes no escritório
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-fg-dim">
                {urgentes.length + aguardando.length} aguardando resposta · {emDia.length} em dia
                {receitaTotal > 0 ? ` · MRR ${BRL.format(receitaTotal)}` : ''}
              </p>
            </div>
          </div>
          <div className="h-6 w-0.5 bg-warn-mark/40" />
        </div>

        {/* Colunas de Baias por Estado */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {secoes.map((sec) => (
            <div
              key={sec.id}
              className={`flex flex-col rounded-xl border ${sec.corBorda} bg-surface p-4 shadow-sm`}
            >
              <div className="mb-3 flex items-center justify-between border-b border-line pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${sec.corPonto}`} />
                    <h3 className="text-[13px] font-bold text-fg">{sec.titulo}</h3>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium text-fg-dim">{sec.subtitulo}</p>
                </div>
                <span className="rounded-md border border-line bg-elevated px-2 py-0.5 font-mono text-xs font-bold text-fg">
                  {sec.lista.length}
                </span>
              </div>

              {sec.lista.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line py-10 text-xs font-medium text-fg-dim">
                  Nenhum cliente nesta fila
                </div>
              ) : (
                <div className="space-y-2.5">
                  {sec.lista.map(({ id, palette, cliente, autonomo }) => {
                    const selecionado = selectedId === id;
                    return (
                      <div
                        key={cliente.slug}
                        onClick={() => onSelectInOffice(id)}
                        className={`group cursor-pointer rounded-lg border p-3 transition-all ${
                          selecionado
                            ? 'border-accent bg-selected ring-1 ring-accent'
                            : 'border-line bg-surface-2 hover:border-line-2 hover:bg-elevated'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-line bg-[#161822]">
                            <CharSprite charIndex={palette} size={30} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="truncate text-[13px] font-bold text-fg">
                                {cliente.nome}
                              </span>
                              {cliente.aguardando && cliente.waitingLabel && (
                                <span
                                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                    cliente.band === 'hot' || cliente.band === 'warm'
                                      ? 'border-danger/30 bg-danger-bg text-danger'
                                      : 'border-warn-mark/40 bg-warn-bg text-warn'
                                  }`}
                                >
                                  {cliente.waitingLabel}
                                </span>
                              )}
                            </div>

                            {cliente.ultimaPreview ? (
                              <p className="mt-1 line-clamp-2 text-[11.5px] font-medium text-fg-dim">
                                {cliente.ultimaPreview}
                              </p>
                            ) : (
                              <p className="mt-1 text-[11px] text-fg-dim">
                                {cliente.atividadeLabel
                                  ? `Última interação ${cliente.atividadeLabel}`
                                  : 'Sem mensagens recentes'}
                              </p>
                            )}

                            {(cliente.contatosVinculados ?? []).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
                                {cliente.contatosVinculados.map((ct) => (
                                  <span
                                    key={ct.id}
                                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                                      ct.aguardando
                                        ? 'border-danger/30 bg-danger-bg text-danger'
                                        : ct.dmSlug
                                          ? 'border-line bg-surface text-fg'
                                          : 'border-line bg-surface/80 text-fg-dim'
                                    }`}
                                    title={
                                      ct.dmSlug
                                        ? `DM monitorada: ${ct.dmSlug}${ct.atividadeLabel ? ` · ${ct.atividadeLabel}` : ''}`
                                        : `Contato no grupo (${ct.papel ?? 'Cliente'})`
                                    }
                                  >
                                    <span>{ct.dmSlug ? '💬' : '👤'}</span>
                                    <span>{ct.nome}</span>
                                    {ct.aguardando && ct.waitingLabel && (
                                      <span className="font-mono text-[9px] font-bold text-danger">
                                        ({ct.waitingLabel})
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="mt-2.5 space-y-2">
                              <MedidorUso
                                valor={cliente.msgsCliente30d}
                                limite={cliente.limite}
                                compacto
                              />
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[10.5px] font-semibold text-fg-dim">
                                  {cliente.msgsCliente30d} msgs / 30d
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {autonomo && (
                                    <span className="rounded border border-accent-line bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-info">
                                      Autônomo
                                    </span>
                                  )}
                                  <Link
                                    href={`/g/${encodeURIComponent(cliente.slug)}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded border border-line bg-surface px-2 py-0.5 text-[10px] font-semibold text-fg hover:border-accent"
                                  >
                                    Abrir chat →
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
