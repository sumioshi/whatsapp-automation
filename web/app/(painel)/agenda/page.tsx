import { estadoAgenda } from "@/lib/google/calendario";
import type { EstadoAgenda } from "@/lib/google/evento";
import { AgendaView } from "./AgendaView";

export const dynamic = "force-dynamic";

/**
 * Agenda própria do painel, ligada ao Google do operador pelo servidor: não
 * depende de cookie de terceiros no navegador nem de iframe do Google.
 */
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  let estado: EstadoAgenda;
  let aviso = typeof sp.erro === "string" ? sp.erro : null;
  try {
    estado = await estadoAgenda();
  } catch {
    estado = { configurado: true, conectado: true, email: null, agendas: [] };
    aviso = "google_indisponivel";
  }
  return <AgendaView inicial={estado} aviso={aviso} />;
}
