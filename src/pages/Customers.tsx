import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  Phone,
  User,
  DollarSign,
  Calendar,
  Package,
  SortAsc,
  SortDesc,
  RefreshCw,
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

import "./Customers.css";

interface Customer {
  id: string;
  name: string;
  phone: string;
  notes: string;
  numberOfOrders: number;
  currentBalance: number;
  lastActivity: string;
  createdAt: string;
}

interface Order {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  date: string;
  status: string;
  total: number;
  items: any[];
  notes?: string;
}

interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  date: string;
  type: "cash" | "check";
  amount: number;
  notes?: string;
  checkId?: string;
}

interface CustomerCheck {
  id: string;
  customerId: string;
  customerName: string;
  checkNumber: string;
  bank: string;
  amount: number;
  dueDate: string;
  status: string;
  notes?: string;
}

export function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [balanceFilter, setBalanceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    notes: "",
  });

  // State for order items
  const [orderItems, setOrderItems] = useState<{ [orderId: string]: any[] }>(
    {}
  );

  // Helper function to calculate order totals from order items
  const calculateOrderTotal = (orderId: string) => {
    const items = orderItems[orderId] || [];
    return items.reduce((sum, item) => sum + (item.total || 0), 0);
  };

  // Fetch customers and related data from Firebase
  useEffect(() => {
    fetchAllData();
  }, []);

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...customers];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (customer) =>
          customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          customer.phone.includes(searchTerm)
      );
    }

    // Apply balance filter
    if (balanceFilter !== "all") {
      switch (balanceFilter) {
        case "positive":
          filtered = filtered.filter((customer) => customer.currentBalance > 0);
          break;
        case "negative":
          filtered = filtered.filter((customer) => customer.currentBalance < 0);
          break;
        case "zero":
          filtered = filtered.filter(
            (customer) => customer.currentBalance === 0
          );
          break;
      }
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case "name":
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case "balance":
          aValue = a.currentBalance;
          bValue = b.currentBalance;
          break;
        case "lastActivity":
          aValue = new Date(a.lastActivity);
          bValue = new Date(b.lastActivity);
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredCustomers(filtered);
  }, [customers, searchTerm, balanceFilter, sortBy, sortOrder]);

  const fetchAllData = async () => {
    try {
      setLoading(true);

      // Fetch customers
      const customersRef = collection(db, "customers");
      const customersQuery = query(customersRef, orderBy("createdAt", "desc"));
      const customersSnapshot = await getDocs(customersQuery);

      // Fetch orders
      const ordersRef = collection(db, "orders");
      const ordersSnapshot = await getDocs(ordersRef);

      // Fetch order items for all orders
      const orderItemsData: { [orderId: string]: any[] } = {};
      for (const orderDoc of ordersSnapshot.docs) {
        const orderId = orderDoc.id;
        const itemsQuery = query(
          collection(db, "orderItems"),
          where("orderId", "==", orderId)
        );
        const itemsSnapshot = await getDocs(itemsQuery);
        const items: any[] = [];
        itemsSnapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() });
        });
        orderItemsData[orderId] = items;
      }
      setOrderItems(orderItemsData);

      // Fetch payments
      const paymentsRef = collection(db, "payments");
      const paymentsSnapshot = await getDocs(paymentsRef);

      // Fetch customer checks
      const customerChecksRef = collection(db, "customerChecks");
      const customerChecksSnapshot = await getDocs(customerChecksRef);

      // Process orders data
      const ordersData: Order[] = [];
      ordersSnapshot.forEach((doc) => {
        const data = doc.data();
        ordersData.push({
          id: doc.id,
          customerId: data.customerId,
          customerName: data.customerName,
          title: data.title,
          date: data.date,
          status: data.status,
          total: data.total,
          items: data.items || [],
          notes: data.notes,
        });
      });

      // Process payments data
      const paymentsData: Payment[] = [];
      paymentsSnapshot.forEach((doc) => {
        const data = doc.data();
        paymentsData.push({
          id: doc.id,
          customerId: data.customerId,
          customerName: data.customerName,
          date: data.date,
          type: data.type,
          amount: data.amount,
          notes: data.notes,
          checkId: data.checkId,
        });
      });

      // Process customer checks data
      const customerChecksData: CustomerCheck[] = [];
      customerChecksSnapshot.forEach((doc) => {
        const data = doc.data();
        customerChecksData.push({
          id: doc.id,
          customerId: data.customerId,
          customerName: data.customerName,
          checkNumber: data.checkNumber,
          bank: data.bank,
          amount: data.amount,
          dueDate: data.dueDate,
          status: data.status,
          notes: data.notes,
        });
      });

      // Process customers with calculated data
      const customersData: Customer[] = [];
      customersSnapshot.forEach((doc) => {
        const customerData = doc.data();
        const customerId = doc.id;

        // Get customer orders
        const customerOrders = ordersData.filter(
          (order) => order.customerId === customerId
        );

        // Get customer payments
        const customerPayments = paymentsData.filter(
          (payment) => payment.customerId === customerId
        );

        // Get customer checks
        const customerChecks = customerChecksData.filter(
          (check) => check.customerId === customerId
        );

        // Calculate numberOfOrders
        const numberOfOrders = customerOrders.length;

        // Calculate currentBalance using orderItemsData directly
        const totalOrders = customerOrders.reduce((sum, order) => {
          const items = orderItemsData[order.id] || [];
          const orderTotal = items.reduce(
            (itemSum, item) => itemSum + (item.total || 0),
            0
          );
          return sum + orderTotal;
        }, 0);
        const totalPayments = customerPayments.reduce(
          (sum, payment) => sum + payment.amount,
          0
        );
        const currentBalance = totalOrders - totalPayments;

        // Calculate lastActivity
        const allDates = [
          ...customerOrders.map((order) => new Date(order.date)),
          ...customerPayments.map((payment) => new Date(payment.date)),
          ...customerChecks.map((check) => new Date(check.dueDate)),
        ];
        const lastActivity =
          allDates.length > 0
            ? new Date(Math.max(...allDates.map((date) => date.getTime())))
            : new Date(customerData.createdAt || new Date());

        customersData.push({
          id: doc.id,
          name: customerData.name,
          phone: customerData.phone,
          notes: customerData.notes || "",
          numberOfOrders,
          currentBalance,
          lastActivity: lastActivity.toISOString(),
          createdAt: customerData.createdAt || new Date().toISOString(),
        });
      });

      setCustomers(customersData);
    } catch (error) {
      console.error("Error fetching customers data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async () => {
    try {
      const newCustomer = {
        ...formData,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "customers"), newCustomer);
      const newCustomerWithId = {
        id: docRef.id,
        ...newCustomer,
        numberOfOrders: 0,
        currentBalance: 0,
        lastActivity: newCustomer.createdAt,
      };

      setShowAddModal(false);
      setFormData({ name: "", phone: "", notes: "" });
      fetchAllData(); // Refresh to recalculate balances
    } catch (error) {
      console.error("Error adding customer:", error);
    }
  };

  const handleEditCustomer = async () => {
    if (!selectedCustomer) return;

    try {
      const customerRef = doc(db, "customers", selectedCustomer.id);
      await updateDoc(customerRef, {
        name: formData.name,
        phone: formData.phone,
        notes: formData.notes,
      });

      // Update cache
      const updatedCustomer = {
        ...selectedCustomer,
        name: formData.name,
        phone: formData.phone,
        notes: formData.notes,
      };

      setShowEditModal(false);
      setSelectedCustomer(null);
      setFormData({ name: "", phone: "", notes: "" });
    } catch (error) {
      console.error("Error updating customer:", error);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return;

    try {
      await deleteDoc(doc(db, "customers", selectedCustomer.id));

      setShowDeleteModal(false);
      setSelectedCustomer(null);
    } catch (error) {
      console.error("Error deleting customer:", error);
    }
  };

  const openEditModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      notes: customer.notes,
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowDeleteModal(true);
  };

  const openCustomerAccount = (customerId: string) => {
    navigate(`/customers/${customerId}`);
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

  const getBalanceClass = (balance: number) => {
    if (balance > 0) return "positive";
    if (balance < 0) return "negative";
    return "zero";
  };

  const getBalanceText = (balance: number) => {
    if (balance > 0) return "مدين";
    if (balance < 0) return "دائن";
    return "متساوي";
  };

  const printCustomers = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const filteredCustomers = customers.filter((customer) => {
          const matchesSearch =
            !searchTerm ||
            customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            customer.phone.includes(searchTerm);

          const matchesBalance =
            balanceFilter === "all" ||
            (balanceFilter === "debtor" && customer.currentBalance > 0) ||
            (balanceFilter === "creditor" && customer.currentBalance < 0) ||
            (balanceFilter === "zero" && customer.currentBalance === 0);

          return matchesSearch && matchesBalance;
        });

        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>قائمة العملاء</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .balance-positive { color: #dc2626; }
              .balance-negative { color: #16a34a; }
              .balance-zero { color: #6b7280; }
              .summary { margin-top: 20px; padding: 15px; background-color: #f9fafb; border-radius: 8px; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>قائمة العملاء</h1>
              <p>تم طباعة هذا التقرير في: ${new Date().toLocaleDateString(
                "en-US"
              )}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>اسم العميل</th>
                  <th>رقم الهاتف</th>
                  <th>عدد الطلبات</th>
                  <th>الرصيد الحالي</th>
                  <th>آخر نشاط</th>
                </tr>
              </thead>
              <tbody>
                ${filteredCustomers
                  .map(
                    (customer) => `
                  <tr>
                    <td>${customer.name}</td>
                    <td>${customer.phone}</td>
                    <td>${customer.numberOfOrders}</td>
                    <td class="balance-${
                      customer.currentBalance > 0
                        ? "positive"
                        : customer.currentBalance < 0
                        ? "negative"
                        : "zero"
                    }">
                      ${formatCurrency(
                        Math.abs(customer.currentBalance)
                      )} ${getBalanceText(customer.currentBalance)}
                    </td>
                    <td>${formatDate(customer.lastActivity)}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="summary">
              <h3>ملخص</h3>
              <p><strong>إجمالي العملاء:</strong> ${
                filteredCustomers.length
              }</p>
              <p><strong>إجمالي الطلبات:</strong> ${filteredCustomers.reduce(
                (sum, c) => sum + c.numberOfOrders,
                0
              )}</p>
              <p><strong>إجمالي المديونية:</strong> ${formatCurrency(
                filteredCustomers
                  .filter((c) => c.currentBalance > 0)
                  .reduce((sum, c) => sum + c.currentBalance, 0)
              )}</p>
              <p><strong>إجمالي الدائنية:</strong> ${formatCurrency(
                Math.abs(
                  filteredCustomers
                    .filter((c) => c.currentBalance < 0)
                    .reduce((sum, c) => sum + c.currentBalance, 0)
                )
              )}</p>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error("Error printing customers:", error);
      alert("حدث خطأ أثناء الطباعة");
    }
  };

  const getSortIcon = (field: string) => {
    if (sortBy !== field) return null;
    return sortOrder === "asc" ? <SortAsc size={16} /> : <SortDesc size={16} />;
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  if (loading) {
    return (
      <div className="customers-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل العملاء...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="customers-container">
      {/* Header */}
      <div className="customers-header">
        <div>
          <h1 className="customers-title">إدارة العملاء</h1>
          <p className="customers-subtitle">
            إدارة قائمة العملاء والوصول إلى حساباتهم
          </p>
        </div>
        <div className="header-actions">
          <button
            className="print-btn"
            onClick={printCustomers}
            title="طباعة قائمة العملاء"
          >
            <Printer className="btn-icon" />
            طباعة
          </button>
          <button
            className="refresh-btn"
            onClick={() => fetchAllData()}
            title="تحديث البيانات"
          >
            <RefreshCw className="btn-icon" />
            تحديث
          </button>
          <button
            className="add-customer-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="btn-icon" />
            إضافة عميل
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="search-filters-section">
        <div className="search-box">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="البحث بالاسم أو رقم الهاتف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filters-section">
          <div className="filter-group">
            <label className="filter-label">فلترة الرصيد:</label>
            <select
              value={balanceFilter}
              onChange={(e) => setBalanceFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">جميع العملاء</option>
              <option value="positive">مدين</option>
              <option value="negative">دائن</option>
              <option value="zero">متساوي</option>
            </select>
          </div>

          <div className="sorting-section">
            <span className="sort-label">ترتيب حسب:</span>
            <button
              className={`sort-btn ${sortBy === "name" ? "active" : ""}`}
              onClick={() => handleSort("name")}
            >
              الاسم {getSortIcon("name")}
            </button>
            <button
              className={`sort-btn ${sortBy === "balance" ? "active" : ""}`}
              onClick={() => handleSort("balance")}
            >
              الرصيد {getSortIcon("balance")}
            </button>
            <button
              className={`sort-btn ${
                sortBy === "lastActivity" ? "active" : ""
              }`}
              onClick={() => handleSort("lastActivity")}
            >
              آخر نشاط {getSortIcon("lastActivity")}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="summary-stats">
        <div className="stat-card">
          <User className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">{customers.length}</span>
            <span className="stat-label">إجمالي العملاء</span>
          </div>
        </div>
        <div className="stat-card">
          <Package className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">
              {customers.reduce(
                (sum, customer) => sum + customer.numberOfOrders,
                0
              )}
            </span>
            <span className="stat-label">إجمالي الطلبات</span>
          </div>
        </div>
        <div className="stat-card">
          <DollarSign className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">
              {formatCurrency(
                customers.reduce(
                  (sum, customer) => sum + Math.max(0, customer.currentBalance),
                  0
                )
              )}
            </span>
            <span className="stat-label">إجمالي المستحقات</span>
          </div>
        </div>
        <div className="stat-card">
          <Calendar className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">
              {
                customers.filter((customer) => customer.numberOfOrders > 0)
                  .length
              }
            </span>
            <span className="stat-label">عملاء نشطون</span>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="table-container">
        <table className="customers-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>رقم الهاتف</th>
              <th>عدد الطلبات</th>
              <th>الرصيد الحالي</th>
              <th>آخر نشاط</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={6} className="no-data">
                  {searchTerm || balanceFilter !== "all"
                    ? "لا توجد نتائج للبحث"
                    : "لا يوجد عملاء بعد"}
                </td>
              </tr>
            ) : (
              filteredCustomers.map((customer) => (
                <tr key={customer.id} className="customer-row">
                  <td>
                    <div className="customer-info">
                      <div className="customer-avatar">
                        <User className="avatar-icon" />
                      </div>
                      <div className="customer-details">
                        <span className="customer-name">{customer.name}</span>
                        {customer.notes && (
                          <span className="customer-notes">
                            {customer.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="phone-info">
                      <Phone className="phone-icon" />
                      <span className="phone-number">{customer.phone}</span>
                    </div>
                  </td>
                  <td>
                    <div className="orders-info">
                      <Package className="orders-icon" />
                      <span className="orders-count">
                        {customer.numberOfOrders}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div
                      className={`balance-info ${getBalanceClass(
                        customer.currentBalance
                      )}`}
                    >
                      <DollarSign className="balance-icon" />
                      <span className="balance-amount">
                        {formatCurrency(Math.abs(customer.currentBalance))}
                      </span>
                      <span className="balance-status">
                        {getBalanceText(customer.currentBalance)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="activity-info">
                      <Calendar className="activity-icon" />
                      <span className="activity-date">
                        {formatDate(customer.lastActivity)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="action-btn view"
                        onClick={() => openCustomerAccount(customer.id)}
                        title="فتح الحساب"
                      >
                        <Eye />
                      </button>
                      <button
                        className="action-btn edit"
                        onClick={() => openEditModal(customer)}
                        title="تعديل"
                      >
                        <Edit />
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => openDeleteModal(customer)}
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

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>إضافة عميل جديد</h3>
              <button
                className="close-btn"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>اسم العميل *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="أدخل اسم العميل"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>رقم الهاتف *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="أدخل رقم الهاتف"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
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
                onClick={handleAddCustomer}
                disabled={!formData.name || !formData.phone}
              >
                إضافة العميل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {showEditModal && selectedCustomer && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>تعديل العميل</h3>
              <button
                className="close-btn"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>اسم العميل *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="أدخل اسم العميل"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>رقم الهاتف *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  placeholder="أدخل رقم الهاتف"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
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
                onClick={handleEditCustomer}
                disabled={!formData.name || !formData.phone}
              >
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedCustomer && (
        <div className="modal-overlay">
          <div className="modal delete-modal">
            <div className="modal-header">
              <h3>تأكيد الحذف</h3>
              <button
                className="close-btn"
                onClick={() => setShowDeleteModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                هل أنت متأكد من حذف العميل{" "}
                <strong>{selectedCustomer.name}</strong>؟
              </p>
              <p className="warning-text">لا يمكن التراجع عن هذا الإجراء!</p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                إلغاء
              </button>
              <button className="btn-danger" onClick={handleDeleteCustomer}>
                حذف العميل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
