/**
 * Receipt (سند قبض) template engine — PLAIN TEXT templates.
 *
 * The user writes ordinary Arabic text (no HTML). Variables are
 * {{اسم_المتغير}} placeholders — inserted via chips in the editor —
 * and every variable automatically becomes an input field in the
 * new-receipt dialog. The engine handles all styling: first line
 * becomes the centered title, substituted values print bold.
 *
 * Automatic variables:
 *   رقم_السند   — sequential number, assigned on save
 *   المبلغ_كتابة — Arabic words for المبلغ (currency-neutral; the
 *                  template supplies the currency word after it)
 */

/** Variables filled by the system, not typed by the user. */
export const AUTO_VARIABLES = ["رقم_السند", "المبلغ_كتابة"];

/** Variables that get special input treatment in the dialog. */
export const DATE_VARIABLES = ["التاريخ"];
export const AMOUNT_VARIABLES = ["المبلغ"];
export const CUSTOMER_VARIABLES = ["اسم_العميل"];

/** Sensible prefills for common variables. */
export const DEFAULT_VALUES: Record<string, string> = {
  العملة: "دولار",
  طريقة_الدفع: "نقداً",
};

/** Standard variables offered as insert-chips in the editor. */
export const STANDARD_VARIABLES = [
  "رقم_السند",
  "التاريخ",
  "اسم_العميل",
  "هوية_العميل",
  "المبلغ",
  "المبلغ_كتابة",
  "العملة",
  "البيان",
  "اسم_المستلم",
  "هوية_المستلم",
  "اسم_الشاهد",
];

export function extractVariables(template: string): string[] {
  const found: string[] = [];
  const re = /\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (!found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A template saved by the old HTML-based editor. */
export function isLegacyHtmlTemplate(template: string): boolean {
  return /<\s*[a-z]/i.test(template);
}

interface RenderOptions {
  /** Editor preview: show variable names highlighted instead of values */
  highlightVariables?: boolean;
}

/** Render the plain-text template into styled receipt HTML. */
export function renderTemplate(
  template: string,
  values: Record<string, string>,
  options: RenderOptions = {}
): string {
  // Substitute AFTER escaping, so user text can never inject markup
  let text = escapeHtml(template);
  text = text.replace(/\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g, (_, name) => {
    if (options.highlightVariables) {
      return `<mark>${escapeHtml(name)}</mark>`;
    }
    const v = values[name];
    return v !== undefined && v !== ""
      ? `<strong>${escapeHtml(v)}</strong>`
      : "<strong>................</strong>";
  });

  // Paragraphs: blank lines separate; the first line is the title
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const [first, ...rest] = paragraphs;
  const titleHtml = first
    ? `<div class="rc-title">${first.replace(/\n/g, "<br>")}</div>`
    : "";
  // A paragraph whose every line contains "|" renders as centered
  // side-by-side columns (e.g. signature blocks: شاهد | التوقيع)
  const renderParagraph = (par: string): string => {
    const lines = par.split("\n");
    if (lines.length > 0 && lines.every((l) => l.includes("|"))) {
      const rows = lines.map((l) => l.split("|").map((c) => c.trim()));
      const colCount = Math.max(...rows.map((r) => r.length));
      const cols: string[] = [];
      for (let c = 0; c < colCount; c++) {
        cols.push(
          `<div class="rc-col">${rows
            .map((r) => r[c] || "")
            .join("<br>")}</div>`
        );
      }
      return `<div class="rc-cols">${cols.join("")}</div>`;
    }
    return `<p class="rc-p">${par.replace(/\n/g, "<br>")}</p>`;
  };

  const bodyHtml = rest.map(renderParagraph).join("\n");

  return `<div class="receipt-doc">${titleHtml}\n${bodyHtml}</div>`;
}

/** The document chrome shared by preview and print. */
export const RECEIPT_DOC_CSS = `
  .receipt-doc {
    max-width: 720px;
    margin: 0 auto;
    border: 2px solid #221c15;
    border-radius: 8px;
    padding: 36px 40px;
    font-size: 17px;
    line-height: 2.3;
    color: #221c15;
    text-align: justify;
  }
  .receipt-doc .rc-title {
    text-align: center;
    font-size: 26px;
    font-weight: bold;
    margin-bottom: 24px;
    letter-spacing: 1px;
  }
  .receipt-doc .rc-title::after {
    content: "";
    display: block;
    width: 90px;
    height: 3px;
    background: #221c15;
    margin: 10px auto 0;
  }
  .receipt-doc .rc-p {
    margin: 0 0 14px;
  }
  .receipt-doc strong {
    font-weight: bold;
  }
  .receipt-doc mark {
    background: #f6e7dc;
    color: #8f3e1b;
    border-radius: 3px;
    padding: 0 5px;
    font-weight: 600;
  }
  .receipt-doc .rc-cols {
    display: flex;
    justify-content: center;
    gap: 96px;
    text-align: center;
    margin-top: 40px;
  }
  .receipt-doc .rc-col {
    min-width: 140px;
  }
`;

/** Wrap rendered content in a standalone printable document. */
export function buildPrintDocument(rendered: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>سند قبض</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 24px; direction: rtl; background: #fff; color: #221c15; }
  @media print { body { margin: 0; padding: 12px; } }
  ${RECEIPT_DOC_CSS}
</style>
</head>
<body>
${rendered}
</body>
</html>`;
}

export const DEFAULT_TEMPLATE = `سند قبض

رقم السند: {{رقم_السند}}

أنا الموقع اسمي أدناه {{اسم_المستلم}} حامل هوية رقم ({{هوية_المستلم}})، أقر بموجب هذا السند باستلام مبلغ وقدره ({{المبلغ}}) {{المبلغ_كتابة}} {{العملة}} نقداً من السيد {{اسم_العميل}} حامل هوية رقم ({{هوية_العميل}})، وذلك دفعة عن {{البيان}} مزامنة مع تاريخ توقيع هذا السند.

حرراً في {{التاريخ}}

شاهد | التوقيع
{{اسم_الشاهد}} | {{اسم_المستلم}}`;
