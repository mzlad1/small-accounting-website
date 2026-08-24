import { ReactNode } from "react";
import { RotateCcw, Search, SortAsc, SortDesc, X } from "lucide-react";

/**
 * The one unified filters bar (styles: .fx-* in index.css — global, so
 * they can never load unstyled). Every control is exactly 40px tall and
 * bottom-aligned, so the bar can never break its baseline again.
 *
 * A field whose value differs from its default gets `fx-active`
 * (terracotta label + border) so the user can see at a glance which
 * filters are narrowing the data.
 */
export function FiltersBar({
  children,
  onClear,
}: {
  children: ReactNode;
  onClear?: () => void;
}) {
  return (
    <div className="fx-bar">
      {children}
      {onClear && (
        <button type="button" className="fx-clear" onClick={onClear}>
          <RotateCcw size={14} />
          مسح الفلاتر
        </button>
      )}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = "بحث...",
  label = "بحث",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className={`fx-field fx-search ${value ? "fx-active" : ""}`}>
      <label className="fx-label">{label}</label>
      <div className="fx-search-box">
        <Search size={15} className="fx-search-icon" />
        <input
          type="text"
          className="fx-control"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        {value && (
          <button
            type="button"
            className="fx-search-clear"
            onClick={() => onChange("")}
            title="مسح البحث"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** First option is treated as the "all/default" state */
  options: Array<{ value: string; label: string }>;
}) {
  const active = options.length > 0 && value !== options[0].value;
  return (
    <div className={`fx-field ${active ? "fx-active" : ""}`}>
      <label className="fx-label">{label}</label>
      <select
        className="fx-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={`fx-field fx-date ${value ? "fx-active" : ""}`}>
      <label className="fx-label">{label}</label>
      <input
        type="date"
        className="fx-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function SortControl({
  label = "ترتيب حسب",
  value,
  onChange,
  options,
  order,
  onToggleOrder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  order: "asc" | "desc";
  onToggleOrder: () => void;
}) {
  return (
    <div className="fx-field fx-sort">
      <label className="fx-label">{label}</label>
      <div className="fx-sort-row">
        <select
          className="fx-control"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="fx-control fx-sort-toggle"
          onClick={onToggleOrder}
          title={order === "asc" ? "ترتيب تصاعدي" : "ترتيب تنازلي"}
        >
          {order === "asc" ? <SortAsc size={15} /> : <SortDesc size={15} />}
        </button>
      </div>
    </div>
  );
}

/** Wrapper for custom controls (searchable dropdowns…) so they align
 *  with the rest of the bar. The child should size itself to 40px. */
export function FilterField({
  label,
  children,
  active = false,
  grow = false,
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
  grow?: boolean;
}) {
  return (
    <div
      className={`fx-field ${grow ? "fx-search" : ""} ${
        active ? "fx-active" : ""
      }`}
    >
      <label className="fx-label">{label}</label>
      {children}
    </div>
  );
}
