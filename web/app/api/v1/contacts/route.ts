import { NextResponse } from "next/server";
import { preflight, respostaOk, rota } from "@/lib/api-v1";
import { buildContacts, dmJidOf, nameOf, roleOf, type Role } from "@/lib/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quem já apareceu nas conversas, com o jid de DM quando o telefone é conhecido. */
export const GET = rota("read", async ({ req }) => {
  const url = new URL(req.url);
  const busca = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const contatos = await buildContacts();
  const vistos = new Set<string>();
  const saida: Array<{
    number: string;
    jid: string | null;
    name: string;
    role: Exclude<Role, "me">;
    dmReady: boolean;
  }> = [];

  for (const [id] of contatos.names.entries()) {
    if (contatos.ownIds.has(id) || !/^\d+$/.test(id)) continue;
    const jid = dmJidOf(contatos, id);
    const chave = jid ?? `lid:${id}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const name = nameOf(contatos, id);
    if (busca && !name.toLowerCase().includes(busca) && !id.includes(busca)) continue;
    saida.push({
      number: jid ? (jid.split("@")[0] ?? id) : id,
      jid,
      name,
      role: roleOf(contatos, id) as Exclude<Role, "me">,
      dmReady: jid !== null,
    });
  }
  saida.sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  return respostaOk(saida);
});

export const OPTIONS = (req: Request): NextResponse => preflight(req);
