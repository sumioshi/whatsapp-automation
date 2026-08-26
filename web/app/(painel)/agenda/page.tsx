import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "@/lib/paths";
import { AgendaSetup } from "./AgendaSetup";

export const dynamic = "force-dynamic";

/**
 * Embed do Google Calendar do operador. O ID da agenda vive em
 * data/agenda.config.json (volume) — nada de e-mail no repositório. O iframe
 * renderiza com a sessão Google do PRÓPRIO navegador: agenda privada aparece
 * só pra quem tem acesso.
 */
export default async function AgendaPage() {
  let calendario: string | null = null;
  try {
    const cfg = JSON.parse(
      await readFile(join(DATA_DIR, "agenda.config.json"), "utf8"),
    ) as { calendario?: string };
    calendario = cfg.calendario ?? null;
  } catch {
    /* sem config ainda */
  }

  if (!calendario) return <AgendaSetup />;

  const src = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendario)}&ctz=America%2FSao_Paulo&mode=WEEK&showTitle=0&showPrint=0`;
  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <iframe
        src={src}
        title="Google Calendar"
        className="min-h-0 flex-1 rounded-card border border-line bg-white"
      />
    </div>
  );
}
