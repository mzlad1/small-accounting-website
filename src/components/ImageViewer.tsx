import { useEffect, useState } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import React from "react";

interface ImageViewerProps {
  images: string[];
  index: number;
  onClose: () => void;
}

/** Full-screen image lightbox: click outside or Escape closes,
    arrows / chevron buttons navigate (RTL-aware). */
export function ImageViewer({ images, index, onClose }: ImageViewerProps) {
  const [current, setCurrent] = useState(index);

  const prev = () =>
    setCurrent((c) => (c - 1 + images.length) % images.length);
  const next = () => setCurrent((c) => (c + 1) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // RTL: forward reads to the left
      if (e.key === "ArrowLeft") next();
      if (e.key === "ArrowRight") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, images.length]);

  if (!images[current]) {
    return null;
  }

  return (
    <div className="image-viewer-overlay" onClick={onClose}>
      <button
        type="button"
        className="image-viewer-close"
        onClick={onClose}
        aria-label="إغلاق"
      >
        <X size={22} />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="image-viewer-nav image-viewer-prev"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="الصورة السابقة"
          >
            <ChevronRight size={26} />
          </button>
          <button
            type="button"
            className="image-viewer-nav image-viewer-next"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="الصورة التالية"
          >
            <ChevronLeft size={26} />
          </button>
        </>
      )}

      <img
        className="image-viewer-img"
        src={images[current]}
        alt={`صورة ${current + 1}`}
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <div className="image-viewer-counter">
          {current + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
