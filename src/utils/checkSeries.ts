/**
 * Check-series generation: from a first check number + first due date,
 * build N checks with auto-incremented numbers and stepped dates —
 * for entering a series of post-dated checks in one go.
 */

export type SeriesInterval = "month" | "two-weeks" | "week";

/** Increment the LAST run of digits in a check number, preserving
    leading zeros (e.g. "000123" + 1 → "000124", "AB-099" → "AB-100"). */
export function incrementCheckNumber(value: string, step: number): string {
  const match = value.match(/(\d+)(?!.*\d)/);
  if (!match || match.index === undefined) return value;
  const digits = match[1];
  const next = String(Number(digits) + step).padStart(digits.length, "0");
  return (
    value.slice(0, match.index) + next + value.slice(match.index + digits.length)
  );
}

/** Local-timezone-safe yyyy-mm-dd stepping. Months clamp to the last
    day (31 Jan + شهر → 28/29 Feb). */
export function addInterval(
  dateStr: string,
  unit: SeriesInterval,
  steps: number
): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  if (unit === "month") {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + steps);
    const lastDay = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0
    ).getDate();
    date.setDate(Math.min(day, lastDay));
  } else {
    date.setDate(date.getDate() + steps * (unit === "week" ? 7 : 14));
  }

  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export interface SeriesEntry {
  checkNumber: string;
  dueDate: string;
}

/** Build the full series, first check included. */
export function buildCheckSeries(
  firstNumber: string,
  firstDate: string,
  count: number,
  unit: SeriesInterval
): SeriesEntry[] {
  const entries: SeriesEntry[] = [];
  for (let i = 0; i < count; i++) {
    entries.push({
      checkNumber: incrementCheckNumber(firstNumber, i),
      dueDate: addInterval(firstDate, unit, i),
    });
  }
  return entries;
}
