import { relativeLabel } from "@/lib/sla";

/** "há 12min", "há 3 dias" a partir de um instante ISO; inválido vira travessão. Só no cliente (usa o relógio). */
export function haQuanto(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : relativeLabel(Math.max(0, Date.now() - t));
}
