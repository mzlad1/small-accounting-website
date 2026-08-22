/**
 * Arabic number-to-words (تفقيط) for receipt amounts.
 * numberToArabicWords(2550) → "ألفان وخمسمئة وخمسون"
 * amountToArabicWords(2550.25) → "ألفان وخمسمئة وخمسون شيقلاً وخمس وعشرون أغورة"
 */

const ONES = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];

const TENS = [
  "",
  "",
  "عشرون",
  "ثلاثون",
  "أربعون",
  "خمسون",
  "ستون",
  "سبعون",
  "ثمانون",
  "تسعون",
];

const HUNDREDS = [
  "",
  "مائة",
  "مائتان",
  "ثلاثمائة",
  "أربعمائة",
  "خمسمائة",
  "ستمائة",
  "سبعمائة",
  "ثمانمائة",
  "تسعمائة",
];

/** 1..999 */
function threeDigits(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;

  if (h > 0) parts.push(HUNDREDS[h]);

  if (rest > 0) {
    if (rest < 20) {
      parts.push(ONES[rest]);
    } else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      if (o > 0) {
        parts.push(`${ONES[o]} و${TENS[t]}`);
      } else {
        parts.push(TENS[t]);
      }
    }
  }

  return parts.join(" و");
}

/** Scale word for a group count (n ≥ 1). The suffix form follows the
    LAST spoken component (مئة ألف، خمسة آلاف، خمسة وعشرون ألفاً). */
function scaled(
  n: number,
  one: string,
  two: string,
  few: string,
  many: string
): string {
  if (n === 1) return one;
  if (n === 2) return two;
  const lastTwo = n % 100;
  let suffix: string;
  if (lastTwo >= 3 && lastTwo <= 10) {
    suffix = few;
  } else if (lastTwo >= 11) {
    suffix = many;
  } else {
    suffix = one; // round hundreds (and 1/2 compounds): مئة ألف
  }
  return `${threeDigits(n)} ${suffix}`;
}

export function numberToArabicWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return "صفر";
  if (n > 999_999_999_999) return String(n); // out of practical range

  const parts: string[] = [];

  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  if (billions > 0)
    parts.push(scaled(billions, "مليار", "ملياران", "مليارات", "ملياراً"));
  if (millions > 0)
    parts.push(scaled(millions, "مليون", "مليونان", "ملايين", "مليوناً"));
  if (thousands > 0)
    parts.push(scaled(thousands, "ألف", "ألفان", "آلاف", "ألفاً"));
  if (rest > 0) parts.push(threeDigits(rest));

  return parts.join(" و");
}

/** Full amount phrase: shekels + agorot (2 decimals). */
export function amountToArabicWords(amount: number): string {
  const abs = Math.abs(amount);
  const whole = Math.floor(abs);
  const fraction = Math.round((abs - whole) * 100);

  const parts: string[] = [];
  if (whole > 0 || fraction === 0) {
    parts.push(`${numberToArabicWords(whole)} شيقل`);
  }
  if (fraction > 0) {
    parts.push(`${numberToArabicWords(fraction)} أغورة`);
  }
  return parts.join(" و");
}

/** Currency-neutral words for receipt templates (the template supplies
    the currency word): 2500.25 → "ألفان وخمسمائة و25/100". */
export function amountWords(amount: number): string {
  const abs = Math.abs(amount);
  const whole = Math.floor(abs);
  const fraction = Math.round((abs - whole) * 100);
  let words = numberToArabicWords(whole);
  if (fraction > 0) {
    words += ` و${fraction}/100`;
  }
  return words;
}
