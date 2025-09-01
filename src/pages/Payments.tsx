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
  Banknote,
  SortAsc,
  SortDesc,
} from "lucide-react";
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "./Payments.css";

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  type: "cash" | "check";
  amount: number;
  notes?: string;
  checkNumber?: string;
  checkBank?: string;
  createdAt: string;
}

export function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    customer: "all",
    type: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [sortBy, setSortBy] = useState({
    field: "date",
    order: "desc" as "asc" | "desc",
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    customerId: "",
    date: new Date().toISOString().split("T")[0],
    type: "cash" as Payment["type"],
    amount: 0,
    notes: "",
    checkNumber: "",
    checkBank: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [payments, searchTerm, filters, sortBy]);

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

      // Fetch payments with customer names
      const paymentsSnapshot = await getDocs(
        query(collection(db, "payments"), orderBy("createdAt", "desc"))
      );
      const paymentsData: Payment[] = [];
      paymentsSnapshot.forEach((doc) => {
        const paymentData = doc.data();
        const customer = customersData.find(
          (c) => c.id === paymentData.customerId
        );
        paymentsData.push({
          id: doc.id,
          ...paymentData,
          customerName: customer?.name || "Unknown Customer",
        } as Payment);
      });
      setPayments(paymentsData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...payments];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(
        (payment) =>
          payment.customerName
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          payment.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply customer filter
    if (filters.customer !== "all") {
      filtered = filtered.filter(
        (payment) => payment.customerId === filters.customer
      );
    }

    // Apply type filter
    if (filters.type !== "all") {
      filtered = filtered.filter((payment) => payment.type === filters.type);
    }

    // Apply date filters
    if (filters.dateFrom) {
      filtered = filtered.filter(
        (payment) => new Date(payment.date) >= new Date(filters.dateFrom)
      );
    }
    if (filters.dateTo) {
      filtered = filtered.filter(
        (payment) => new Date(payment.date) <= new Date(filters.dateTo)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy.field as keyof Payment];
      let bValue: any = b[sortBy.field as keyof Payment];

      if (sortBy.field === "date") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (sortBy.order === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredPayments(filtered);
  };

  const handleAddPayment = async () => {
    try {
      const newPayment = {
        ...paymentForm,
        createdAt: new Date().toISOString(),
      };

      // Add the payment
      await addDoc(collection(db, "payments"), newPayment);

      // If it's a check payment, also add it to the checks collection
      if (paymentForm.type === "check") {
        const customer = customers.find((c) => c.id === paymentForm.customerId);
        const newCheck = {
          customerId: paymentForm.customerId,
          customerName: customer?.name || "",
          checkNumber: paymentForm.checkNumber!,
          bank: paymentForm.checkBank!,
          amount: paymentForm.amount,
          dueDate: paymentForm.date, // Use payment date as due date
          status: "pending" as "pending" | "collected" | "returned",
          notes: paymentForm.notes || `دفعة شيك - ${paymentForm.notes || ""}`,
          createdAt: new Date().toISOString(),
        };

        console.log("Creating new check from payment:", newCheck);
        const checkRef = await addDoc(
          collection(db, "customerChecks"),
          newCheck
        );
        console.log("Check created with ID:", checkRef.id);
      }

      // Show success message
      if (paymentForm.type === "check") {
        alert("تم إضافة الدفعة والشيك بنجاح!");
      }

      setShowAddModal(false);
      setPaymentForm({
        customerId: "",
        date: new Date().toISOString().split("T")[0],
        type: "cash",
        amount: 0,
        notes: "",
        checkNumber: "",
        checkBank: "",
      });
      fetchData();
    } catch (error) {
      console.error("Error adding payment:", error);
    }
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

  const getTypeIcon = (type: string) => {
    return type === "cash" ? (
      <Banknote className="type-icon" />
    ) : (
      <CreditCard className="type-icon" />
    );
  };

  const getTypeText = (type: string) => {
    return type === "cash" ? "نقدي" : "شيك";
  };

  const getTypeClass = (type: string) => {
    return type === "cash" ? "cash" : "check";
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

  if (loading) {
    return (
      <div className="payments-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل المدفوعات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payments-container">
      {/* Header */}
      <div className="payments-header">
        <div className="header-content">
          <h1>المدفوعات</h1>
          <p>إدارة جميع المدفوعات من جميع العملاء</p>
        </div>
        <button
          className="add-payment-btn"
          onClick={() => setShowAddModal(true)}
        >
          <Plus className="btn-icon" />
          إضافة دفعة جديدة
        </button>
      </div>

      {/* Search and Filters */}
      <div className="search-filters-section">
        <div className="search-box">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="البحث بالعميل أو الملاحظات..."
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
            <label>النوع:</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="filter-select"
            >
              <option value="all">جميع الأنواع</option>
              <option value="cash">نقدي</option>
              <option value="check">شيك</option>
            </select>
          </div>

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
        </div>
      </div>

      {/* Payments Table */}
      <div className="table-container">
        <table className="payments-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("date")} className="sortable">
                <div className="th-content">
                  <Calendar className="th-icon" />
                  التاريخ
                  {getSortIcon("date")}
                </div>
              </th>
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
              <th>النوع</th>
              <th onClick={() => handleSort("amount")} className="sortable">
                <div className="th-content">
                  <DollarSign className="th-icon" />
                  المبلغ
                  {getSortIcon("amount")}
                </div>
              </th>
              <th>ملاحظات</th>
              <th>تفاصيل الشيك</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={6} className="no-data">
                  لا توجد مدفوعات
                </td>
              </tr>
            ) : (
              filteredPayments.map((payment) => (
                <tr key={payment.id} className="payment-row">
                  <td>{formatDate(payment.date)}</td>
                  <td>
                    <div className="customer-info">
                      <div className="customer-avatar">
                        <User className="avatar-icon" />
                      </div>
                      <div className="customer-details">
                        <span className="customer-name">
                          {payment.customerName}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className={`type-badge ${getTypeClass(payment.type)}`}>
                      {getTypeIcon(payment.type)}
                      {getTypeText(payment.type)}
                    </div>
                  </td>
                  <td>
                    <div className="payment-amount">
                      {formatCurrency(payment.amount)}
                    </div>
                  </td>
                  <td>
                    <div className="payment-notes">{payment.notes || "-"}</div>
                  </td>
                  <td>
                    {payment.type === "check" ? (
                      <div className="check-details">
                        <span>رقم: {payment.checkNumber}</span>
                        <span>بنك: {payment.checkBank}</span>
                      </div>
                    ) : (
                      <span className="no-check">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Payment Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>إضافة دفعة جديدة</h3>
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
                  value={paymentForm.customerId}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
                      customerId: e.target.value,
                    })
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
                  <label>التاريخ *</label>
                  <input
                    type="date"
                    value={paymentForm.date}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, date: e.target.value })
                    }
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>النوع *</label>
                  <select
                    value={paymentForm.type}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        type: e.target.value as Payment["type"],
                      })
                    }
                    className="form-select"
                  >
                    <option value="cash">نقدي</option>
                    <option value="check">شيك</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>المبلغ *</label>
                <input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) =>
                    setPaymentForm({
                      ...paymentForm,
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
                <label>ملاحظات</label>
                <textarea
                  value={paymentForm.notes}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="form-textarea"
                  rows={3}
                />
              </div>

              {paymentForm.type === "check" && (
                <div className="form-row">
                  <div className="form-group">
                    <label>رقم الشيك *</label>
                    <input
                      type="text"
                      value={paymentForm.checkNumber}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
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
                      value={paymentForm.checkBank}
                      onChange={(e) =>
                        setPaymentForm({
                          ...paymentForm,
                          checkBank: e.target.value,
                        })
                      }
                      placeholder="أدخل اسم البنك"
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {paymentForm.type === "check" && (
                <div className="form-info">
                  <p>
                    سيتم إضافة هذا الشيك تلقائياً إلى قائمة الشيكات للمتابعة
                  </p>
                </div>
              )}
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
                onClick={handleAddPayment}
                disabled={
                  !paymentForm.customerId ||
                  !paymentForm.date ||
                  paymentForm.amount <= 0 ||
                  (paymentForm.type === "check" &&
                    (!paymentForm.checkNumber || !paymentForm.checkBank))
                }
              >
                إضافة الدفعة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
