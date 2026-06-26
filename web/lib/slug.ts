// Mesma lógica do slug do coletor (src/storage/paths.ts) — precisa bater para
// abrir a pasta certa do grupo (data/<slug>/).
const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "sem-nome";
}
