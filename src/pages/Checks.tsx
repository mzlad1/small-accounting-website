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
import "./Checks.css";

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface CustomerCheck {
  id: string;
  customerId: string;
  customerName: string;
  checkNumber: string;
  bank: string;
  amount: number;
  dueDate: string;
  status: "pending" | "collected" | "returned" | "overdue";
  notes?: string;
  createdAt: string;
}

export function Checks() {
  const [checks, setChecks] = useState<CustomerCheck[]>([]);
  const [filteredChecks, setFilteredChecks] = useState<CustomerCheck[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    customer: "all",
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
  const [selectedCheck, setSelectedCheck] = useState<CustomerCheck | null>(
    null
  );
  const [checkForm, setCheckForm] = useState({
    customerId: "",
    checkNumber: "",
    bank: "",
    amount: 0,
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

      // Fetch customers
      const customersSnapshot = await getDocs(collection(db, "customers"));
      const customersData: Customer[] = [];
      customersSnapshot.forEach((doc) => {
        customersData.push({ id: doc.id, ...doc.data() } as Customer);
      });
      setCustomers(customersData);

      // Fetch customer checks with customer names
      const checksSnapshot = await getDocs(
        query(collection(db, "customerChecks"), orderBy("dueDate", "asc"))
      );
      const checksData: CustomerCheck[] = [];
      checksSnapshot.forEach((doc) => {
        const checkData = doc.data();
        const customer = customersData.find(
          (c) => c.id === checkData.customerId
        );
        const check: CustomerCheck = {
          id: doc.id,
          customerId: checkData.customerId,
          checkNumber: checkData.checkNumber,
          bank: checkData.bank,
          amount: checkData.amount,
          dueDate: checkData.dueDate,
          status: checkData.status,
          notes: checkData.notes,
          createdAt: checkData.createdAt,
          customerName: customer?.name || "Unknown Customer",
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
          check.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          check.checkNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          check.bank.toLowerCase().includes(searchTerm.toLowerCase()) ||
          check.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply customer filter
    if (filters.customer !== "all") {
      filtered = filtered.filter(
        (check) => check.customerId === filters.customer
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
      let aValue: any = a[sortBy.field as keyof CustomerCheck];
      let bValue: any = b[sortBy.field as keyof CustomerCheck];

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
  };

  const handleAddCheck = async () => {
    try {
      const newCheck = {
        ...checkForm,
        status: "pending" as CustomerCheck["status"],
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "customerChecks"), newCheck);
      setShowAddModal(false);
      setCheckForm({
        customerId: "",
        checkNumber: "",
        bank: "",
        amount: 0,
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
        doc(db, "customerChecks", selectedCheck.id),
        updatedCheck
      );
      setShowEditModal(false);
      setSelectedCheck(null);
      setCheckForm({
        customerId: "",
        checkNumber: "",
        bank: "",
        amount: 0,
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
      await deleteDoc(doc(db, "customerChecks", selectedCheck.id));
      setShowDeleteModal(false);
      setSelectedCheck(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting check:", error);
    }
  };

  const handleStatusUpdate = async (
    checkId: string,
    newStatus: CustomerCheck["status"]
  ) => {
    try {
      await updateDoc(doc(db, "customerChecks", checkId), {
        status: newStatus,
      });
      fetchData();
    } catch (error) {
      console.error("Error updating check status:", error);
    }
  };

  const openEditModal = (check: CustomerCheck) => {
    setSelectedCheck(check);
    setCheckForm({
      customerId: check.customerId,
      checkNumber: check.checkNumber,
      bank: check.bank,
      amount: check.amount,
      dueDate: check.dueDate,
      notes: check.notes || "",
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (check: CustomerCheck) => {
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
      case "collected":
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
      case "collected":
        return "محصّل";
      case "pending":
        return "في الانتظار";
      case "returned":
        return "مرتجع";
      case "overdue":
        return "متأخر";
      default:
        return "في الانتظار";
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "collected":
        return "collected";
      case "pending":
        return "pending";
      case "returned":
        return "returned";
      case "overdue":
        return "overdue";
      default:
        return "pending";
    }
  };

  const printChecks = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>شيكات العملاء</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              .header { text-align: center; margin-bottom: 30px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .status-pending { color: #f59e0b; }
              .status-collected { color: #10b981; }
              .status-returned { color: #ef4444; }
              .status-overdue { color: #dc2626; }
              .summary { margin-top: 20px; font-weight: bold; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>شيكات العملاء</h1>
              <p>تاريخ الطباعة: ${new Date().toLocaleDateString("en-US")}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>رقم الشيك</th>
                  <th>البنك</th>
                  <th>المبلغ</th>
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
                    <td>${check.customerName}</td>
                    <td>${check.checkNumber}</td>
                    <td>${check.bank}</td>
                    <td>${check.amount.toLocaleString("en-IL", {
                      style: "currency",
                      currency: "ILS",
                    })}</td>
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
              <p><strong>إجمالي المبالغ:</strong> ${filteredChecks
                .reduce((sum, check) => sum + check.amount, 0)
                .toLocaleString("en-IL", {
                  style: "currency",
                  currency: "ILS",
                })}</p>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error("Error printing checks:", error);
      alert("حدث خطأ أثناء الطباعة");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IL", {
      style: "currency",
      currency: "ILS",
    }).format(amount);
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

  if (loading) {
    return (
      <div className="checks-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل الشيكات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="checks-container">
      {/* Header */}
      <div className="checks-header">
        <div className="header-content">
          <h1>شيكات العملاء</h1>
          <p>إدارة الشيكات المستلمة من العملاء</p>
        </div>
        <div className="header-actions">
          <button className="print-btn" onClick={printChecks}>
            <Printer className="btn-icon" />
            طباعة
          </button>
          <button
            className="add-check-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="btn-icon" />
            إضافة شيك جديد
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="search-filters-section">
        <div className="search-box">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="البحث بالعميل أو رقم الشيك أو البنك..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filters-row">
          <div className="filter-group">
            <label>العميل:</label>
            <select
              value={filters.customer}
              onChange={(e) =>
                setFilters({ ...filters, customer: e.target.value })
              }
              className="filter-select"
            >
              <option value="all">جميع العملاء</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

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
              <option value="collected">محصّل</option>
              <option value="returned">مرتجع</option>
              <option value="overdue">متأخر</option>
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
        <table className="checks-table">
          <thead>
            <tr>
              <th
                onClick={() => handleSort("customerName")}
                className="sortable"
              >
                <div className="th-content">
                  <User className="th-icon" />
                  العميل
                  {getSortIcon("customerName")}
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
            {filteredChecks.length === 0 ? (
              <tr>
                <td colSpan={8} className="no-data">
                  لا توجد شيكات
                </td>
              </tr>
            ) : (
              filteredChecks.map((check) => (
                <tr
                  key={check.id}
                  className={`check-row ${
                    isOverdue(check.dueDate) ? "overdue" : ""
                  }`}
                >
                  <td>
                    <div className="customer-info">
                      <div className="customer-avatar">
                        <User className="avatar-icon" />
                      </div>
                      <div className="customer-details">
                        <span className="customer-name">
                          {check.customerName}
                        </span>
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
                      {formatCurrency(check.amount)}
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
                              e.target.value as CustomerCheck["status"]
                            )
                          }
                          className="status-select"
                        >
                          <option value="pending">في الانتظار</option>
                          <option value="collected">محصّل</option>
                          <option value="returned">مرتجع</option>
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
      </div>

      {/* Add Check Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>إضافة شيك جديد</h3>
              <button
                className="close-btn"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>العميل *</label>
                <select
                  value={checkForm.customerId}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, customerId: e.target.value })
                  }
                  className="form-select"
                >
                  <option value="">اختر العميل</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
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
                  !checkForm.customerId ||
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
              <h3>تعديل الشيك</h3>
              <button
                className="close-btn"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>العميل *</label>
                <select
                  value={checkForm.customerId}
                  onChange={(e) =>
                    setCheckForm({ ...checkForm, customerId: e.target.value })
                  }
                  className="form-select"
                >
                  <option value="">اختر العميل</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
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
                  !checkForm.customerId ||
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
              <h3>حذف الشيك</h3>
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
    </div>
  );
}
