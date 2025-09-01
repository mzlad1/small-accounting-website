import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Filter,
  Eye,
  Package,
  User,
  Calendar,
  DollarSign,
  SortAsc,
  SortDesc,
  CheckCircle,
  Clock,
  XCircle,
  Trash2,
} from "lucide-react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "./Orders.css";

interface Customer {
  id: string;
  name: string;
  phone: string;
}

interface Order {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  date: string;
  status: "pending" | "in-progress" | "completed" | "cancelled";
  numberOfItems: number; // This will be calculated from order items
  total: number; // This will be calculated from order items
  notes?: string;
  createdAt: string;
}

export function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    status: "all",
    customer: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [sortBy, setSortBy] = useState({
    field: "date",
    order: "desc" as "asc" | "desc",
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [orderForm, setOrderForm] = useState({
    customerId: "",
    title: "",
    date: new Date().toISOString().split("T")[0],
    status: "pending" as Order["status"],
    total: 0, // This will be calculated from order items later
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [orders, searchTerm, filters, sortBy]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch customers first
      const customersSnapshot = await getDocs(collection(db, "customers"));
      const customersData: Customer[] = [];
      customersSnapshot.forEach((doc) => {
        customersData.push({ id: doc.id, ...doc.data() } as Customer);
      });
      setCustomers(customersData);

      // Fetch orders with customer names
      const ordersSnapshot = await getDocs(
        query(collection(db, "orders"), orderBy("createdAt", "desc"))
      );
      const ordersData: Order[] = [];

      // Fetch all order items to calculate totals
      const orderItemsSnapshot = await getDocs(collection(db, "orderItems"));
      const orderItemsData: any[] = [];
      orderItemsSnapshot.forEach((doc) => {
        orderItemsData.push({ id: doc.id, ...doc.data() });
      });

      ordersSnapshot.forEach((doc) => {
        const orderData = doc.data();
        // Use customerName from order data if available, otherwise find from customers
        const customerName =
          orderData.customerName ||
          customersData.find((c) => c.id === orderData.customerId)?.name ||
          "Unknown Customer";

        // Calculate actual total and number of items from order items
        const orderItems = orderItemsData.filter(
          (item) => item.orderId === doc.id
        );
        const calculatedTotal = orderItems.reduce(
          (sum, item) => sum + (item.total || 0),
          0
        );
        const actualNumberOfItems = orderItems.length;

        ordersData.push({
          id: doc.id,
          ...orderData,
          customerName,
          total: calculatedTotal, // Use calculated total instead of stored total
          numberOfItems: actualNumberOfItems, // Use actual count instead of stored count
        } as Order);
      });
      setOrders(ordersData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...orders];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(
        (order) =>
          order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.title.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (filters.status !== "all") {
      filtered = filtered.filter((order) => order.status === filters.status);
    }

    // Apply customer filter
    if (filters.customer !== "all") {
      filtered = filtered.filter(
        (order) => order.customerId === filters.customer
      );
    }

    // Apply date filters
    if (filters.dateFrom) {
      filtered = filtered.filter(
        (order) => new Date(order.date) >= new Date(filters.dateFrom)
      );
    }
    if (filters.dateTo) {
      filtered = filtered.filter(
        (order) => new Date(order.date) <= new Date(filters.dateTo)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy.field as keyof Order];
      let bValue: any = b[sortBy.field as keyof Order];

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

    setFilteredOrders(filtered);
  };

  const handleAddOrder = async () => {
    try {
      // Get customer name for the selected customer
      const selectedCustomer = customers.find(
        (c) => c.id === orderForm.customerId
      );

      const newOrder = {
        ...orderForm,
        customerName: selectedCustomer?.name || "",
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "orders"), newOrder);
      setShowAddModal(false);
      setOrderForm({
        customerId: "",
        title: "",
        date: new Date().toISOString().split("T")[0],
        status: "pending",
        total: 0, // This will be calculated from order items later
        notes: "",
      });
      fetchData();
    } catch (error) {
      console.error("Error adding order:", error);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (window.confirm("هل أنت متأكد من حذف هذا الطلب؟")) {
      try {
        await deleteDoc(doc(db, "orders", orderId));
        fetchData();
      } catch (error) {
        console.error("Error deleting order:", error);
      }
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

  const getStatusClass = (status: string) => {
    switch (status) {
      case "completed":
        return "completed";
      case "in-progress":
        return "in-progress";
      case "pending":
        return "pending";
      case "cancelled":
        return "cancelled";
      default:
        return "pending";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "مكتمل";
      case "in-progress":
        return "قيد التنفيذ";
      case "pending":
        return "في الانتظار";
      case "cancelled":
        return "ملغي";
      default:
        return "في الانتظار";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="status-icon completed" />;
      case "in-progress":
        return <Clock className="status-icon pending" />;
      case "pending":
        return <Clock className="status-icon pending" />;
      case "cancelled":
        return <XCircle className="status-icon cancelled" />;
      default:
        return <Clock className="status-icon pending" />;
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

  if (loading) {
    return (
      <div className="orders-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل الطلبات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-container">
      {/* Header */}
      <div className="orders-header">
        <div className="header-content">
          <h1>الطلبات</h1>
          <p>إدارة جميع الطلبات من جميع العملاء</p>
        </div>
        <button className="add-order-btn" onClick={() => setShowAddModal(true)}>
          <Plus className="btn-icon" />
          إضافة طلب جديد
        </button>
      </div>

      {/* Summary Statistics */}
      <div className="summary-stats">
        <div className="stat-card">
          <Package className="stat-icon" />
          <div className="stat-content">
            <h3>إجمالي الطلبات</h3>
            <p className="stat-value">{orders.length}</p>
          </div>
        </div>
        <div className="stat-card">
          <DollarSign className="stat-icon" />
          <div className="stat-content">
            <h3>إجمالي القيمة</h3>
            <p className="stat-value">
              {formatCurrency(
                orders.reduce((sum, order) => sum + order.total, 0)
              )}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <User className="stat-icon" />
          <div className="stat-content">
            <h3>العملاء النشطون</h3>
            <p className="stat-value">
              {new Set(orders.map((order) => order.customerId)).size}
            </p>
          </div>
        </div>
        <div className="stat-card">
          <Package className="stat-icon" />
          <div className="stat-content">
            <h3>متوسط قيمة الطلب</h3>
            <p className="stat-value">
              {orders.length > 0
                ? formatCurrency(
                    orders.reduce((sum, order) => sum + order.total, 0) /
                      orders.length
                  )
                : formatCurrency(0)}
            </p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="search-filters-section">
        <div className="search-box">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="البحث بالعميل أو عنوان الطلب..."
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
              <option value="in-progress">قيد التنفيذ</option>
              <option value="completed">مكتمل</option>
              <option value="cancelled">ملغي</option>
            </select>
          </div>

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

      {/* Orders Table */}
      <div className="table-container">
        <table className="orders-table">
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
              <th onClick={() => handleSort("title")} className="sortable">
                <div className="th-content">
                  <Package className="th-icon" />
                  عنوان الطلب
                  {getSortIcon("title")}
                </div>
              </th>
              <th onClick={() => handleSort("date")} className="sortable">
                <div className="th-content">
                  <Calendar className="th-icon" />
                  التاريخ
                  {getSortIcon("date")}
                </div>
              </th>
              <th onClick={() => handleSort("status")} className="sortable">
                <div className="th-content">
                  <Package className="th-icon" />
                  الحالة
                  {getSortIcon("status")}
                </div>
              </th>

              <th onClick={() => handleSort("total")} className="sortable">
                <div className="th-content">
                  <DollarSign className="th-icon" />
                  الإجمالي
                  {getSortIcon("total")}
                </div>
              </th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="no-data">
                  لا توجد طلبات
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr key={order.id} className="order-row">
                  <td>
                    <div className="customer-info">
                      <div className="customer-avatar">
                        <User className="avatar-icon" />
                      </div>
                      <div className="customer-details">
                        <span className="customer-name">
                          {order.customerName}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="order-title">{order.title}</div>
                    {order.notes && (
                      <div className="order-notes">{order.notes}</div>
                    )}
                  </td>
                  <td>{formatDate(order.date)}</td>
                  <td>
                    <div
                      className={`status-badge ${getStatusClass(order.status)}`}
                    >
                      {getStatusIcon(order.status)}
                      {getStatusText(order.status)}
                    </div>
                  </td>

                  <td>
                    <div
                      className={`order-total ${
                        order.total <= 0 ? "undetermined" : ""
                      }`}
                    >
                      {order.total > 0
                        ? formatCurrency(order.total)
                        : "لا توجد عناصر"}
                    </div>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="action-btn view"
                        title="عرض التفاصيل"
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <Eye />
                      </button>
                      <button
                        className="action-btn delete"
                        title="حذف الطلب"
                        onClick={() => handleDeleteOrder(order.id)}
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

      {/* Add Order Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>إضافة طلب جديد</h3>
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
                  value={orderForm.customerId}
                  onChange={(e) =>
                    setOrderForm({ ...orderForm, customerId: e.target.value })
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

              <div className="form-group">
                <label>عنوان الطلب *</label>
                <input
                  type="text"
                  value={orderForm.title}
                  onChange={(e) =>
                    setOrderForm({ ...orderForm, title: e.target.value })
                  }
                  placeholder="أدخل عنوان الطلب"
                  className="form-input"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>التاريخ *</label>
                  <input
                    type="date"
                    value={orderForm.date}
                    onChange={(e) =>
                      setOrderForm({ ...orderForm, date: e.target.value })
                    }
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>الحالة *</label>
                  <select
                    value={orderForm.status}
                    onChange={(e) =>
                      setOrderForm({
                        ...orderForm,
                        status: e.target.value as Order["status"],
                      })
                    }
                    className="form-select"
                  >
                    <option value="pending">في الانتظار</option>
                    <option value="in-progress">قيد التنفيذ</option>
                    <option value="completed">مكتمل</option>
                    <option value="cancelled">ملغي</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={orderForm.notes}
                  onChange={(e) =>
                    setOrderForm({ ...orderForm, notes: e.target.value })
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
                onClick={handleAddOrder}
                disabled={!orderForm.customerId || !orderForm.title}
              >
                إضافة الطلب
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
