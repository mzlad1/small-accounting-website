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
} from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showNewReceipt, setShowNewReceipt] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [templateDraft, setTemplateDraft] = useState(DEFAULT_TEMPLATE);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [receiptToDelete, setReceiptToDelete] = useState<Receipt | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

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
    return filtered;
  }, [receipts, searchTerm, customerFilter, dateFrom, dateTo]);

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
      <div className="filters-bar">
        <div className="filter-field filter-field-search">
          <label>بحث</label>
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="بحث..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="filter-field">
          <label>العميل</label>
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="all">جميع العملاء</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label>من تاريخ</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="filter-field">
          <label>إلى تاريخ</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="filters-clear-btn"
          onClick={() => {
            setSearchTerm("");
            setCustomerFilter("all");
            setDateFrom("");
            setDateTo("");
          }}
        >
          مسح الفلاتر
        </button>
      </div>

      {/* Table */}
      <div className="receipts-table-container">
        <table className="receipts-table">
          <thead>
            <tr>
              <th>رقم السند</th>
              <th>العميل</th>
              <th>المبلغ</th>
              <th>البيان</th>
              <th>التاريخ</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredReceipts.length === 0 ? (
              <tr>
                <td colSpan={6} className="receipts-no-data">
                  لا توجد سندات قبض
                </td>
              </tr>
            ) : (
              filteredReceipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td className="receipt-number">#{receipt.receiptNumber}</td>
                  <td>{receipt.customerName || "—"}</td>
                  <td>₪{(receipt.amount || 0).toLocaleString()}</td>
                  <td className="receipt-description">
                    {receipt.values?.["البيان"] || "—"}
                  </td>
                  <td>
                    {receipt.date
                      ? new Date(receipt.date).toLocaleDateString("en-GB")
                      : "—"}
                  </td>
                  <td>
                    <div className="receipts-actions">
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
