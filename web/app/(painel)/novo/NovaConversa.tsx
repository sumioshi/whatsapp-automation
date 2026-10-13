"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ContactEntry } from "@/app/api/contacts/route";
import { mensagemDe, pedirJson } from "@/app/components/pedirJson";
import { Avatar, Badge, Button, CabecalhoPagina, CampoBusca, Card, CorpoPagina, EmptyState, Field, Grade12, Icone, Input, Segmentado, Textarea, cn } from "@/app/components/ui";
import { casaBusca } from "@/lib/busca";
import type { GroupWithTags } from "@/lib/config";
import { analisarNumero, formatarTelefone } from "@/lib/numero-whatsapp";
import { slugify } from "@/lib/slug";

type Modo = "grupo" | "contato";

/** Tetos de linhas na lista; acima disso a busca refina. */
const MAX_GRUPOS = 300;
const MAX_CONTATOS = 200;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Nova conversa: escolher um grupo (mesmo sem histórico) ou um contato, ou digitar o número, e
 * mandar a primeira mensagem. A mensagem sai na hora; o grupo passa a ser monitorado e a conversa abre.
 */
export function NovaConversa({ modo }: { modo: Modo }) {
  const router = useRouter();

  const [grupos, setGrupos] = useState<GroupWithTags[] | null>(null);
  const [erroGrupos, setErroGrupos] = useState<string | null>(null);
  const [contatos, setContatos] = useState<ContactEntry[] | null>(null);
  const [erroContatos, setErroContatos] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState<GroupWithTags | null>(null);
  const [contato, setContato] = useState<ContactEntry | null>(null);
  const [manual, setManual] = useState(false);
  const [numero, setNumero] = useState("");
  const [mostrarErroNumero, setMostrarErroNumero] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mensagemRef = useRef<HTMLDivElement>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);
  const numeroRef = useRef<HTMLInputElement>(null);

  // Trocar de modo (pelo seletor ou pelo link do menu) recomeça a escolha.
  useEffect(() => {
    setBusca("");
    setGrupo(null);
    setContato(null);
    setManual(false);
    setNumero("");
    setMostrarErroNumero(false);
    setErro(null);
  }, [modo]);

  useEffect(() => {
    if (grupos !== null || modo !== "grupo") return;
    pedirJson<GroupWithTags[]>("/api/groups")
      .then(setGrupos)
      .catch((e) => setErroGrupos(mensagemDe(e)));
  }, [modo, grupos]);

  useEffect(() => {
    if (contatos !== null || modo !== "contato") return;
    pedirJson<ContactEntry[]>("/api/contacts")
      .then(setContatos)
      .catch((e) => setErroContatos(mensagemDe(e)));
  }, [modo, contatos]);

  const gruposFiltrados = useMemo(() => (grupos ?? []).filter((g) => casaBusca(g.name, busca)), [grupos, busca]);
  const contatosFiltrados = useMemo(() => {
    const digitos = soDigitos(busca);
    return (contatos ?? []).filter((c) => casaBusca(c.name, busca) || (digitos.length >= 3 && c.number.includes(digitos)));
  }, [contatos, busca]);

  const analise = analisarNumero(numero);

  function irParaMensagem(alvo: "texto" | "numero") {
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 1020px)").matches) {
        mensagemRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      (alvo === "numero" ? numeroRef.current : textoRef.current)?.focus({ preventScroll: true });
    });
  }

  function escolherGrupo(g: GroupWithTags) {
    setGrupo(g);
    setErro(null);
    irParaMensagem("texto");
  }

  function escolherContato(c: ContactEntry) {
    setContato(c);
    setManual(false);
    setErro(null);
    irParaMensagem("texto");
  }

  function digitarNumero() {
    setContato(null);
    setManual(true);
    setErro(null);
    irParaMensagem("numero");
  }

  async function enviar() {
    if (enviando || !texto.trim()) return;
    let jid: string;
    let destino: string;
    if (modo === "grupo") {
      if (!grupo) return;
      jid = grupo.id;
      // O slug salvo pelo coletor é estável mesmo depois de o grupo ser renomeado.
      destino = grupo.slug ?? slugify(grupo.name);
    } else if (manual || !contato) {
      if (!analise.valido) {
        setMostrarErroNumero(true);
        return;
      }
      jid = analise.jid;
      destino = analise.slug;
    } else {
      if (!contato.jid) {
        setErro("Esse contato só tem ID de privacidade, sem telefone. Digite o número.");
        return;
      }
      jid = contato.jid;
      destino = `dm-${slugify(soDigitos(contato.number))}`;
    }

    setEnviando(true);
    setErro(null);
    try {
      if (modo === "grupo" && grupo && !grupo.watch) {
        await pedirJson("/api/groups", { corpo: { id: grupo.id, watch: true } });
        await esperar(800);
      }
      await pedirJson("/api/send", { corpo: { jid, text: texto.trim() } });
      // Dá tempo de o coletor gravar a mensagem antes de abrir a conversa.
      await esperar(1200);
      router.push(`/g/${destino}`);
    } catch (e) {
      setErro(mensagemDe(e));
      setEnviando(false);
    }
  }

  const destinoPronto =
    modo === "grupo" ? grupo !== null : manual || !contato ? analise.valido : Boolean(contato.dmReady && contato.jid);
  const podeEnviar = destinoPronto && texto.trim().length > 0;

  return (
    <>
      <CabecalhoPagina
        variante="barra"
        titulo="Nova conversa"
        subtitulo={modo === "grupo" ? "Primeira mensagem num grupo" : "Mensagem direta para um contato ou número"}
        acoes={
          <Segmentado
            rotulo="Conversa com"
            valor={modo}
            opcoes={[
              { valor: "grupo", rotulo: "Grupo", href: "/novo" },
              { valor: "contato", rotulo: "Contato", href: "/novo?modo=contato" },
            ]}
          />
        }
      />
      <CorpoPagina>
        <Grade12 className="items-start">
          <Card
            largura="g"
            titulo={modo === "grupo" ? "Escolha o grupo" : "Escolha o contato"}
            icone={<Icone nome={modo === "grupo" ? "users" : "user"} />}
            meta={modo === "grupo" ? "mesmo sem histórico" : "quem já trocou mensagem com você"}
            rodape={<ContagemLista modo={modo} busca={busca} grupos={grupos} gruposFiltrados={gruposFiltrados} contatos={contatos} contatosFiltrados={contatosFiltrados} />}
            acoes={
              modo === "contato" ? (
                <Button variant="ghost" size="sm" onClick={digitarNumero}>
                  <Icone nome="phone" tamanho={14} />
                  Digitar número
                </Button>
              ) : undefined
            }
          >
            <CampoBusca
              valor={busca}
              aoMudar={setBusca}
              placeholder={modo === "grupo" ? "Buscar grupo" : "Buscar por nome ou número"}
              rotulo={modo === "grupo" ? "Buscar grupo" : "Buscar contato por nome ou número"}
            />
            {modo === "grupo" ? (
              <ListaGrupos
                grupos={grupos}
                erro={erroGrupos}
                filtrados={gruposFiltrados}
                escolhido={grupo?.id ?? null}
                aoEscolher={escolherGrupo}
              />
            ) : (
              <ListaContatos
                contatos={contatos}
                erro={erroContatos}
                filtrados={contatosFiltrados}
                escolhido={manual ? null : (contato?.number ?? null)}
                aoEscolher={escolherContato}
                aoDigitar={digitarNumero}
              />
            )}
          </Card>

          <div ref={mensagemRef} className="col-span-4 min-w-0 scroll-mt-6 max-[1020px]:col-span-full min-[1021px]:sticky min-[1021px]:top-8">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enviar();
              }}
            >
              <Card
                titulo="Mensagem"
                icone={<Icone nome="send" />}
                rodape={
                  <>
                    <span className="min-w-0 truncate">Sai na hora, pelo seu número.</span>
                    <Button type="submit" size="sm" className="ml-auto" disabled={!podeEnviar} loading={enviando}>
                      {enviando ? "Enviando…" : modo === "grupo" ? "Iniciar conversa" : "Enviar mensagem"}
                    </Button>
                  </>
                }
              >
                <span className="mb-1.5 block text-[12.5px] font-medium text-fg-dim">Para</span>
                {modo === "grupo" ? (
                  grupo ? (
                    <Destino
                      nome={grupo.name}
                      tipo="grupo"
                      detalhe={grupo.watch ? "Monitorado" : "Passa a ser monitorado ao enviar"}
                      aoTrocar={() => setGrupo(null)}
                    />
                  ) : (
                    <Vazio>Escolha um grupo na lista.</Vazio>
                  )
                ) : manual ? (
                  <div>
                    <Field
                      label="Número com DDI"
                      htmlFor="novo-numero"
                      error={mostrarErroNumero && !analise.valido ? (analise.erro ?? "Informe o número com DDI.") : undefined}
                      hint={
                        analise.valido ? (
                          <>
                            Vai para <span className="font-mono text-fg">{analise.exibicao}</span>.
                            {analise.aviso && <span className="mt-1 block text-warn">{analise.aviso}</span>}
                          </>
                        ) : (
                          "Só dígitos, com o código do país. Ex.: 5511999999999."
                        )
                      }
                    >
                      <Input
                        id="novo-numero"
                        ref={numeroRef}
                        value={numero}
                        onChange={(e) => {
                          setNumero(e.target.value);
                          setMostrarErroNumero(false);
                        }}
                        onBlur={() => setMostrarErroNumero(numero.trim() !== "")}
                        placeholder="5511999999999"
                        inputMode="tel"
                        autoComplete="off"
                        aria-invalid={(mostrarErroNumero && !analise.valido) || undefined}
                        className="font-mono"
                      />
                    </Field>
                    <Button variant="ghost" size="sm" className="mt-1 -ml-2.5" onClick={() => setManual(false)}>
                      Escolher da lista
                    </Button>
                  </div>
                ) : contato ? (
                  <Destino
                    nome={contato.name}
                    tipo="dm"
                    detalhe={contato.dmReady ? formatarTelefone(contato.number) : "Sem telefone conhecido. Digite o número."}
                    alerta={!contato.dmReady}
                    aoTrocar={() => setContato(null)}
                  />
                ) : (
                  <Vazio>
                    Escolha um contato na lista ou{" "}
                    <button type="button" onClick={digitarNumero} className="focus-ring rounded-tag font-medium text-accent hover:underline">
                      digite o número
                    </button>
                    .
                  </Vazio>
                )}

                <Field label="Mensagem" htmlFor="novo-texto" error={erro ?? undefined} className="mt-4">
                  <Textarea
                    id="novo-texto"
                    ref={textoRef}
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    rows={5}
                    placeholder={modo === "grupo" ? "Primeira mensagem…" : "Mensagem…"}
                  />
                </Field>
              </Card>
            </form>
          </div>
        </Grade12>
      </CorpoPagina>
    </>
  );
}

/** Rodapé da lista: quantos há (e quantos a busca deixou), já que a lista rola por dentro do card. */
function ContagemLista({
  modo,
  busca,
  grupos,
  gruposFiltrados,
  contatos,
  contatosFiltrados,
}: {
  modo: Modo;
  busca: string;
  grupos: GroupWithTags[] | null;
  gruposFiltrados: GroupWithTags[];
  contatos: ContactEntry[] | null;
  contatosFiltrados: ContactEntry[];
}) {
  const num = (n: number) => <span className="font-mono tabular-nums">{n.toLocaleString("pt-BR")}</span>;
  if (modo === "grupo") {
    if (!grupos) return null;
    if (busca.trim()) {
      return (
        <span>
          {num(gruposFiltrados.length)} de {num(grupos.length)} grupos
        </span>
      );
    }
    return (
      <span>
        {num(grupos.length)} grupos · {num(grupos.filter((g) => g.watch).length)} monitorados
      </span>
    );
  }
  if (!contatos) return null;
  return busca.trim() ? (
    <span>
      {num(contatosFiltrados.length)} de {num(contatos.length)} contatos
    </span>
  ) : (
    <span>{num(contatos.length)} contatos</span>
  );
}

function Destino({
  nome,
  tipo,
  detalhe,
  alerta,
  aoTrocar,
}: {
  nome: string;
  tipo: "grupo" | "dm";
  detalhe: string;
  alerta?: boolean;
  aoTrocar: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-line bg-surface-2 px-3 py-2.5">
      <Avatar nome={nome} tipo={tipo} tamanho="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-fg">{nome}</p>
        <p className={cn("truncate text-[12.5px]", alerta ? "text-danger" : tipo === "dm" ? "font-mono text-fg-faint" : "text-fg-faint")}>{detalhe}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={aoTrocar}>
        Trocar
      </Button>
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <div className="rounded-control border border-dashed border-line-2 px-3 py-3 text-[13px] text-fg-faint">{children}</div>;
}

const LINHA =
  "focus-ring relative flex min-h-12 w-full items-center gap-3 border-b border-line px-5 py-2 text-left transition-colors last:border-b-0";

function ListaGrupos({
  grupos,
  erro,
  filtrados,
  escolhido,
  aoEscolher,
}: {
  grupos: GroupWithTags[] | null;
  erro: string | null;
  filtrados: GroupWithTags[];
  escolhido: string | null;
  aoEscolher: (g: GroupWithTags) => void;
}) {
  if (erro) return <p className="mt-4 text-[13px] text-danger">Não deu para carregar os grupos. {erro}</p>;
  if (!grupos) return <p className="mt-4 text-[13px] text-fg-faint">Carregando os grupos…</p>;
  if (grupos.length === 0) {
    return <EmptyState className="py-8" title="Nenhum grupo ainda" description="Conecte o WhatsApp em Configurações. Os grupos aparecem aqui sozinhos." />;
  }
  if (filtrados.length === 0) return <p className="py-8 text-center text-[13px] text-fg-faint">Nenhum grupo com esse nome.</p>;
  return (
    <>
      <ul className="-mx-5 mt-3 max-h-[520px] overflow-y-auto border-t border-line">
        {filtrados.slice(0, MAX_GRUPOS).map((g) => {
          const atual = g.id === escolhido;
          return (
            <li key={g.id}>
              <button type="button" aria-pressed={atual} onClick={() => aoEscolher(g)} className={cn(LINHA, atual ? "bg-selected" : "hover:bg-surface-2")}>
                {atual && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-r-full bg-accent" />}
                <Avatar nome={g.name} tipo="grupo" tamanho="sm" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">{g.name}</span>
                {g.watch && (
                  <Badge variant="ok" dot>
                    monitorado
                  </Badge>
                )}
                {atual && <Icone nome="check" className="text-accent" />}
              </button>
            </li>
          );
        })}
      </ul>
      {filtrados.length > MAX_GRUPOS && <Excedente mostrados={MAX_GRUPOS} total={filtrados.length} />}
    </>
  );
}

function ListaContatos({
  contatos,
  erro,
  filtrados,
  escolhido,
  aoEscolher,
  aoDigitar,
}: {
  contatos: ContactEntry[] | null;
  erro: string | null;
  filtrados: ContactEntry[];
  escolhido: string | null;
  aoEscolher: (c: ContactEntry) => void;
  aoDigitar: () => void;
}) {
  if (erro) return <p className="mt-4 text-[13px] text-danger">Não deu para carregar os contatos. {erro}</p>;
  if (!contatos) return <p className="mt-4 text-[13px] text-fg-faint">Carregando os contatos…</p>;
  if (filtrados.length === 0) {
    return (
      <EmptyState
        className="py-8"
        title={contatos.length === 0 ? "Nenhum contato ainda" : "Ninguém com esse nome ou número"}
        description="Para falar com quem ainda não trocou mensagem com você, digite o número."
        acao={
          <Button size="sm" variant="subtle" onClick={aoDigitar}>
            Digitar número
          </Button>
        }
      />
    );
  }
  return (
    <>
      <ul className="-mx-5 mt-3 max-h-[520px] overflow-y-auto border-t border-line">
        {filtrados.slice(0, MAX_CONTATOS).map((c) => {
          const atual = c.number === escolhido;
          return (
            <li key={c.number}>
              <button type="button" aria-pressed={atual} onClick={() => aoEscolher(c)} className={cn(LINHA, atual ? "bg-selected" : "hover:bg-surface-2")}>
                {atual && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-0.5 rounded-r-full bg-accent" />}
                <Avatar nome={c.name} tipo="dm" tamanho="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-fg">{c.name}</span>
                  <span className="block truncate font-mono text-[12px] text-fg-faint">{c.dmReady ? formatarTelefone(c.number) : "sem telefone"}</span>
                </span>
                {!c.dmReady && <Badge>sem DM</Badge>}
                {c.role === "team" && <Badge variant="info">time</Badge>}
                {atual && <Icone nome="check" className="text-accent" />}
              </button>
            </li>
          );
        })}
      </ul>
      {filtrados.length > MAX_CONTATOS && <Excedente mostrados={MAX_CONTATOS} total={filtrados.length} />}
    </>
  );
}

function Excedente({ mostrados, total }: { mostrados: number; total: number }) {
  return (
    <p className="mt-2 text-[12.5px] text-fg-faint">
      Mostrando <span className="font-mono tabular-nums">{mostrados}</span> de{" "}
      <span className="font-mono tabular-nums">{total.toLocaleString("pt-BR")}</span>. Refine a busca para achar o resto.
    </p>
  );
}
