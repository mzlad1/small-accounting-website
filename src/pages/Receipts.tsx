import React, { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Printer,
  Eye,
  Trash2,
  ReceiptText,
  FileText,
  DollarSign,
  Calendar,
  Settings,
  SortAsc,
  SortDesc,
  User,
  ArrowLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  setDoc,
  query,
  orderBy,
  DocumentData,
  QuerySnapshot,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "../config/firebase";
import { subscribeAll } from "../utils/live";
import { matchesSearch } from "../utils/search";
import { ReceiptDialog } from "../components/ReceiptDialog";
import { Pagination } from "../components/Pagination";
import {
  FiltersBar,
  SearchField,
  SelectField,
  DateField,
  SortControl,
} from "../components/Filters";
import {
  DEFAULT_TEMPLATE,
  STANDARD_VARIABLES,
  buildPrintDocument,
  extractVariables,
  isLegacyHtmlTemplate,
  renderTemplate,
} from "../utils/receiptTemplate";
import "./Receipts.css";

interface Customer {
  id: string;
  name: string;
}

interface Receipt {
  id: string;
  receiptNumber: number;
  customerId: string;
  customerName: string;
  amount: number;
  values: Record<string, string>;
  renderedHtml: string;
  storagePath?: string;
  date: string;
  createdAt: string;
}

export function Receipts() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState({
    field: "receiptNumber",
    order: "desc" as "asc" | "desc",
  });
  const [showNewReceipt, setShowNewReceipt] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateDraft, setTemplateDraft] = useState(DEFAULT_TEMPLATE);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<Receipt | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const applySnapshots = (snapshots: Array<QuerySnapshot<DocumentData>>) => {
    const [receiptsSnapshot, customersSnapshot] = snapshots;

    const receiptsData: Receipt[] = [];
    receiptsSnapshot.forEach((d) => {
      receiptsData.push({ id: d.id, ...d.data() } as Receipt);
    });
    setReceipts(receiptsData);

    const customersData: Customer[] = [];
    customersSnapshot.forEach((d) => {
      const data = d.data();
      customersData.push({ id: d.id, name: data.name });
    });
    setCustomers(customersData);
  };

  useEffect(() => {
    setLoading(true);
    // Live subscription: instant paint from the persistent cache, then
    // the server, then every later change (own writes appear at once).
    const unsubscribe = subscribeAll(
      [
        query(collection(db, "receipts"), orderBy("receiptNumber", "desc")),
        query(collection(db, "customers"), orderBy("name", "asc")),
      ],
      applySnapshots,
      () => setLoading(false),
      (error) => console.error("Error fetching receipts:", error)
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSort = (field: string) => {
    setSortBy((prev) => ({
      field,
      order: prev.field === field && prev.order === "desc" ? "asc" : "desc",
    }));
  };

  const getSortIcon = (field: string) => {
    if (sortBy.field !== field) return null;
    return sortBy.order === "asc" ? (
      <SortAsc size={16} />
    ) : (
      <SortDesc size={16} />
    );
  };

  // One comparable value per sortable column: numbers stay numeric,
  // text compares as text, the date compares on its raw stored value.
  const receiptSortValue = (
    receipt: Receipt,
    field: string
  ): string | number => {
    switch (field) {
      case "customerName":
        return receipt.customerName || "";
      case "amount":
        return receipt.amount || 0;
      case "description":
        return receipt.values?.["البيان"] || "";
      case "date":
        return receipt.date || "";
      case "receiptNumber":
      default:
        return receipt.receiptNumber || 0;
    }
  };

  const filteredReceipts = useMemo(() => {
    let filtered = [...receipts];
    if (searchTerm) {
      filtered = filtered.filter((r) => matchesSearch(r, searchTerm));
    }
    if (customerFilter !== "all") {
      filtered = filtered.filter((r) => r.customerId === customerFilter);
    }
    if (dateFrom) {
      filtered = filtered.filter((r) => r.date >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter((r) => r.date <= dateTo);
    }
    // Header sorting — applied before the pagination slice below
    filtered.sort((a, b) => {
      const aValue = receiptSortValue(a, sortBy.field);
      const bValue = receiptSortValue(b, sortBy.field);
      const comparison =
        typeof aValue === "number" && typeof bValue === "number"
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue), "ar");
      return sortBy.order === "asc" ? comparison : -comparison;
    });
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipts, searchTerm, customerFilter, dateFrom, dateTo, sortBy]);

  // Reset to the first page whenever the visible list changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, customerFilter, dateFrom, dateTo, sortBy]);

  // Pagination (applied after filtering)
  const totalPages = Math.ceil(filteredReceipts.length / itemsPerPage);
  const paginatedReceipts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredReceipts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredReceipts, currentPage, itemsPerPage]);

  // Keep the page in range when the filtered list shrinks
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  // Pagination functions
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  const thisMonthCount = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    return receipts.filter((r) => (r.date || "").startsWith(prefix)).length;
  }, [receipts]);

  const totalAmount = useMemo(
    () => filteredReceipts.reduce((sum, r) => sum + (r.amount || 0), 0),
    [filteredReceipts]
  );

  const templateTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const insertVariable = (name: string) => {
    const token = `{{${name}}}`;
    const el = templateTextareaRef.current;
    if (!el) {
      setTemplateDraft((prev) => prev + token);
      return;
    }
    const start = el.selectionStart ?? templateDraft.length;
    const end = el.selectionEnd ?? start;
    const next =
      templateDraft.slice(0, start) + token + templateDraft.slice(end);
    setTemplateDraft(next);
    setTimeout(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    }, 0);
  };

  const openTemplateEditor = async () => {
    try {
      const snap = await getDoc(doc(db, "settings", "receiptTemplate"));
      const saved = snap.exists() ? snap.data().template : "";
      setTemplateDraft(
        saved && !isLegacyHtmlTemplate(saved) ? saved : DEFAULT_TEMPLATE
      );
    } catch {
      setTemplateDraft(DEFAULT_TEMPLATE);
    }
    setShowTemplateEditor(true);
  };

  const handleSaveTemplate = async () => {
    setTemplateSaving(true);
    try {
      await setDoc(doc(db, "settings", "receiptTemplate"), {
        template: templateDraft,
        updatedAt: new Date().toISOString(),
      });
      setShowTemplateEditor(false);
    } catch (error) {
      console.error("Error saving template:", error);
      alert("حدث خطأ أثناء حفظ القالب");
    } finally {
      setTemplateSaving(false);
    }
  };

  const printReceipt = (receipt: Receipt) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildPrintDocument(receipt.renderedHtml));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const viewReceipt = (receipt: Receipt) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildPrintDocument(receipt.renderedHtml));
    w.document.close();
  };

  const confirmDeleteReceipt = async () => {
    if (!receiptToDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "receipts", receiptToDelete.id));
      if (receiptToDelete.storagePath) {
        try {
          await deleteObject(ref(storage, receiptToDelete.storagePath));
        } catch {
          // archive copy may already be gone — the record removal matters
        }
      }
      setReceiptToDelete(null);
      setDeleteConfirmText("");
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error deleting receipt:", error);
      alert("حدث خطأ أثناء حذف السند");
    } finally {
      setDeleting(false);
    }
  };

  const draftVariables = useMemo(
    () => extractVariables(templateDraft),
    [templateDraft]
  );

  if (loading) {
    return (
      <div className="receipts-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل سندات القبض...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="receipts-container">
      {/* Header */}
      <div className="receipts-header">
        <div className="header-content">
          <h1>سندات القبض</h1>
          <p>إنشاء وطباعة وأرشفة سندات القبض</p>
        </div>
        <div className="receipts-header-actions">
          <button className="btn-secondary" onClick={openTemplateEditor}>
            <Settings size={16} />
            تعديل القالب
          </button>
          <button
            className="btn-primary"
            onClick={() => setShowNewReceipt(true)}
          >
            <Plus size={16} />
            سند قبض جديد
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-icon">
            <ReceiptText />
          </div>
          <div className="summary-content">
            <h3 className="summary-title">عدد السندات</h3>
            <p className="summary-amount">{receipts.length}</p>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">
            <DollarSign />
          </div>
          <div className="summary-content">
            <h3 className="summary-title">إجمالي المبالغ (حسب الفلتر)</h3>
            <p className="summary-amount">₪{totalAmount.toLocaleString()}</p>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon">
            <Calendar />
          </div>
          <div className="summary-content">
            <h3 className="summary-title">سندات هذا الشهر</h3>
            <p className="summary-amount">{thisMonthCount}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <FiltersBar
        onClear={() => {
          setSearchTerm("");
          setCustomerFilter("all");
          setDateFrom("");
          setDateTo("");
        }}
      >
        <SearchField value={searchTerm} onChange={setSearchTerm} />
        <SelectField
          label="العميل"
          value={customerFilter}
          onChange={setCustomerFilter}
          options={[
            { value: "all", label: "جميع العملاء" },
            ...customers.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <DateField label="من تاريخ" value={dateFrom} onChange={setDateFrom} />
        <DateField label="إلى تاريخ" value={dateTo} onChange={setDateTo} />
        <SortControl
          value={sortBy.field}
          onChange={(field) => handleSort(field)}
          options={[
            { value: "receiptNumber", label: "رقم السند" },
            { value: "customerName", label: "العميل" },
            { value: "amount", label: "المبلغ" },
            { value: "description", label: "البيان" },
            { value: "date", label: "التاريخ" },
          ]}
          order={sortBy.order}
          onToggleOrder={() =>
            setSortBy((prev) => ({
              ...prev,
              order: prev.order === "asc" ? "desc" : "asc",
            }))
          }
        />
      </FiltersBar>

      {/* Receipt stubs — one slip per سند */}
      {filteredReceipts.length === 0 ? (
        <div className="rcp-empty">
          <ReceiptText size={34} color="#D8CDBB" />
          <p>لا توجد سندات قبض</p>
        </div>
      ) : (
        <div className="rcp-grid">
          {paginatedReceipts.map((receipt) => (
            <article className="rcp-rcpt" key={receipt.id}>
              <div className="rcp-rcpt-top">
                <span className="rcp-rcpt-num">
                  سند رقم {receipt.receiptNumber}
                </span>
                <span className="rcp-rcpt-date">
                  {receipt.date
                    ? new Date(receipt.date).toLocaleDateString("en-GB")
                    : "—"}
                </span>
              </div>

              <div className="rcp-rcpt-name">{receipt.customerName || "—"}</div>

              <div className="rcp-rcpt-amount">
                ₪{(receipt.amount || 0).toLocaleString()}
              </div>

              {receipt.values?.["المبلغ_كتابة"] && (
                <div className="rcp-rcpt-words">
                  {receipt.values["المبلغ_كتابة"]}
                </div>
              )}

              <div className="rcp-rcpt-desc">
                <span>البيان</span>
                {receipt.values?.["البيان"] || "—"}
              </div>

              <div className="rcp-rcpt-foot">
                {receipt.customerId ? (
                  <button
                    type="button"
                    className="rcp-rcpt-link"
                    onClick={() => navigate(`/customers/${receipt.customerId}`)}
                    title="فتح حساب العميل"
                  >
                    <User size={12} />
                    كشف الحساب
                    <ArrowLeft size={12} />
                  </button>
                ) : (
                  <span className="rcp-rcpt-link-none">بدون عميل مرتبط</span>
                )}

                <div className="rcp-actions">
                  <button
                    className="action-btn view"
                    onClick={() => viewReceipt(receipt)}
                    title="عرض"
                  >
                    <Eye />
                  </button>
                  <button
                    className="action-btn"
                    onClick={() => printReceipt(receipt)}
                    title="طباعة"
                  >
                    <Printer />
                  </button>
                  <button
                    className="action-btn delete"
                    onClick={() => {
                      setReceiptToDelete(receipt);
                      setDeleteConfirmText("");
                    }}
                    title="حذف"
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      <Pagination
        currentPage={currentPage}
        totalItems={filteredReceipts.length}
        itemsPerPage={itemsPerPage}
        onPageChange={handlePageChange}
        onItemsPerPageChange={handleItemsPerPageChange}
        itemLabel="سند"
      />

      {/* New receipt dialog */}
      {showNewReceipt && (
        <ReceiptDialog
          customers={customers}
          onClose={() => setShowNewReceipt(false)}
        />
      )}

      {/* Template editor */}
      {showTemplateEditor && (
        <div className="modal-overlay">
          <div className="modal template-editor-modal">
            <div className="modal-header">
              <h3>تعديل قالب السند</h3>
              <button
                className="close-btn"
                onClick={() => setShowTemplateEditor(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="template-editor-hint">
                اكتب نص السند كما تريده أن يُطبع — نص عادي تماماً. اضغط على أي
                متغير بالأسفل ليُدرج مكان المؤشر، وكل متغير يتحول تلقائياً إلى
                حقل إدخال عند إنشاء سند جديد. رقم السند والمبلغ كتابةً يُعبّآن
                تلقائياً. السطر الأول يصبح عنوان السند، وضَع "|" بين الكلمات في
                السطر لعرضها كأعمدة متجاورة في المنتصف (مثل الشاهد والتوقيع).
              </p>
              <div className="template-variables">
                {STANDARD_VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`variable-chip ${
                      draftVariables.includes(v) ? "used" : ""
                    }`}
                    onClick={() => insertVariable(v)}
                    title="إدراج المتغير مكان المؤشر"
                  >
                    {v.replace(/_/g, " ")} +
                  </button>
                ))}
              </div>
              <textarea
                ref={templateTextareaRef}
                className="template-editor-textarea"
                value={templateDraft}
                onChange={(e) => setTemplateDraft(e.target.value)}
                rows={14}
                dir="rtl"
              />
              <div className="template-editor-preview">
                <div className="receipt-preview-label">
                  معاينة (المتغيرات مظللة)
                </div>
                <div
                  className="receipt-preview-frame"
                  dangerouslySetInnerHTML={{
                    __html: renderTemplate(templateDraft, {}, {
                      highlightVariables: true,
                    }),
                  }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setTemplateDraft(DEFAULT_TEMPLATE)}
                disabled={templateSaving}
              >
                استعادة القالب الافتراضي
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowTemplateEditor(false)}
                disabled={templateSaving}
              >
                إلغاء
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveTemplate}
                disabled={templateSaving}
              >
                {templateSaving ? "جاري الحفظ..." : "حفظ القالب"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation — typed "موافق" required */}
      {receiptToDelete && (
        <div className="modal-overlay">
          <div className="modal delete-modal">
            <div className="modal-header">
              <h3>تأكيد الحذف</h3>
              <button
                className="close-btn"
                onClick={() => setReceiptToDelete(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                هل أنت متأكد من حذف السند رقم{" "}
                <strong>#{receiptToDelete.receiptNumber}</strong>؟
              </p>
              <p className="warning-text">
                سيتم حذف السند وأرشيفه نهائياً ولا يمكن استرجاعه!
              </p>
              <div className="form-group">
                <label>اكتب "موافق" لتأكيد الحذف</label>
                <input
                  type="text"
                  className="form-input"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="موافق"
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setReceiptToDelete(null)}
                disabled={deleting}
              >
                إلغاء
              </button>
              <button
                className="btn-danger"
                onClick={confirmDeleteReceipt}
                disabled={deleting || deleteConfirmText.trim() !== "موافق"}
              >
                {deleting ? "جاري الحذف..." : "حذف السند"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
