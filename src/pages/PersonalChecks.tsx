import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Filter,
  Eye,
  DollarSign,
  User,
  Calendar,
  CreditCard,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  SortAsc,
  SortDesc,
  Edit,
  Trash2,
  Printer,
  Upload,
} from "lucide-react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "./PersonalChecks.css";

interface PersonalCheck {
  id: string;
  payee: string;
  checkNumber: string;
  bank: string;
  amount: number;
  currency: "شيقل جديد" | "دولار";
  dueDate: string;
  status: "pending" | "paid" | "returned" | "overdue" | "undefined";
  notes?: string;
  createdAt: string;
}

export function PersonalChecks() {
  const [checks, setChecks] = useState<PersonalCheck[]>([]);
  const [filteredChecks, setFilteredChecks] = useState<PersonalCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    status: "all",
    dueDateFilter: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [sortBy, setSortBy] = useState({
    field: "dueDate",
    order: "asc" as "asc" | "desc",
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [selectedCheck, setSelectedCheck] = useState<PersonalCheck | null>(
    null
  );

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [checksPerPage, setChecksPerPage] = useState(20);
  const [checkForm, setCheckForm] = useState({
    payee: "",
    checkNumber: "",
    bank: "",
    amount: 0,
    currency: "شيقل جديد" as "شيقل جديد" | "دولار",
    dueDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [checks, searchTerm, filters, sortBy]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch personal checks
      const checksSnapshot = await getDocs(
        query(collection(db, "personalChecks"), orderBy("dueDate", "asc"))
      );
      const checksData: PersonalCheck[] = [];
      checksSnapshot.forEach((doc) => {
        const checkData = doc.data();
        const check: PersonalCheck = {
          id: doc.id,
          payee: checkData.payee,
          checkNumber: checkData.checkNumber,
          bank: checkData.bank,
          amount: checkData.amount,
          currency: checkData.currency || "شيقل جديد", // Default to shekel if not set
          dueDate: checkData.dueDate,
          status: checkData.status,
          notes: checkData.notes,
          createdAt: checkData.createdAt,
        };

        // Update status to overdue if due date has passed
        if (
          check.status === "pending" &&
          new Date(check.dueDate) < new Date()
        ) {
          check.status = "overdue";
        }

        checksData.push(check);
      });
      setChecks(checksData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...checks];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(
        (check) =>
          check.payee.toLowerCase().includes(searchTerm.toLowerCase()) ||
          check.checkNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          check.bank.toLowerCase().includes(searchTerm.toLowerCase()) ||
          check.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (filters.status !== "all") {
      filtered = filtered.filter((check) => check.status === filters.status);
    }

    // Apply due date filters
    if (filters.dueDateFilter !== "all") {
      const today = new Date();
      const startOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );

      switch (filters.dueDateFilter) {
        case "today":
          filtered = filtered.filter((check) => {
            const dueDate = new Date(check.dueDate);
            return (
              dueDate >= startOfDay &&
              dueDate < new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
            );
          });
          break;
        case "week":
          const endOfWeek = new Date(
            startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000
          );
          filtered = filtered.filter((check) => {
            const dueDate = new Date(check.dueDate);
            return dueDate >= startOfDay && dueDate < endOfWeek;
          });
          break;
        case "month":
          const endOfMonth = new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            0
          );
          filtered = filtered.filter((check) => {
            const dueDate = new Date(check.dueDate);
            return dueDate >= startOfDay && dueDate <= endOfMonth;
          });
          break;
        case "range":
          if (filters.dateFrom) {
            filtered = filtered.filter(
              (check) => new Date(check.dueDate) >= new Date(filters.dateFrom)
            );
          }
          if (filters.dateTo) {
            filtered = filtered.filter(
              (check) => new Date(check.dueDate) <= new Date(filters.dateTo)
            );
          }
          break;
      }
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy.field as keyof PersonalCheck];
      let bValue: any = b[sortBy.field as keyof PersonalCheck];

      if (sortBy.field === "dueDate") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (sortBy.order === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredChecks(filtered);

    // Reset to first page when filters change
    setCurrentPage(1);
  };

  const handleAddCheck = async () => {
    try {
      const newCheck = {
        ...checkForm,
        status: "pending" as PersonalCheck["status"],
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "personalChecks"), newCheck);
      setShowAddModal(false);
      setCheckForm({
        payee: "",
        checkNumber: "",
        bank: "",
        amount: 0,
        currency: "شيقل جديد",
        dueDate: new Date().toISOString().split("T")[0],
        notes: "",
      });
      fetchData();
    } catch (error) {
      console.error("Error adding check:", error);
    }
  };

  const handleEditCheck = async () => {
    if (!selectedCheck) return;

    try {
      const updatedCheck = {
        ...checkForm,
      };

      await updateDoc(
        doc(db, "personalChecks", selectedCheck.id),
        updatedCheck
      );
      setShowEditModal(false);
      setSelectedCheck(null);
      setCheckForm({
        payee: "",
        checkNumber: "",
        bank: "",
        amount: 0,
        currency: "شيقل جديد",
        dueDate: new Date().toISOString().split("T")[0],
        notes: "",
      });
      fetchData();
    } catch (error) {
      console.error("Error updating check:", error);
    }
  };

  const handleDeleteCheck = async () => {
    if (!selectedCheck) return;

    try {
      await deleteDoc(doc(db, "personalChecks", selectedCheck.id));
      setShowDeleteModal(false);
      setSelectedCheck(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting check:", error);
    }
  };

  const handleStatusUpdate = async (
    checkId: string,
    newStatus: PersonalCheck["status"]
  ) => {
    try {
      await updateDoc(doc(db, "personalChecks", checkId), {
        status: newStatus,
      });
      fetchData();
    } catch (error) {
      console.error("Error updating check status:", error);
    }
  };

  const openEditModal = (check: PersonalCheck) => {
    setSelectedCheck(check);
    setCheckForm({
      payee: check.payee,
      checkNumber: check.checkNumber,
      bank: check.bank,
      amount: check.amount,
      currency: check.currency,
      dueDate: check.dueDate,
      notes: check.notes || "",
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (check: PersonalCheck) => {
    setSelectedCheck(check);
    setShowDeleteModal(true);
  };

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "paid":
        return <CheckCircle className="status-icon" />;
      case "pending":
        return <Clock className="status-icon" />;
      case "returned":
        return <XCircle className="status-icon" />;
      case "overdue":
        return <AlertCircle className="status-icon" />;
      default:
        return <Clock className="status-icon" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "paid":
        return "مدفوع";
      case "pending":
        return "في الانتظار";
      case "returned":
        return "مرتجع";
      case "overdue":
        return "متأخر";
      case "undefined":
        return "غير محدد";
      default:
        return "غير محدد";
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "paid":
        return "paid";
      case "pending":
        return "pending";
      case "returned":
        return "returned";
      case "overdue":
        return "overdue";
      case "undefined":
        return "undefined";
      default:
        return "undefined";
    }
  };

  const printPersonalChecks = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>الشيكات الشخصية</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              .header { text-align: center; margin-bottom: 30px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .status-pending { color: #f59e0b; }
              .status-paid { color: #10b981; }
              .status-returned { color: #ef4444; }
              .status-overdue { color: #dc2626; }
              .status-undefined { color: #6b7280; }
              .summary { margin-top: 20px; font-weight: bold; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>الشيكات الشخصية</h1>
              <p>تاريخ الطباعة: ${new Date().toLocaleDateString("en-US")}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>المستفيد</th>
                  <th>رقم الشيك</th>
                  <th>البنك</th>
                  <th>المبلغ</th>
                  <th>العملة</th>
                  <th>تاريخ الاستحقاق</th>
                  <th>الحالة</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                ${filteredChecks
                  .map(
                    (check) => `
                  <tr>
                    <td>${check.payee}</td>
                    <td>${check.checkNumber}</td>
                    <td>${check.bank}</td>
                    <td>${check.amount.toLocaleString("en-IL")}</td>
                    <td>${check.currency === "شيقل جديد" ? "₪" : "$"}</td>
                    <td>${new Date(check.dueDate).toLocaleDateString(
                      "en-US"
                    )}</td>
                    <td class="status-${check.status}">${getStatusText(
                      check.status
                    )}</td>
                    <td>${check.notes || "-"}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="summary">
              <p><strong>إجمالي الشيكات:</strong> ${filteredChecks.length}</p>
              <p><strong>إجمالي المبالغ (شيقل جديد):</strong> ${filteredChecks
                .filter((check) => check.currency === "شيقل جديد")
                .reduce((sum, check) => sum + check.amount, 0)
                .toLocaleString("en-IL", {
                  style: "currency",
                  currency: "ILS",
                })}</p>
              <p><strong>إجمالي المبالغ (دولار):</strong> ${filteredChecks
                .filter((check) => check.currency === "دولار")
                .reduce((sum, check) => sum + check.amount, 0)
                .toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}</p>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error("Error printing personal checks:", error);
      alert("حدث خطأ أثناء الطباعة");
    }
  };

  const formatCurrency = (
    amount: number,
    currency: "شيقل جديد" | "دولار" = "شيقل جديد"
  ) => {
    if (currency === "دولار") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount);
    } else {
      return new Intl.NumberFormat("en-IL", {
        style: "currency",
        currency: "ILS",
      }).format(amount);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date();
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredChecks.length / checksPerPage);
  const startIndex = (currentPage - 1) * checksPerPage;
  const endIndex = startIndex + checksPerPage;
  const currentChecks = filteredChecks.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToFirstPage = () => {
    setCurrentPage(1);
  };

  const goToLastPage = () => {
    setCurrentPage(totalPages);
  };

  // Import functions
  const parseCheckData = (text: string): PersonalCheck[] => {
    const checks: PersonalCheck[] = [];
    const lines = text.split("\n");

    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) {
        continue;
      }

      // Parse check data line - handle tab-separated values
      const parts = line.split("\t");

      // Handle both formats:
      // Format 1 (9 columns): status | notes | payee | bank | date | currency | amountInWords | amount | checkNumber
      // Format 2 (7 columns): checkNumber | payee | bank | date | currency | amount | checkNumber (duplicate)

      if (parts.length >= 7) {
        let payee, bank, date, currency, amount, checkNumber, status, notes;

        if (parts.length >= 9) {
          // Format 1: status | notes | payee | bank | date | currency | amountInWords | amount | checkNumber
          [status, notes, payee, bank, date, currency, , amount, checkNumber] =
            parts;
        } else {
          // Format 2: checkNumber | payee | bank | date | currency | amount | checkNumber (duplicate)
          [checkNumber, payee, bank, date, currency, amount] = parts;
          status = ""; // No status in this format
          notes = ""; // No notes in this format
        }

        // Only process if we have the essential fields
        if (
          payee &&
          bank &&
          date &&
          amount &&
          checkNumber &&
          payee.trim() &&
          bank.trim() &&
          date.trim() &&
          amount.trim() &&
          checkNumber.trim()
        ) {
          // Handle date format variations (DD/M/YYYY or DD/MM/YYYY)
          let formattedDate = "";
          try {
            const dateParts = date.trim().split("/");
            if (dateParts.length === 3) {
              const [day, month, year] = dateParts;
              // Ensure month and day are padded with zeros
              const paddedMonth = month.padStart(2, "0");
              const paddedDay = day.padStart(2, "0");
              formattedDate = `${year}-${paddedMonth}-${paddedDay}`;
            }
          } catch (error) {
            console.warn(`Invalid date format: ${date}`);
            continue; // Skip this line if date parsing fails
          }

          if (!formattedDate) continue; // Skip if date parsing failed

          // Determine status
          let checkStatus: PersonalCheck["status"] = "pending";
          if (status && status.trim().includes("تم الصرف")) {
            checkStatus = "paid";
          } else if (!status || !status.trim()) {
            checkStatus = "undefined";
          }

          // Parse amount safely
          const parsedAmount = parseFloat(amount.trim());
          if (isNaN(parsedAmount) || parsedAmount <= 0) {
            console.warn(`Invalid amount: ${amount}`);
            continue; // Skip if amount is invalid
          }

          const check: PersonalCheck = {
            id: "", // Will be set when adding to database
            payee: payee.trim(),
            checkNumber: checkNumber.trim(),
            bank: bank.trim(),
            amount: parsedAmount,
            currency:
              currency && currency.trim().includes("دولار")
                ? "دولار"
                : "شيقل جديد",
            dueDate: formattedDate,
            status: checkStatus,
            notes: notes && notes.trim() ? notes.trim() : "",
            createdAt: formattedDate,
          };

          checks.push(check);
        }
      }
    }

    return checks;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "text/plain") {
      setImportFile(file);
    } else {
      alert("يرجى اختيار ملف نصي (.txt)");
    }
  };

  const handleImportChecks = async () => {
    if (!importFile) return;

    try {
      setImporting(true);
      setImportProgress(0);

      const text = await importFile.text();
      console.log("File content preview:", text.substring(0, 500));

      const checksToImport = parseCheckData(text);
      console.log("Parsed checks:", checksToImport);

      if (checksToImport.length === 0) {
        alert(
          "لم يتم العثور على بيانات صحيحة في الملف. يرجى التأكد من تنسيق الملف."
        );
        return;
      }

      // Confirm import
      const confirmed = window.confirm(
        `هل أنت متأكد من استيراد ${
          checksToImport.length
        } شيك؟\n\nسيتم استيراد:\n- ${
          checksToImport.filter((c) => c.currency === "شيقل جديد").length
        } شيك بالشيقل\n- ${
          checksToImport.filter((c) => c.currency === "دولار").length
        } شيك بالدولار`
      );

      if (!confirmed) return;

      // Import checks one by one
      for (let i = 0; i < checksToImport.length; i++) {
        const check = checksToImport[i];
        await addDoc(collection(db, "personalChecks"), check);
        setImportProgress(((i + 1) / checksToImport.length) * 100);
      }

      alert(
        `تم استيراد ${checksToImport.length} شيك بنجاح!\n\n- ${
          checksToImport.filter((c) => c.currency === "شيقل جديد").length
        } شيك بالشيقل\n- ${
          checksToImport.filter((c) => c.currency === "دولار").length
        } شيك بالدولار`
      );
      setShowImportModal(false);
      setImportFile(null);
      setImportProgress(0);
      fetchData(); // Refresh the data
    } catch (error) {
      console.error("Error importing checks:", error);
      alert("حدث خطأ أثناء الاستيراد");
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="personal-checks-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل الشيكات الشخصية...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="personal-checks-container">
      {/* Header */}
      <div className="personal-checks-header">
        <div className="header-content">
          <h1>الشيكات الشخصية</h1>
          <p>إدارة الشيكات المقدمة للموردين</p>
        </div>
        <div className="header-actions">
          <button
            className="import-btn"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="btn-icon" />
            استيراد
          </button>
          <button className="print-btn" onClick={printPersonalChecks}>
            <Printer className="btn-icon" />
            طباعة
          </button>
          <button
            className="add-check-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="btn-icon" />
            إضافة شيك شخصي جديد
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="search-filters-section">
        <div className="search-box">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="البحث بالمستفيد أو رقم الشيك أو البنك..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filters-row">
          <div className="filter-group">
            <label>الحالة:</label>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
              className="filter-select"
            >
              <option value="all">جميع الحالات</option>
              <option value="pending">في الانتظار</option>
              <option value="paid">مدفوع</option>
              <option value="returned">مرتجع</option>
              <option value="overdue">متأخر</option>
              <option value="undefined">غير محدد</option>
            </select>
          </div>

          <div className="filter-group">
            <label>تاريخ الاستحقاق:</label>
            <select
              value={filters.dueDateFilter}
              onChange={(e) =>
                setFilters({ ...filters, dueDateFilter: e.target.value })
              }
              className="filter-select"
            >
              <option value="all">جميع التواريخ</option>
              <option value="today">اليوم</option>
              <option value="week">هذا الأسبوع</option>
              <option value="month">هذا الشهر</option>
              <option value="range">نطاق مخصص</option>
            </select>
          </div>

          {filters.dueDateFilter === "range" && (
            <>
              <div className="filter-group">
                <label>من تاريخ:</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters({ ...filters, dateFrom: e.target.value })
                  }
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label>إلى تاريخ:</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters({ ...filters, dateTo: e.target.value })
                  }
                  className="filter-input"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Checks Table */}
      <div className="table-container">
        <table className="personal-checks-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("payee")} className="sortable">
                <div className="th-content">
                  <User className="th-icon" />
                  المستفيد
                  {getSortIcon("payee")}
                </div>
              </th>
              <th>رقم الشيك</th>
              <th>البنك</th>
              <th onClick={() => handleSort("amount")} className="sortable">
                <div className="th-content">
                  <DollarSign className="th-icon" />
                  المبلغ
                  {getSortIcon("amount")}
                </div>
              </th>
              <th>العملة</th>
              <th onClick={() => handleSort("dueDate")} className="sortable">
                <div className="th-content">
                  <Calendar className="th-icon" />
                  تاريخ الاستحقاق
                  {getSortIcon("dueDate")}
                </div>
              </th>
              <th>الحالة</th>
              <th>ملاحظات</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {currentChecks.length === 0 ? (
              <tr>
                <td colSpan={9} className="no-data">
                  لا توجد شيكات شخصية
                </td>
              </tr>
            ) : (
              currentChecks.map((check) => (
                <tr
                  key={check.id}
                  className={`check-row ${
                    isOverdue(check.dueDate) ? "overdue" : ""
                  }`}
                >
                  <td>
                    <div className="payee-info">
                      <div className="payee-avatar">
                        <User className="avatar-icon" />
                      </div>
                      <div className="payee-details">
                        <span className="payee-name">{check.payee}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="check-number">{check.checkNumber}</div>
                  </td>
                  <td>
                    <div className="bank-name">{check.bank}</div>
                  </td>
                  <td>
                    <div className="check-amount">
                      {formatCurrency(check.amount, check.currency)}
                    </div>
                  </td>
                  <td>
                    <div className="check-currency">
                      {check.currency === "شيقل جديد" ? "₪" : "$"}
                    </div>
                  </td>
                  <td>
                    <div
                      className={`due-date ${
                        isOverdue(check.dueDate) ? "overdue" : ""
                      }`}
                    >
                      {formatDate(check.dueDate)}
                    </div>
                  </td>
                  <td>
                    <div
                      className={`status-badge ${getStatusClass(check.status)}`}
                    >
                      {getStatusIcon(check.status)}
                      {getStatusText(check.status)}
                    </div>
                  </td>
                  <td>
                    <div className="check-notes">{check.notes || "-"}</div>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <div className="status-update-dropdown">
                        <select
                          value={check.status}
                          onChange={(e) =>
                            handleStatusUpdate(
                              check.id,
                              e.target.value as PersonalCheck["status"]
                            )
                          }
                          className="status-select"
                        >
                          <option value="pending">في الانتظار</option>
                          <option value="paid">مدفوع</option>
                          <option value="returned">مرتجع</option>
                          <option value="undefined">غير محدد</option>
                        </select>
                      </div>
                      <button
                        className="action-btn edit"
                        onClick={() => openEditModal(check)}
                        title="تعديل"
                      >
                        <Edit />
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => openDeleteModal(check)}
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

        {/* Pagination */}
        {filteredChecks.length > 0 && (
          <div className="pagination-container">
            <div className="pagination-info">
              <span>
                عرض {startIndex + 1}-{Math.min(endIndex, filteredChecks.length)}{" "}
                من {filteredChecks.length} شيك
              </span>
              <div className="page-size-selector">
                <label>عرض:</label>
                <select
                  value={checksPerPage}
                  onChange={(e) => {
                    setChecksPerPage(Number(e.target.value));
                    setCurrentPage(1); // Reset to first page when changing page size
                  }}
                  className="page-size-select"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>شيك في الصفحة</span>
              </div>
            </div>
            <div className="pagination-controls">
              <button
                className="pagination-btn"
                onClick={goToFirstPage}
                disabled={currentPage === 1}
                title="الصفحة الأولى"
              >
                <span>«</span>
              </button>
              <button
                className="pagination-btn"
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                title="الصفحة السابقة"
              >
                <span>‹</span>
              </button>

              {/* Page numbers */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  // Show first page, last page, current page, and pages around current page
                  if (page === 1 || page === totalPages) return true;
                  if (page >= currentPage - 2 && page <= currentPage + 2)
                    return true;
                  return false;
                })
                .map((page, index, array) => {
                  // Add ellipsis if there's a gap
                  const prevPage = array[index - 1];
                  const showEllipsis = prevPage && page - prevPage > 1;

                  return (
                    <React.Fragment key={page}>
                      {showEllipsis && (
                        <span className="pagination-ellipsis">...</span>
                      )}
                      <button
                        className={`pagination-btn ${
                          page === currentPage ? "active" : ""
                        }`}
                        onClick={() => goToPage(page)}
                      >
                        {page}
                      </button>
                    </React.Fragment>
                  );
                })}

              <button
                className="pagination-btn"
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                title="الصفحة التالية"
              >
                <span>›</span>
              </button>
              <button
                className="pagination-btn"
                onClick={goToLastPage}
                disabled={currentPage === totalPages}
                title="الصفحة الأخيرة"
              >
                <span>»</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Check Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>إضافة شيك شخصي جديد</h3>
              <button
                className="close-btn"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>المستفيد *</label>
                <input
                  type="text"
                  value={checkForm.payee}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, payee: e.target.value })
                  }
                  placeholder="أدخل اسم المستفيد"
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>رقم الشيك *</label>
                  <input
                    type="text"
                    value={checkForm.checkNumber}
                    onChange={(e) =>
                      setCheckForm({
                        ...checkForm,
                        checkNumber: e.target.value,
                      })
                    }
                    placeholder="أدخل رقم الشيك"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>البنك *</label>
                  <input
                    type="text"
                    value={checkForm.bank}
                    onChange={(e) =>
                      setCheckForm({ ...checkForm, bank: e.target.value })
                    }
                    placeholder="أدخل اسم البنك"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>المبلغ *</label>
                  <input
                    type="number"
                    value={checkForm.amount}
                    onChange={(e) =>
                      setCheckForm({
                        ...checkForm,
                        amount: parseFloat(e.target.value),
                      })
                    }
                    min="0"
                    step="0.01"
                    placeholder="أدخل المبلغ"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>العملة *</label>
                  <select
                    value={checkForm.currency}
                    onChange={(e) =>
                      setCheckForm({
                        ...checkForm,
                        currency: e.target.value as "شيقل جديد" | "دولار",
                      })
                    }
                    className="form-input"
                  >
                    <option value="شيقل جديد">شيقل جديد (₪)</option>
                    <option value="دولار">دولار ($)</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>تاريخ الاستحقاق *</label>
                  <input
                    type="date"
                    value={checkForm.dueDate}
                    onChange={(e) =>
                      setCheckForm({ ...checkForm, dueDate: e.target.value })
                    }
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={checkForm.notes}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="form-textarea"
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowAddModal(false)}
              >
                إلغاء
              </button>
              <button
                className="btn-primary"
                onClick={handleAddCheck}
                disabled={
                  !checkForm.payee ||
                  !checkForm.checkNumber ||
                  !checkForm.bank ||
                  checkForm.amount <= 0 ||
                  !checkForm.dueDate
                }
              >
                إضافة الشيك
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Check Modal */}
      {showEditModal && selectedCheck && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>تعديل الشيك الشخصي</h3>
              <button
                className="close-btn"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>المستفيد *</label>
                <input
                  type="text"
                  value={checkForm.payee}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, payee: e.target.value })
                  }
                  placeholder="أدخل اسم المستفيد"
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>رقم الشيك *</label>
                  <input
                    type="text"
                    value={checkForm.checkNumber}
                    onChange={(e) =>
                      setCheckForm({
                        ...checkForm,
                        checkNumber: e.target.value,
                      })
                    }
                    placeholder="أدخل رقم الشيك"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>البنك *</label>
                  <input
                    type="text"
                    value={checkForm.bank}
                    onChange={(e) =>
                      setCheckForm({ ...checkForm, bank: e.target.value })
                    }
                    placeholder="أدخل اسم البنك"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>المبلغ *</label>
                  <input
                    type="number"
                    value={checkForm.amount}
                    onChange={(e) =>
                      setCheckForm({
                        ...checkForm,
                        amount: parseFloat(e.target.value),
                      })
                    }
                    min="0"
                    step="0.01"
                    placeholder="أدخل المبلغ"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>العملة *</label>
                  <select
                    value={checkForm.currency}
                    onChange={(e) =>
                      setCheckForm({
                        ...checkForm,
                        currency: e.target.value as "شيقل جديد" | "دولار",
                      })
                    }
                    className="form-input"
                  >
                    <option value="شيقل جديد">شيقل جديد (₪)</option>
                    <option value="دولار">دولار ($)</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>تاريخ الاستحقاق *</label>
                  <input
                    type="date"
                    value={checkForm.dueDate}
                    onChange={(e) =>
                      setCheckForm({ ...checkForm, dueDate: e.target.value })
                    }
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={checkForm.notes}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="form-textarea"
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowEditModal(false)}
              >
                إلغاء
              </button>
              <button
                className="btn-primary"
                onClick={handleEditCheck}
                disabled={
                  !checkForm.payee ||
                  !checkForm.checkNumber ||
                  !checkForm.bank ||
                  checkForm.amount <= 0 ||
                  !checkForm.dueDate
                }
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Check Modal */}
      {showDeleteModal && selectedCheck && (
        <div className="modal-overlay">
          <div className="modal delete-modal">
            <div className="modal-header">
              <h3>حذف الشيك الشخصي</h3>
              <button
                className="close-btn"
                onClick={() => setShowDeleteModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                هل أنت متأكد من حذف الشيك رقم "{selectedCheck.checkNumber}"؟
              </p>
              <p className="warning-text">لا يمكن التراجع عن هذا الإجراء.</p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                إلغاء
              </button>
              <button className="btn-danger" onClick={handleDeleteCheck}>
                <Trash2 className="btn-icon" />
                حذف الشيك
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Checks Modal */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>استيراد الشيكات الشخصية</h3>
              <button
                className="close-btn"
                onClick={() => setShowImportModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="import-instructions">
                <h4>تعليمات الاستيراد:</h4>
                <ul>
                  <li>يجب أن يكون الملف بصيغة نصية (.txt)</li>
                  <li>
                    يدعم النظام تنسيقين للبيانات (مفصولة بعلامات التبويب):
                  </li>
                  <li>
                    <strong>التنسيق الأول (9 أعمدة):</strong>
                    <br />
                    الحالة | ملاحظات | المستلم | المصرف | التاريخ | العملة |
                    قيمة الشيك بالحروف | قيمة الشيك | رقم الشيك
                  </li>
                  <li>
                    <strong>التنسيق الثاني (7 أعمدة):</strong>
                    <br />
                    رقم الشيك | المستلم | المصرف | التاريخ | العملة | قيمة الشيك
                    | رقم الشيك
                  </li>
                  <li>التاريخ يمكن أن يكون بصيغة DD/M/YYYY أو DD/MM/YYYY</li>
                  <li>العملة: "شيقل جديد" أو "دولار"</li>
                  <li>الحالة: "تم الصرف" = مدفوع، فارغ = غير محدد</li>
                </ul>
                <div className="format-example">
                  <p>
                    <strong>أمثلة على التنسيقات:</strong>
                  </p>
                  <div style={{ marginBottom: "1rem" }}>
                    <p>
                      <strong>التنسيق الأول:</strong>
                    </p>
                    <code>
                      تم الصرف النبالي للباطون الصفا 25/8/2022 شيقل جديد عشرة
                      الاف شيقل 10000 30000021
                    </code>
                  </div>
                  <div>
                    <p>
                      <strong>التنسيق الثاني:</strong>
                    </p>
                    <code>
                      20300661 رضا علي محمد لدادوة الاسلامي الفلسطيني 5/7/2027
                      دولار 1000 20300661
                    </code>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>اختر ملف النص:</label>
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  className="form-input"
                />
              </div>

              {importFile && (
                <div className="file-info">
                  <p>
                    <strong>الملف المختار:</strong> {importFile.name}
                  </p>
                  <p>
                    <strong>الحجم:</strong>{" "}
                    {(importFile.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              )}

              {importing && (
                <div className="import-progress">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${importProgress}%` }}
                    ></div>
                  </div>
                  <p>جاري الاستيراد... {Math.round(importProgress)}%</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowImportModal(false)}
              >
                إلغاء
              </button>
              <button
                className="btn-primary"
                onClick={handleImportChecks}
                disabled={!importFile || importing}
              >
                {importing ? "جاري الاستيراد..." : "بدء الاستيراد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
