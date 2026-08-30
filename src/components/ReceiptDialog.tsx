import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, Printer } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../config/firebase";
import { IMMUTABLE_CACHE } from "../utils/imageCompress";
import { amountWords } from "../utils/tafqit";
import {
  AUTO_VARIABLES,
  AMOUNT_VARIABLES,
  CUSTOMER_VARIABLES,
  DATE_VARIABLES,
  DEFAULT_TEMPLATE,
  DEFAULT_VALUES,
  buildPrintDocument,
  extractVariables,
  isLegacyHtmlTemplate,
  renderTemplate,
} from "../utils/receiptTemplate";
import React from "react";

interface CustomerOption {
  id: string;
  name: string;
}

interface ReceiptDialogProps {
  customers: CustomerOption[];
  initialCustomerId?: string;
  onClose: () => void;
}

const todayStr = () => new Date().toISOString().split("T")[0];

// Never remembered between receipts: per-receipt / per-customer values
const NON_REMEMBERED = ["المبلغ", "التاريخ", "اسم_العميل", "هوية_العميل"];

const formatDisplayDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
};

export function ReceiptDialog({
  customers,
  initialCustomerId,
  onClose,
}: ReceiptDialogProps) {
  const [template, setTemplate] = useState<string>(DEFAULT_TEMPLATE);
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [nextNumber, setNextNumber] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState(initialCustomerId || "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [savedNumber, setSavedNumber] = useState<number | null>(null);
  const [remembered, setRemembered] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Load the template + the counter estimate once
  useEffect(() => {
    (async () => {
      try {
        const [tplSnap, counterSnap, defaultsSnap] = await Promise.all([
          getDoc(doc(db, "settings", "receiptTemplate")),
          getDoc(doc(db, "settings", "receiptCounter")),
          getDoc(doc(db, "settings", "receiptDefaults")),
        ]);
        if (defaultsSnap.exists() && defaultsSnap.data().values) {
          setRemembered(defaultsSnap.data().values);
        }
        const saved = tplSnap.exists() ? tplSnap.data().template : "";
        if (saved && !isLegacyHtmlTemplate(saved)) {
          setTemplate(saved);
        }
        setNextNumber(
          (counterSnap.exists() ? counterSnap.data().value || 0 : 0) + 1
        );
      } catch (error) {
        console.error("Error loading receipt template:", error);
        setNextNumber(null);
      } finally {
        setTemplateLoaded(true);
      }
    })();
  }, []);

  // Input variables = everything in the template except the automatic ones
  const inputVariables = useMemo(
    () =>
      extractVariables(template).filter((v) => !AUTO_VARIABLES.includes(v)),
    [template]
  );

  // Seed defaults (today's date) once the template is known
  useEffect(() => {
    if (!templateLoaded) return;
    setValues((prev) => {
      const next = { ...prev };
      DATE_VARIABLES.forEach((v) => {
        if (inputVariables.includes(v) && !next[v]) next[v] = todayStr();
      });
      Object.entries(remembered).forEach(([v, rv]) => {
        if (
          inputVariables.includes(v) &&
          !NON_REMEMBERED.includes(v) &&
          !next[v]
        )
          next[v] = rv;
      });
      Object.entries(DEFAULT_VALUES).forEach(([v, dv]) => {
        if (inputVariables.includes(v) && !next[v]) next[v] = dv;
      });
      return next;
    });
    setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          ".receipt-fields input, .receipt-fields select, .receipt-fields textarea"
        )
        ?.focus();
    }, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateLoaded]);

  // Selecting a customer fills the name variable (still editable)
  const handleCustomerSelect = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((c) => c.id === id);
    if (customer) {
      setValues((prev) => {
        const next = { ...prev };
        CUSTOMER_VARIABLES.forEach((v) => {
          if (inputVariables.includes(v)) next[v] = customer.name;
        });
        return next;
      });
    }
  };

  const amountVariable = inputVariables.find((v) =>
    AMOUNT_VARIABLES.includes(v)
  );
  const amountValue = amountVariable
    ? parseFloat(values[amountVariable] || "") || 0
    : 0;

  // Values as they appear on the printed receipt
  const renderValues = useMemo(() => {
    const v: Record<string, string> = { ...values };
    DATE_VARIABLES.forEach((name) => {
      if (v[name]) v[name] = formatDisplayDate(v[name]);
    });
    if (amountVariable && amountValue > 0) {
      v[amountVariable] = amountValue.toLocaleString();
      v["المبلغ_كتابة"] = amountWords(amountValue);
    }
    v["رقم_السند"] = String(savedNumber ?? nextNumber ?? "—");
    return v;
  }, [values, amountVariable, amountValue, nextNumber, savedNumber]);

  const renderedHtml = useMemo(
    () => renderTemplate(template, renderValues),
    [template, renderValues]
  );

  const printHtml = (html: string) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildPrintDocument(html));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const handleSaveAndPrint = async () => {
    if (saving) return;
    if (amountVariable && amountValue <= 0) {
      alert("أدخل مبلغاً صحيحاً");
      return;
    }

    setSaving(true);
    try {
      // Reserve the sequential number atomically
      const counterRef = doc(db, "settings", "receiptCounter");
      const receiptNumber = await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists() ? snap.data().value || 0 : 0;
        const next = current + 1;
        tx.set(counterRef, { value: next }, { merge: true });
        return next;
      });

      const finalValues = { ...renderValues, ["رقم_السند"]: String(receiptNumber) };
      const finalHtml = renderTemplate(template, finalValues);
      const customer = customers.find((c) => c.id === customerId);
      const nowIso = new Date().toISOString();

      // Archive copy in Storage
      const storagePath = `receipts/receipt-${receiptNumber}.html`;
      await uploadBytes(
        ref(storage, storagePath),
        new Blob([buildPrintDocument(finalHtml)], {
          type: "text/html",
        }),
        { contentType: "text/html", cacheControl: IMMUTABLE_CACHE }
      );

      // History record (rendered HTML kept so history views/prints are
      // exactly what was printed, even if the template changes later)
      await setDoc(doc(collection(db, "receipts")), {
        receiptNumber,
        customerId: customerId || "",
        customerName:
          customer?.name ||
          CUSTOMER_VARIABLES.map((v) => values[v]).find(Boolean) ||
          "",
        amount: amountValue,
        values: finalValues,
        renderedHtml: finalHtml,
        storagePath,
        date: values["التاريخ"] || todayStr(),
        createdAt: nowIso,
      });

      // Remember the repeat-values (receiver, id, witness, currency,
      // description…) so the next receipt starts pre-filled
      const rememberedNext: Record<string, string> = {};
      inputVariables.forEach((v) => {
        if (!NON_REMEMBERED.includes(v) && values[v]) {
          rememberedNext[v] = values[v];
        }
      });
      setRemembered(rememberedNext);
      setDoc(
        doc(db, "settings", "receiptDefaults"),
        { values: rememberedNext, updatedAt: nowIso },
        { merge: true }
      ).catch((e) => console.warn("Failed to save receipt defaults:", e));

      setSavedNumber(receiptNumber);
      printHtml(finalHtml);

      // Rapid entry: keep the dialog open; only the per-receipt fields
      // reset (amount cleared, date back to today) — everything else
      // stays for the next receipt
      setValues((prev) => {
        const next = { ...prev };
        if (amountVariable) next[amountVariable] = "";
        DATE_VARIABLES.forEach((v) => {
          if (inputVariables.includes(v)) next[v] = todayStr();
        });
        return next;
      });
      setCustomerId(initialCustomerId || "");
      setNextNumber(receiptNumber + 1);
      setSavedNumber(null);
      setAddSuccess(true);
      setTimeout(() => setAddSuccess(false), 2500);
      setTimeout(() => {
        dialogRef.current
          ?.querySelector<HTMLElement>(
            ".receipt-fields input, .receipt-fields select, .receipt-fields textarea"
          )
          ?.focus();
      }, 60);
    } catch (error) {
      console.error("Error saving receipt:", error);
      alert("حدث خطأ أثناء حفظ السند");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal receipt-dialog" ref={dialogRef}>
        <div className="modal-header">
          <h3>سند قبض جديد</h3>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body receipt-dialog-body">
          {addSuccess && (
            <div className="modal-success-banner">
              <CheckCircle /> تم حفظ السند وطباعته بنجاح
            </div>
          )}

          {!templateLoaded ? (
            <div className="receipt-fields">
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line" />
              <span className="skeleton skeleton-line" />
            </div>
          ) : (
            <div className="receipt-dialog-grid">
              <div className="receipt-fields">
                <div className="form-group">
                  <label>رقم السند</label>
                  <input
                    type="text"
                    className="form-input"
                    value={String(nextNumber ?? "تلقائي")}
                    disabled
                  />
                </div>

                {inputVariables.map((variable) => {
                  if (CUSTOMER_VARIABLES.includes(variable)) {
                    return (
                      <React.Fragment key={variable}>
                        <div className="form-group">
                          <label>العميل (لربط السند بالحساب)</label>
                          <select
                            className="form-input"
                            value={customerId}
                            onChange={(e) =>
                              handleCustomerSelect(e.target.value)
                            }
                          >
                            <option value="">— بدون ربط بعميل —</option>
                            {customers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>{variable.replace(/_/g, " ")}</label>
                          <input
                            type="text"
                            className="form-input"
                            value={values[variable] || ""}
                            onChange={(e) =>
                              setValues((prev) => ({
                                ...prev,
                                [variable]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </React.Fragment>
                    );
                  }

                  if (DATE_VARIABLES.includes(variable)) {
                    return (
                      <div className="form-group" key={variable}>
                        <label>{variable.replace(/_/g, " ")}</label>
                        <input
                          type="date"
                          className="form-input"
                          value={values[variable] || ""}
                          onChange={(e) =>
                            setValues((prev) => ({
                              ...prev,
                              [variable]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    );
                  }

                  if (AMOUNT_VARIABLES.includes(variable)) {
                    return (
                      <div className="form-group" key={variable}>
                        <label>{variable.replace(/_/g, " ")}</label>
                        <input
                          type="number"
                          className="form-input"
                          min={0}
                          step={0.01}
                          value={values[variable] || ""}
                          onChange={(e) =>
                            setValues((prev) => ({
                              ...prev,
                              [variable]: e.target.value,
                            }))
                          }
                        />
                        {amountValue > 0 && (
                          <p className="receipt-words-hint">
                            {amountWords(amountValue)}
                          </p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      className={`form-group ${
                        variable === "البيان" ? "receipt-field-wide" : ""
                      }`}
                      key={variable}
                    >
                      <label>{variable.replace(/_/g, " ")}</label>
                      <input
                        type="text"
                        className="form-input"
                        value={values[variable] || ""}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [variable]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <div className="receipt-preview-pane">
                <div className="receipt-preview-label">معاينة السند</div>
                <div
                  className="receipt-preview-frame"
                  dangerouslySetInnerHTML={{ __html: renderedHtml }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            إغلاق
          </button>
          <button
            className="btn-primary"
            onClick={handleSaveAndPrint}
            disabled={saving || !templateLoaded}
          >
            <Printer size={16} />
            {saving ? "جاري الحفظ..." : "حفظ وطباعة"}
          </button>
        </div>
      </div>
    </div>
  );
}
