// Storage-cost control: downscale + re-encode images in the browser
// before upload. Phone photos arrive at 3–10MB; at 1600px / JPEG 0.82
// they land around 150–400KB with no visible loss at the sizes the app
// displays. Non-images, SVGs, GIFs (animation) and already-small files
// pass through untouched — and any failure falls back to the original,
// so compression can never block an upload.

const MAX_EDGE = 1600;
const QUALITY = 0.82;
const SKIP_UNDER = 250 * 1024;

// Uploaded files get unique, timestamped names — they never change, so
// browsers may cache them forever. This kills repeat download traffic
// (egress is the expensive part of Storage, not the bytes at rest).
export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;
  if (file.size <= SKIP_UNDER) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(bitmap.width, bitmap.height)
    );
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    // Keep whichever is smaller — tiny PNGs can re-encode larger
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
