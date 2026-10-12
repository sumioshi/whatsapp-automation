"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Toggle,
} from "@/app/components/ui";
import type { CollectorStatus, GroupWithTags, PanelSettings } from "@/lib/config";
import { Chip } from "./Chip";

export const dynamic = "force-dynamic";

const MODELS = [
  { value: "mlx-community/whisper-large-v3-mlx", label: "large-v3 (máxima precisão)" },
  { value: "mlx-community/whisper-large-v3-turbo", label: "large-v3-turbo (mais rápido)" },
];

export default function ConfigPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-bg px-6 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="font-title text-[22px] font-medium tracking-[-0.01em] text-fg">Configurações</h1>
        <ConnectionCard />
        <SyncCard />
        <RadarCard />
        <GroupsCard />
        <TeamCard />
        <TranscriptionCard />
      </div>
    </div>
  );
}

/* ----------------------------- Conexão ----------------------------- */

const BADGES: Record<
  CollectorStatus["connection"],
  { label: string; dot: string }
> = {
  open: { label: "Conectado", dot: "bg-ok" },
  connecting: { label: "Conectando…", dot: "bg-accent" },
  qr: { label: "Aguardando QR", dot: "bg-info" },
  close: { label: "Desconectado", dot: "bg-danger" },
  logged_out: { label: "Sessão invalidada — gerando QR novo…", dot: "bg-danger" },
  unknown: { label: "Estado desconhecido", dot: "bg-fg-faint" },
  offline: { label: "Coletor offline", dot: "bg-fg-faint" },
};

function ConnectionCard() {
  const [status, setStatus] = useState<CollectorStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const data = (await res.json()) as CollectorStatus;
        if (alive) setStatus(data);
      } catch {
        /* coletor pode estar fora do ar */
      }
    };
    tick();
    const id = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const conn = status?.connection ?? "offline";
  const badge = BADGES[conn];

  return (
    <Card>
      <CardHeader title="Conexão" />
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${badge.dot}`} />
        <span className="text-fg">{badge.label}</span>
      </div>

      {conn === "offline" && (
        <p className="mt-2 text-sm text-fg-dim">
          O coletor não está rodando. Inicie com{" "}
          <code className="mono text-accent">npm run dev</code> na raiz do projeto.
        </p>
      )}

      {conn === "qr" && status?.qr && (
        <div className="mt-3">
          <p className="mb-2 text-sm text-fg-dim">
            No celular: <strong className="text-fg">WhatsApp › Aparelhos conectados › Conectar um
            aparelho</strong> e escaneie:
          </p>
          <QrImage value={status.qr} />
        </div>
      )}

      {conn === "open" && (
        <p className="mt-2 text-sm text-fg-dim">
          Monitorando {status?.watchedCount ?? 0}{" "}
          {status?.watchedCount === 1 ? "grupo" : "grupos"}.
        </p>
      )}
    </Card>
  );
}

function QrImage({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(value, { width: 240, margin: 1 })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [value]);

  if (!src) return <div className="mono text-sm text-fg-dim">gerando QR…</div>;
  // biome-ignore lint/performance/noImgElement: data URL local, next/image não cabe
  return (
    <img
      src={src}
      alt="QR code de pareamento"
      width={240}
      height={240}
      className="rounded-control border border-line bg-fg p-1"
    />
  );
}

/* ----------------------------- Grupos ----------------------------- */

function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function GroupsCard() {
  const [groups, setGroups] = useState<GroupWithTags[] | null>(null);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [onlyWatched, setOnlyWatched] = useState(false);

  useEffect(() => {
    fetch("/api/groups", { cache: "no-store" })
      .then((r) => r.json())
      .then((g: GroupWithTags[]) => setGroups(g))
      .catch(() => setGroups([]));
  }, []);

  const post = useCallback(async (body: object) => {
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setGroups((await res.json()) as GroupWithTags[]);
  }, []);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups ?? []) for (const t of g.tags) set.add(t);
    return [...set].sort();
  }, [groups]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return (groups ?? []).filter((g) => {
      if (onlyWatched && !g.watch) return false;
      if (activeTags.length && !activeTags.some((t) => g.tags.includes(t))) return false;
      if (q && !normalize(`${g.name} ${g.tags.join(" ")}`).includes(q)) return false;
      return true;
    });
  }, [groups, query, activeTags, onlyWatched]);

  if (groups === null) {
    return (
      <Card>
        <CardHeader title="Grupos monitorados" />
        <p className="mono text-sm text-fg-dim">Carregando…</p>
      </Card>
    );
  }
  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader title="Grupos monitorados" />
        <EmptyState
          title="Nenhum grupo ainda"
          description="Pareie o WhatsApp na seção acima — os grupos aparecem aqui automaticamente."
        />
      </Card>
    );
  }

  const watchedCount = groups.filter((g) => g.watch).length;

  return (
    <Card>
      <CardHeader title={`Grupos monitorados (${watchedCount}/${groups.length})`} />
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nome ou tag (ex.: Acme)"
        aria-label="Buscar grupos por nome ou tag"
        className="mb-2"
      />

      {allTags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {allTags.map((t) => {
            const on = activeTags.includes(t);
            return (
              <Chip
                key={t}
                active={on}
                onClick={() =>
                  setActiveTags((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t]))
                }
              >
                #{t}
              </Chip>
            );
          })}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-fg-dim">
        <label className="flex cursor-pointer items-center gap-2 select-none">
          <Toggle
            size="sm"
            checked={onlyWatched}
            onChange={setOnlyWatched}
            aria-label="Filtrar só grupos monitorados"
          />
          só monitorados
        </label>
        <span className="mono">
          {filtered.length} de {groups.length}
        </span>
        {filtered.length > 0 && (
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              onClick={() => post({ ids: filtered.map((g) => g.id), watch: true })}
            >
              Monitorar os {filtered.length}
            </Button>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => post({ ids: filtered.map((g) => g.id), watch: false })}
            >
              Parar
            </Button>
          </div>
        )}
      </div>

      <ul className="max-h-[440px] divide-y divide-line overflow-y-auto">
        {filtered.map((g) => (
          <GroupRow
            key={g.id}
            group={g}
            onWatch={(w) => post({ id: g.id, watch: w })}
            onTags={(tags) => post({ id: g.id, tags })}
          />
        ))}
        {filtered.length === 0 && (
          <li className="mono py-3 text-sm text-fg-dim">Nenhum grupo bate com o filtro.</li>
        )}
      </ul>
    </Card>
  );
}

function GroupRow({
  group,
  onWatch,
  onTags,
}: {
  group: GroupWithTags;
  onWatch: (watch: boolean) => void;
  onTags: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addTag() {
    const t = draft.trim().toLowerCase();
    setDraft("");
    if (t && !group.tags.includes(t)) onTags([...group.tags, t]);
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-fg">{group.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {group.tags.map((t) => (
            <Badge key={t}>
              #{t}
              <button
                type="button"
                onClick={() => onTags(group.tags.filter((x) => x !== t))}
                className="focus-ring rounded text-fg-faint transition-colors hover:text-danger"
                aria-label={`remover tag ${t}`}
              >
                ×
              </button>
            </Badge>
          ))}
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTag();
            }}
            onBlur={addTag}
            placeholder="+tag"
            aria-label={`adicionar tag em ${group.name}`}
            className="mono w-16 px-1.5 py-0.5 text-[10px]"
          />
        </div>
      </div>
      <Toggle
        checked={group.watch}
        onChange={onWatch}
        aria-label={`monitorar ${group.name}`}
      />
    </li>
  );
}

/* ----------------------------- Time ------------------------------- */

interface Contact {
  id: string;
  name: string;
  role: "team" | "client";
}

function TeamCard() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/team", { cache: "no-store" })
      .then((r) => r.json())
      .then((c: Contact[]) => setContacts(c))
      .catch(() => setContacts([]));
  }, []);

  async function toggle(id: string, team: boolean) {
    setContacts(
      (prev) => prev?.map((c) => (c.id === id ? { ...c, role: team ? "team" : "client" } : c)) ?? null,
    );
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, team }),
      });
      setContacts((await res.json()) as Contact[]);
    } catch {
      /* mantém otimista */
    }
  }

  const filtered = (contacts ?? []).filter(
    (c) => !query || c.name.toLowerCase().includes(query.toLowerCase()),
  );
  const teamCount = (contacts ?? []).filter((c) => c.role === "team").length;

  return (
    <Card>
      <CardHeader title={`Meu time (${teamCount})`} />
      <p className="mb-2 text-xs text-fg-dim">
        Marque quem é da sua equipe. Eu uso isso pra separar o que é do cliente do
        que é resposta de vocês nos resumos.
      </p>
      {contacts === null ? (
        <p className="mono text-sm text-fg-dim">Carregando…</p>
      ) : contacts.length === 0 ? (
        <EmptyState
          title="Ninguém ainda"
          description="Aparece aqui quem mandar mensagem nos grupos."
        />
      ) : (
        <>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pessoa…"
            aria-label="Buscar pessoa pelo nome"
            className="mb-2"
          />
          <ul className="max-h-[320px] divide-y divide-line overflow-y-auto">
            {filtered.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-fg">
                  <span className="truncate">{c.name}</span>
                  {c.role === "team" && <Badge variant="accent">time</Badge>}
                </span>
                <Toggle
                  checked={c.role === "team"}
                  onChange={(v) => toggle(c.id, v)}
                  aria-label={`marcar ${c.name} como time`}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/* -------------------------- Transcrição --------------------------- */

function TranscriptionCard() {
  const [settings, setSettings] = useState<PanelSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: PanelSettings) => setSettings(s))
      .catch(() => setSettings(null));
  }, []);

  async function save() {
    if (!settings) return;
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const next = (await res.json()) as PanelSettings;
    setSettings(next);
    setSaved(true);
  }

  if (!settings) {
    return (
      <Card>
        <CardHeader title="Transcrição" />
        <p className="mono text-sm text-fg-dim">Carregando…</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Transcrição" />
      <Field label="Modelo (MLX, local)" htmlFor="transcription-model" className="mb-3">
        <Select
          id="transcription-model"
          value={settings.model}
          onChange={(e) => {
            setSettings({ ...settings, model: e.target.value });
            setSaved(false);
          }}
        >
          {MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Idioma" htmlFor="transcription-language" className="mb-4">
        <Input
          id="transcription-language"
          value={settings.language}
          onChange={(e) => {
            setSettings({ ...settings, language: e.target.value });
            setSaved(false);
          }}
          className="w-32"
        />
      </Field>

      <div className="flex items-center gap-3">
        <Button onClick={save}>Salvar</Button>
        {saved && <span className="mono text-sm text-ok">Salvo ✓</span>}
      </div>
    </Card>
  );
}


/* ------------------------- Radar de sem-resposta ------------------------- */

function RadarCard() {
  const [ativo, setAtivo] = useState(false);
  const [dataCorte, setDataCorte] = useState("");
  const [prazo, setPrazo] = useState("120");
  const [cooldown, setCooldown] = useState("120");
  const [ultima, setUltima] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<number | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/radar", { cache: "no-store" });
        const data = (await res.json()) as {
          config?: {
            ativo?: boolean;
            dataCorte?: string | null;
            prazoMinimoMin?: number;
            digestCooldownMin?: number;
          };
          status?: { ultimaExecucao?: string | null; pendencias?: unknown[] } | null;
        };
        if (!alive) return;
        setAtivo(Boolean(data.config?.ativo));
        setDataCorte(data.config?.dataCorte ?? "");
        if (data.config?.prazoMinimoMin) setPrazo(String(data.config.prazoMinimoMin));
        if (data.config?.digestCooldownMin) setCooldown(String(data.config.digestCooldownMin));
        setUltima(data.status?.ultimaExecucao ?? null);
        setPendentes(data.status?.pendencias?.length ?? null);
      } catch {
        /* coletor fora do ar */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function salvar(proxAtivo?: boolean) {
    const body: Record<string, unknown> = {
      ativo: proxAtivo ?? ativo,
      dataCorte: dataCorte || null,
    };
    const p = Number(prazo);
    const c = Number(cooldown);
    if (Number.isFinite(p) && p >= 1) body.prazoMinimoMin = p;
    if (Number.isFinite(c) && c >= 1) body.digestCooldownMin = c;
    await fetch("/api/radar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2000);
  }

  return (
    <Card>
      <CardHeader title="Radar de sem-resposta" />
      <p className="mb-3 text-sm text-fg-dim">
        Avisa (WhatsApp no seu próprio chat + selo em Clientes) quando um cliente fica
        sem resposta além do prazo. Chats com última atividade anterior à data de corte
        ficam de fora.
      </p>

      <div className="mb-3 flex items-center gap-2">
        <Toggle
          size="sm"
          checked={ativo}
          onChange={(v) => {
            setAtivo(v);
            void salvar(v);
          }}
          aria-label="Ligar radar de sem-resposta"
        />
        <span className="text-sm text-fg-dim">{ativo ? "ligado" : "desligado"}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-sm text-fg-dim" htmlFor="radar-corte">
          considerar a partir de
          <Input
            id="radar-corte"
            type="date"
            value={dataCorte}
            onChange={(e) => setDataCorte(e.target.value)}
            className="w-40"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-dim" htmlFor="radar-prazo">
          cobrar após
          <Input
            id="radar-prazo"
            type="number"
            min={1}
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            className="w-20"
          />
          min
        </label>
        <label className="flex items-center gap-2 text-sm text-fg-dim" htmlFor="radar-cooldown">
          silêncio entre avisos
          <Input
            id="radar-cooldown"
            type="number"
            min={1}
            value={cooldown}
            onChange={(e) => setCooldown(e.target.value)}
            className="w-20"
          />
          min
        </label>
        <Button onClick={() => void salvar()}>{salvo ? "Salvo ✓" : "Salvar"}</Button>
      </div>

      {ultima && (
        <p className="mono mt-2 text-[10px] text-fg-faint">
          última varredura: {new Date(ultima).toLocaleString("pt-BR")}
          {pendentes !== null && ` · ${pendentes} aguardando`}
        </p>
      )}
    </Card>
  );
}

/* ------------------------- Sincronização ------------------------- */

function SyncCard() {
  const [intervalo, setIntervalo] = useState("15");
  const [ultima, setUltima] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/reconciler", { cache: "no-store" });
        const data = (await res.json()) as {
          intervaloMin?: number;
          status?: { ultimaExecucao?: string | null } | null;
        };
        if (!alive) return;
        if (data.intervaloMin) setIntervalo(String(data.intervaloMin));
        setUltima(data.status?.ultimaExecucao ?? null);
      } catch {
        /* coletor fora do ar */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function salvar() {
    const n = Number(intervalo);
    if (!Number.isFinite(n) || n < 1) return;
    await fetch("/api/reconciler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intervaloMin: n }),
    }).catch(() => {});
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2000);
  }

  return (
    <Card>
      <CardHeader title="Sincronização automática" />
      <p className="mb-3 text-sm text-fg-dim">
        De tempos em tempos o coletor confere nomes de grupo e busca buracos de
        histórico direto do WhatsApp. O botão &quot;agora&quot; fica na tela de Clientes.
      </p>
      <div className="flex items-center gap-2">
        <label className="text-sm text-fg-dim" htmlFor="sync-intervalo">
          A cada
        </label>
        <Input
          id="sync-intervalo"
          type="number"
          min={1}
          value={intervalo}
          onChange={(e) => setIntervalo(e.target.value)}
          className="w-20"
        />
        <span className="text-sm text-fg-dim">min</span>
        <Button onClick={() => void salvar()}>{salvo ? "Salvo ✓" : "Salvar"}</Button>
      </div>
      {ultima && (
        <p className="mono mt-2 text-[10px] text-fg-faint">
          última execução: {new Date(ultima).toLocaleString("pt-BR")}
        </p>
      )}
    </Card>
  );
}
