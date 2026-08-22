/**
 * Any-field search with Arabic-aware normalization.
 *
 * `matchesSearch(item, term)` is true when EVERY word of `term` occurs
 * somewhere in the item's values — strings, numbers, and one level of
 * nested objects/arrays. Arabic text is normalized on both sides
 * (hamza forms unified, ta marbuta/alef maqsura folded, diacritics and
 * tatweel stripped), so searching "احمد" finds "أَحْمَد".
 */

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "") // harakat + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");

const collectValues = (value: unknown, depth: number, out: string[]): void => {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    if (value) out.push(value);
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) out.push(String(value));
    return;
  }
  if (depth <= 0) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectValues(entry, depth - 1, out);
    return;
  }
  if (typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectValues(entry, depth - 1, out);
    }
  }
};

/** Build the searchable haystack for an item (memo-free; cheap enough
    for list filtering). */
const haystackOf = (item: unknown): string => {
  const parts: string[] = [];
  collectValues(item, 2, parts);
  return normalizeText(parts.join("  "));
};

export function matchesSearch(item: unknown, term: string): boolean {
  const trimmed = (term || "").trim();
  if (!trimmed) return true;
  const words = normalizeText(trimmed).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = haystackOf(item);
  return words.every((word) => haystack.includes(word));
}
