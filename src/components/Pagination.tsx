import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (size: number) => void;
  /** Noun for the info line, e.g. "عميل" — omitted when empty */
  itemLabel?: string;
  pageSizeOptions?: number[];
}

/**
 * The one unified pagination bar (styles: .pg-* in index.css — global,
 * so it can never load unstyled). Renders the info line + per-page
 * select always; the page stamps only when there is more than one page.
 * RTL: "first/prev" chevrons point right (toward the start).
 */
export function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemLabel = "",
  pageSizeOptions = [5, 10, 20, 50],
}: PaginationProps) {
  if (totalItems <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const page = Math.min(Math.max(1, currentPage), totalPages);
  const start = (page - 1) * itemsPerPage + 1;
  const end = Math.min(page * itemsPerPage, totalItems);

  // 1 … (page-1) page (page+1) … last
  const stamps: Array<number | "dots"> = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(totalPages - 1, page + 1);
  if (lo > 2) stamps.push("dots");
  for (let p = lo; p <= hi; p++) stamps.push(p);
  if (hi < totalPages - 1) stamps.push("dots");
  if (totalPages > 1) stamps.push(totalPages);

  return (
    <div className="pg-bar">
      <div className="pg-info">
        <span>
          عرض <b>{start.toLocaleString()}</b>–<b>{end.toLocaleString()}</b> من{" "}
          <b>{totalItems.toLocaleString()}</b> {itemLabel}
        </span>
        {onItemsPerPageChange && (
          <label className="pg-size">
            في الصفحة
            <select
              value={itemsPerPage}
              onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pg-pages">
          <button
            type="button"
            className="pg-btn"
            onClick={() => onPageChange(1)}
            disabled={page === 1}
            title="الأولى"
          >
            <ChevronsRight size={15} />
          </button>
          <button
            type="button"
            className="pg-btn"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            title="السابق"
          >
            <ChevronRight size={15} />
          </button>

          {stamps.map((p, i) =>
            p === "dots" ? (
              <span key={`d${i}`} className="pg-dots">
                …
              </span>
            ) : (
              <button
                type="button"
                key={p}
                className={`pg-btn pg-num ${p === page ? "pg-current" : ""}`}
                onClick={() => onPageChange(p)}
                disabled={p === page}
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            className="pg-btn"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            title="التالي"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            className="pg-btn"
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages}
            title="الأخيرة"
          >
            <ChevronsLeft size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
