import { useState } from "react";
import { Copy, Check } from "lucide-react";
import React from "react";

const isUrl = (v: string) => /^https?:\/\//i.test((v || "").trim());

interface LocationValueProps {
  value: string;
}

/** Renders a location field: plain text stays text, URLs become a
    truncated clickable link with a copy button. */
export function LocationValue({ value }: LocationValueProps) {
  const [copied, setCopied] = useState(false);

  if (!isUrl(value)) {
    return <span className="location-text">{value}</span>;
  }

  const url = value.trim();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (e.g. non-secure context) */
    }
  };

  return (
    <span className="location-value">
      <a
        className="location-link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
      >
        {url}
      </a>
      <button
        type="button"
        className="location-copy-btn"
        onClick={handleCopy}
        title="نسخ الرابط"
        aria-label="نسخ الرابط"
      >
        {copied ? (
          <Check size={14} className="location-copied-icon" />
        ) : (
          <Copy size={14} />
        )}
      </button>
    </span>
  );
}
