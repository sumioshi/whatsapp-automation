import { NextResponse } from "next/server";
import {
  buildContacts,
  dmJidOf,
  nameOf,
  roleOf,
  type Role,
} from "@/lib/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ContactEntry {
  /** Número limpo (só dígitos). Telefone real quando conhecido; senão o id (LID). */
  number: string;
  /** JID de DM pronto pra envio, ou null quando o telefone não foi resolvido. */
  jid: string | null;
  /** Nome resolvido (pushName/notify ou número se desconhecido). */
  name: string;
  /** Papel na conversa: "team" | "client" (nunca "me" — a própria conta é excluída). */
  role: Exclude<Role, "me">;
  /** True quando há um telefone real → DM pode ser enviada com segurança. */
  dmReady: boolean;
}

export async function GET() {
  try {
    const contacts = await buildContacts();
    const entries: ContactEntry[] = [];
    // Dedup: o sidecar indexa a mesma pessoa por LID e por telefone — colapsa
    // pelo destino de DM (ou pelo id quando não há telefone resolvido).
    const seen = new Set<string>();

    for (const [id] of contacts.names.entries()) {
      // Exclui a própria conta.
      if (contacts.ownIds.has(id)) continue;
      // Ids sem dígitos (sistema, etc.) — pula.
      if (!id || !/^\d+$/.test(id)) continue;

      const jid = dmJidOf(contacts, id); // telefone real, ou null se só LID
      const dmReady = jid !== null;
      // Número exibido: telefone real quando houver, senão o próprio id.
      const number = jid ? (jid.split("@")[0] ?? id) : id;

      const dedupKey = jid ?? `lid:${id}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const role = roleOf(contacts, id) as Exclude<Role, "me">;
      entries.push({ number, jid, name: nameOf(contacts, id), role, dmReady });
    }

    // Ordena: DM-prontos primeiro, depois time vs cliente, depois por nome.
    entries.sort((a, b) => {
      if (a.dmReady !== b.dmReady) return a.dmReady ? -1 : 1;
      if (a.role !== b.role) return a.role === "team" ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    });

    return NextResponse.json(entries);
  } catch {
    return NextResponse.json(
      { error: "Erro ao carregar contatos" },
      { status: 500 },
    );
  }
}
