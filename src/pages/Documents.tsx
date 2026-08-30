import { useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  Download,
  Eye,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HardDrive,
  Plus,
  ScrollText,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  DocumentData,
  QuerySnapshot,
} from "firebase/firestore";
import {
  deleteObject,
  getBlob,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { db, storage } from "../config/firebase";
import { subscribeAll } from "../utils/live";
import { matchesSearch } from "../utils/search";
import { Pagination } from "../components/Pagination";
import {
  FiltersBar,
  SearchField,
  SelectField,
  SortControl,
} from "../components/Filters";
import "./Documents.css";

interface DocRecord {
  id: string;
  name: string;
  ext: string;
  kind: "pdf" | "image" | "md" | "text" | "other";
  size: number;
  contentType: string;
  storagePath: string;
  downloadURL: string;
  notes?: string;
  uploadedAt: string;
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"];
const TEXT_EXTS = ["txt", "log", "json", "csv"];

const getExt = (name: string) => {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
};

const kindOf = (ext: string): DocRecord["kind"] => {
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTS.includes(ext)) return "image";
  if (ext === "md" || ext === "markdown") return "md";
  if (TEXT_EXTS.includes(ext)) return "text";
  return "other";
};

// Browsers leave file.type empty for md and some others — fill in a
// sensible content type so the archive copy serves correctly.
const contentTypeFor = (file: File, ext: string) => {
  if (file.type) return file.type;
  const map: Record<string, string> = {
    pdf: "application/pdf",
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    log: "text/plain",
    json: "application/json",
    csv: "text/csv",
    svg: "image/svg+xml",
  };
  return map[ext] || "application/octet-stream";
};

const formatSize = (bytes: number) => {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB") : "—";

const iconFor = (ext: string) => {
  if (ext === "pdf") return FileText;
  if (IMAGE_EXTS.includes(ext)) return FileImage;
  if (ext === "md" || ext === "markdown") return FileCode;
  if (TEXT_EXTS.includes(ext)) return ScrollText;
  if (["xlsx", "xls"].includes(ext)) return FileSpreadsheet;
  if (["doc", "docx"].includes(ext)) return FileText;
  if (["zip", "rar", "7z"].includes(ext)) return FileArchive;
  return File;
};

// Minimal, safe markdown rendering: everything is HTML-escaped first,
// then headings / lists / bold / italic / code / http(s) links only.
function mdToHtml(src: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(
        /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      );
  const lines = src.split(/\r?\n/);
  const out: string[] = [];
  let inCode = false;
  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      closeList();
      out.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      out.push(esc(line));
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(esc(h[2]))}</h${level}>`);
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${inline(esc(ul[1]))}</li>`);
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${inline(esc(ol[1]))}</li>`);
      continue;
    }
    if (line.trim() === "") {
      closeList();
      continue;
    }
    closeList();
    out.push(`<p>${inline(esc(line))}</p>`);
  }
  closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

const KIND_OPTIONS = [
  { value: "all", label: "جميع الأنواع" },
  { value: "pdf", label: "PDF" },
  { value: "image", label: "صور" },
  { value: "md", label: "Markdown" },
  { value: "text", label: "ملفات نصية" },
  { value: "other", label: "أخرى" },
];

export function Documents() {
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [sortBy, setSortBy] = useState({
    field: "uploadedAt",
    order: "desc" as "asc" | "desc",
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  // Upload dialog
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Viewer
  const [viewerDoc, setViewerDoc] = useState<DocRecord | null>(null);
  const [viewerText, setViewerText] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  // Delete (typed موافق)
  const [docToDelete, setDocToDelete] = useState<DocRecord | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const applySnapshots = (snapshots: Array<QuerySnapshot<DocumentData>>) => {
    const [snap] = snapshots;
    const data: DocRecord[] = [];
    snap.forEach((d) => {
      data.push({ id: d.id, ...d.data() } as DocRecord);
    });
    setDocs(data);
  };

  useEffect(() => {
    setLoading(true);
    // Live subscription: instant paint from the persistent cache, then
    // the server, then every later change (own writes appear at once).
    const unsubscribe = subscribeAll(
      [query(collection(db, "documents"), orderBy("uploadedAt", "desc"))],
      applySnapshots,
      () => setLoading(false),
      (error) => console.error("Error fetching documents:", error)
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Upload dialog: focus the file picker on open (rapid-entry convention)
  useEffect(() => {
    if (showUpload) {
      setUploadSuccess(false);
      setTimeout(() => fileInputRef.current?.focus(), 60);
    }
  }, [showUpload]);

  // Filter + sort (always BEFORE the pagination slice)
  const filtered = docs.filter(
    (d) =>
      (kindFilter === "all" || d.kind === kindFilter) &&
      matchesSearch(d, searchTerm)
  );

  const sorted = [...filtered].sort((a, b) => {
    let comparison = 0;
    switch (sortBy.field) {
      case "name":
        comparison = (a.name || "").localeCompare(b.name || "", "ar");
        break;
      case "size":
        comparison = (a.size || 0) - (b.size || 0);
        break;
      case "ext":
        comparison = (a.ext || "").localeCompare(b.ext || "");
        break;
      case "uploadedAt":
      default:
        comparison = (a.uploadedAt || "").localeCompare(b.uploadedAt || "");
        break;
    }
    return sortBy.order === "asc" ? comparison : -comparison;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, kindFilter, sortBy]);

  const pageDocs = sorted.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // KPIs (on the full list, never the page slice)
  const totalSize = docs.reduce((sum, d) => sum + (d.size || 0), 0);
  const now = new Date();
  const thisMonthCount = docs.filter((d) => {
    const dt = new Date(d.uploadedAt);
    return (
      dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth()
    );
  }).length;

  const handleSort = (field: string) => {
    setSortBy((prev) => ({
      field,
      order: prev.field === field && prev.order === "desc" ? "asc" : "desc",
    }));
  };

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setUploadFiles((prev) => [...prev, ...Array.from(list)]);
  };

  const handleUpload = async () => {
    if (uploading || uploadFiles.length === 0) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: uploadFiles.length });
    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        const ext = getExt(file.name);
        const safeName = file.name.replace(/[/\\#?]/g, "_");
        const storagePath = `documents/${Date.now()}_${i}_${safeName}`;
        const contentType = contentTypeFor(file, ext);
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file, {
          contentType,
          // inline so the viewer (pdf iframe / images) renders instead
          // of forcing a download
          contentDisposition: "inline",
        });
        const downloadURL = await getDownloadURL(storageRef);
        await addDoc(collection(db, "documents"), {
          name: file.name,
          ext,
          kind: kindOf(ext),
          size: file.size,
          contentType,
          storagePath,
          downloadURL,
          notes: uploadNotes.trim(),
          uploadedAt: new Date().toISOString(),
        });
        setUploadProgress({ done: i + 1, total: uploadFiles.length });
      }
      // Rapid entry: stay open, confirm inline, clear the selection
      setUploadFiles([]);
      setUploadNotes("");
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 2500);
      setTimeout(() => fileInputRef.current?.focus(), 60);
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error uploading documents:", error);
      alert("حدث خطأ أثناء رفع الملفات");
    } finally {
      setUploading(false);
    }
  };

  const openViewer = async (d: DocRecord) => {
    setViewerDoc(d);
    setViewerText(null);
    if (d.kind === "md" || d.kind === "text") {
      setViewerLoading(true);
      try {
        const res = await fetch(d.downloadURL);
        setViewerText(await res.text());
      } catch (error) {
        console.error("Error loading document text:", error);
        setViewerText(null);
      } finally {
        setViewerLoading(false);
      }
    }
  };

  const handleDownload = async (d: DocRecord) => {
    try {
      const blob = await getBlob(ref(storage, d.storagePath));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = d.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading document:", error);
      alert("حدث خطأ أثناء تنزيل الملف");
    }
  };

  const confirmDelete = async () => {
    if (!docToDelete || deleting || deleteConfirmText.trim() !== "موافق")
      return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "documents", docToDelete.id));
      if (docToDelete.storagePath) {
        try {
          await deleteObject(ref(storage, docToDelete.storagePath));
        } catch {
          // the stored file may already be gone — the record removal matters
        }
      }
      setDocToDelete(null);
      setDeleteConfirmText("");
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error deleting document:", error);
      alert("حدث خطأ أثناء حذف المستند");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="documents-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل المستندات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="documents-container">
      {/* Header */}
      <div className="doc-header">
        <div className="header-content">
          <h1>المستندات</h1>
          <p>أرشيف الملفات: عرض وتنزيل وتنظيم المستندات</p>
        </div>
        <button className="btn-primary" onClick={() => setShowUpload(true)}>
          <Plus size={16} />
          رفع مستندات
        </button>
      </div>

      {/* KPIs */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-icon">
            <FolderOpen />
          </div>
          <div className="summary-content">
            <h3 className="summary-title">عدد المستندات</h3>
            <p className="summary-amount">{docs.length}</p>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">
            <HardDrive />
          </div>
          <div className="summary-content">
            <h3 className="summary-title">الحجم الكلي</h3>
            <p className="summary-amount">{formatSize(totalSize)}</p>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">
            <UploadCloud />
          </div>
          <div className="summary-content">
            <h3 className="summary-title">مستندات هذا الشهر</h3>
            <p className="summary-amount">{thisMonthCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FiltersBar
        onClear={() => {
          setSearchTerm("");
          setKindFilter("all");
        }}
      >
        <SearchField value={searchTerm} onChange={setSearchTerm} />
        <SelectField
          label="النوع"
          value={kindFilter}
          onChange={setKindFilter}
          options={KIND_OPTIONS}
        />
        <SortControl
          value={sortBy.field}
          onChange={(field) => {
            if (field !== sortBy.field) handleSort(field);
          }}
          options={[
            { value: "uploadedAt", label: "تاريخ الرفع" },
            { value: "name", label: "الاسم" },
            { value: "size", label: "الحجم" },
            { value: "ext", label: "النوع" },
          ]}
          order={sortBy.order}
          onToggleOrder={() => handleSort(sortBy.field)}
        />
      </FiltersBar>

      {/* Document cards */}
      {filtered.length === 0 ? (
        <div className="doc-empty">
          <FolderOpen size={34} color="#D8CDBB" />
          <p>
            {searchTerm || kindFilter !== "all"
              ? "لا توجد نتائج للبحث"
              : "لا توجد مستندات بعد — ارفع أول ملف"}
          </p>
        </div>
      ) : (
        <div className="doc-grid">
          {pageDocs.map((d) => {
            const Icon = iconFor(d.ext);
            return (
              <div
                key={d.id}
                className="doc-card"
                onClick={(e) => {
                  if (
                    (e.target as HTMLElement).closest(
                      "button, a, input, select"
                    )
                  )
                    return;
                  openViewer(d);
                }}
              >
                <div className="doc-card-top">
                  <span className={`doc-plate doc-plate-${d.kind}`}>
                    <Icon size={22} />
                  </span>
                  <span className="doc-ext">
                    {(d.ext || "ملف").toUpperCase()}
                  </span>
                </div>
                <h3 className="doc-name" title={d.name}>
                  {d.name}
                </h3>
                {d.notes && <div className="doc-notes">{d.notes}</div>}
                <div className="doc-meta">
                  <span>{formatSize(d.size)}</span>
                  <span className="doc-meta-dot" />
                  <span>{formatDate(d.uploadedAt)}</span>
                </div>
                <div className="doc-foot">
                  <div className="doc-actions">
                    <button
                      className="action-btn view"
                      onClick={() => openViewer(d)}
                      title="عرض"
                    >
                      <Eye />
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => handleDownload(d)}
                      title="تنزيل"
                    >
                      <Download />
                    </button>
                    <button
                      className="action-btn delete"
                      onClick={() => {
                        setDocToDelete(d);
                        setDeleteConfirmText("");
                      }}
                      title="حذف"
                    >
                      <Trash2 />
                    </button>
                  </div>
                  <span className="doc-open">عرض ←</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalItems={filtered.length}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
        onItemsPerPageChange={(size) => {
          setItemsPerPage(size);
          setCurrentPage(1);
        }}
        itemLabel="مستند"
        pageSizeOptions={[12, 24, 48]}
      />

      {/* Upload dialog */}
      {showUpload && (
        <div className="modal-overlay">
          <div className="modal doc-upload-modal">
            <div className="modal-header">
              <h3>رفع مستندات</h3>
              <button className="close-btn" onClick={() => setShowUpload(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {uploadSuccess && (
                <div className="modal-success-banner">
                  <CheckCircle /> تم رفع الملفات بنجاح
                </div>
              )}

              <label className="doc-dropzone">
                <UploadCloud size={30} />
                <span>اختر الملفات أو أفلتها هنا</span>
                <small>PDF, Word, Excel, صور, Markdown, نصوص — أي نوع</small>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    addFiles(e.dataTransfer?.files ?? null);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                />
              </label>

              {uploadFiles.length > 0 && (
                <div className="doc-upload-list">
                  {uploadFiles.map((f, i) => (
                    <div className="doc-upload-row" key={`${f.name}-${i}`}>
                      <span className="doc-upload-name" title={f.name}>
                        {f.name}
                      </span>
                      <span className="doc-upload-size">
                        {formatSize(f.size)}
                      </span>
                      <button
                        type="button"
                        className="doc-upload-remove"
                        onClick={() =>
                          setUploadFiles((prev) =>
                            prev.filter((_, idx) => idx !== i)
                          )
                        }
                        title="إزالة"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="form-group">
                <label>ملاحظات (اختياري — تُحفظ مع كل ملف)</label>
                <input
                  type="text"
                  className="form-input"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="وصف قصير للملفات..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowUpload(false)}
                disabled={uploading}
              >
                إغلاق
              </button>
              <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={uploading || uploadFiles.length === 0}
              >
                <UploadCloud size={16} />
                {uploading
                  ? `جاري الرفع ${uploadProgress.done}/${uploadProgress.total}...`
                  : `رفع ${uploadFiles.length || ""} ملف`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewer */}
      {viewerDoc && (
        <div className="modal-overlay">
          <div className="modal doc-viewer-modal">
            <div className="modal-header">
              <h3 className="doc-viewer-title" title={viewerDoc.name}>
                {viewerDoc.name}
              </h3>
              <div className="doc-viewer-header-actions">
                <button
                  className="btn-secondary doc-viewer-download"
                  onClick={() => handleDownload(viewerDoc)}
                >
                  <Download size={15} />
                  تنزيل
                </button>
                <button className="close-btn" onClick={() => setViewerDoc(null)}>
                  ×
                </button>
              </div>
            </div>
            <div className="modal-body doc-viewer-body">
              {viewerDoc.kind === "pdf" && (
                <iframe
                  className="doc-viewer-frame"
                  src={viewerDoc.downloadURL}
                  title={viewerDoc.name}
                />
              )}
              {viewerDoc.kind === "image" && (
                <div className="doc-viewer-imagewrap">
                  <img src={viewerDoc.downloadURL} alt={viewerDoc.name} />
                </div>
              )}
              {(viewerDoc.kind === "md" || viewerDoc.kind === "text") &&
                (viewerLoading ? (
                  <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>جاري تحميل الملف...</p>
                  </div>
                ) : viewerText === null ? (
                  <div className="doc-viewer-none">
                    <File size={40} />
                    <p>تعذر تحميل محتوى الملف — جرب التنزيل</p>
                  </div>
                ) : viewerDoc.kind === "md" ? (
                  <div
                    className="doc-md"
                    dangerouslySetInnerHTML={{ __html: mdToHtml(viewerText) }}
                  />
                ) : (
                  <pre className="doc-plain">{viewerText}</pre>
                ))}
              {viewerDoc.kind === "other" && (
                <div className="doc-viewer-none">
                  <File size={40} />
                  <p>لا تتوفر معاينة لهذا النوع من الملفات</p>
                  <button
                    className="btn-primary"
                    onClick={() => handleDownload(viewerDoc)}
                  >
                    <Download size={15} />
                    تنزيل الملف
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation (typed موافق) */}
      {docToDelete && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>حذف مستند</h3>
              <button
                className="close-btn"
                onClick={() => {
                  if (!deleting) setDocToDelete(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                سيتم حذف المستند <strong>{docToDelete.name}</strong> وملفه
                المخزن نهائياً ولا يمكن التراجع.
              </p>
              <div className="form-group">
                <label>اكتب "موافق" للتأكيد</label>
                <input
                  type="text"
                  className="form-input"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setDocToDelete(null)}
                disabled={deleting}
              >
                إلغاء
              </button>
              <button
                className="btn-danger"
                onClick={confirmDelete}
                disabled={deleting || deleteConfirmText.trim() !== "موافق"}
              >
                <Trash2 size={15} />
                {deleting ? "جاري الحذف..." : "حذف نهائي"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
