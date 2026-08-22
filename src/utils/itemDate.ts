/**
 * Order-item date handling with legacy migration.
 *
 * Historically the الوحدة (unit) field was used to store dates typed as
 * "20/8/2026". Items now carry a proper `itemDate` (yyyy-mm-dd); these
 * helpers read new data, parse legacy unit-dates transparently, and
 * leave genuinely non-date unit text displayed as-is.
 */

interface DatedItem {
  itemDate?: string;
  unit?: string;
}

/** "20/8/2026" (also 20-8-2026 / 20.8.2026) → "2026-08-20", else null */
export function parseLegacyDmy(value: string | undefined | null): string | null {
  if (!value) return null;
  const m = String(value)
    .trim()
    .match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** ISO date for an item: real itemDate, else parsed legacy unit. */
export function getItemDateIso(item: DatedItem): string {
  return item.itemDate || parseLegacyDmy(item.unit) || "";
}

/** Display string: dd/mm/yyyy; unparseable legacy text shown as-is. */
export function formatItemDate(item: DatedItem): string {
  const iso = getItemDateIso(item);
  if (iso) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  return item.unit || "—";
}
