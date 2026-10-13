import { NovaConversa } from "./NovaConversa";

export const dynamic = "force-dynamic";

/** `?modo=contato` abre direto em Contato (item "Contatos" do menu da conta e do ⌘K). */
export default async function NovoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <NovaConversa modo={sp.modo === "contato" ? "contato" : "grupo"} />;
}
