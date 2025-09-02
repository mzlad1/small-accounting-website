import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  Edit,
  Trash2,
  ArrowLeft,
  Package,
  User,
  Calendar,
  DollarSign,
  CheckCircle,
  Clock,
  XCircle,
  Save,
  X,
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
import "./OrderDetails.css";

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
  notes?: string;
  createdAt: string;
}

interface OrderItem {
  id: string;
  orderId: string;
  name: string;
  type: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  notes?: string;
  createdAt: string;
}

export function OrderDetails() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [showDeleteItemModal, setShowDeleteItemModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OrderItem | null>(null);
  const [filters, setFilters] = useState({
    type: "all",
  });
  const [sortBy, setSortBy] = useState({
    field: "name",
    order: "asc" as "asc" | "desc",
  });

  // Form states
  const [itemForm, setItemForm] = useState({
    name: "",
    type: "",
    quantity: 1,
    unit: "",
    unitPrice: 0,
    notes: "",
  });

  const [orderStatus, setOrderStatus] = useState<Order["status"]>("pending");

  useEffect(() => {
    if (orderId) {
      fetchOrderData();
    }
  }, [orderId]);

  useEffect(() => {
    if (order) {
      setOrderStatus(order.status);
    }
  }, [order]);

  const fetchOrderData = async () => {
    try {
      setLoading(true);

      // Fetch order details
      const orderDoc = await getDocs(
        query(collection(db, "orders"), where("__name__", "==", orderId))
      );
      if (!orderDoc.empty) {
        const orderData = {
          id: orderDoc.docs[0].id,
          ...orderDoc.docs[0].data(),
        } as Order;
        setOrder(orderData);
        setOrderStatus(orderData.status);
      }

      // Fetch order items
      const itemsSnapshot = await getDocs(
        query(
          collection(db, "orderItems"),
          where("orderId", "==", orderId),
          orderBy("createdAt", "asc")
        )
      );
      const itemsData: OrderItem[] = [];
      itemsSnapshot.forEach((doc) => {
        itemsData.push({ id: doc.id, ...doc.data() } as OrderItem);
      });
      setItems(itemsData);
    } catch (error) {
      console.error("Error fetching order data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    try {
      const total = itemForm.quantity * itemForm.unitPrice;
      const newItem = {
        ...itemForm,
        orderId: orderId!,
        total,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "orderItems"), newItem);
      setShowAddItemModal(false);
      setItemForm({
        name: "",
        type: "",
        quantity: 1,
        unit: "",
        unitPrice: 0,
        notes: "",
      });
      fetchOrderData();
    } catch (error) {
      console.error("Error adding item:", error);
    }
  };

  const handleEditItem = async () => {
    if (!selectedItem) return;

    try {
      const total = itemForm.quantity * itemForm.unitPrice;
      const updatedItem = {
        ...itemForm,
        total,
      };

      await updateDoc(doc(db, "orderItems", selectedItem.id), updatedItem);
      setShowEditItemModal(false);
      setSelectedItem(null);
      setItemForm({
        name: "",
        type: "",
        quantity: 1,
        unit: "",
        unitPrice: 0,
        notes: "",
      });
      fetchOrderData();
    } catch (error) {
      console.error("Error updating item:", error);
    }
  };

  const handleDeleteItem = async () => {
    if (!selectedItem) return;

    try {
      await deleteDoc(doc(db, "orderItems", selectedItem.id));
      setShowDeleteItemModal(false);
      setSelectedItem(null);
      fetchOrderData();
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const handleStatusChange = async (newStatus: Order["status"]) => {
    if (!order) return;

    try {
      await updateDoc(doc(db, "orders", order.id), { status: newStatus });
      setOrderStatus(newStatus);
      fetchOrderData();
    } catch (error) {
      console.error("Error updating order status:", error);
    }
  };

  const printOrder = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const orderTotal = calculateOrderTotal();

        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>تفاصيل الطلب - ${order?.title}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
              .order-info { margin-bottom: 20px; }
              .order-info p { margin: 5px 0; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .total { font-weight: bold; font-size: 1.2em; margin-top: 20px; }
              .status { display: inline-block; padding: 4px 8px; border-radius: 4px; color: white; }
              .status.pending { background-color: #f59e0b; }
              .status.in-progress { background-color: #3b82f6; }
              .status.completed { background-color: #10b981; }
              .status.cancelled { background-color: #ef4444; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>تفاصيل الطلب</h1>
            </div>
            <div class="order-info">
              <p><strong>عنوان الطلب:</strong> ${order?.title}</p>
              <p><strong>العميل:</strong> ${order?.customerName}</p>
              <p><strong>التاريخ:</strong> ${formatDate(order?.date || "")}</p>
              <p><strong>الحالة:</strong> <span class="status ${orderStatus}">${getStatusText(
          orderStatus
        )}</span></p>
              ${
                order?.notes
                  ? `<p><strong>ملاحظات:</strong> ${order.notes}</p>`
                  : ""
              }
            </div>
            <table>
              <thead>
                <tr>
                  <th>اسم العنصر</th>
                  <th>النوع</th>
                  <th>الكمية</th>
                  <th>الوحدة</th>
                  <th>سعر الوحدة</th>
                  <th>المجموع</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.type}</td>
                    <td>${item.quantity}</td>
                    <td>${item.unit}</td>
                    <td>${formatCurrency(item.unitPrice)}</td>
                    <td>${formatCurrency(item.total)}</td>
                    <td>${item.notes || "-"}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="total">
              <p><strong>إجمالي الطلب: ${formatCurrency(
                orderTotal
              )}</strong></p>
            </div>
            <div style="margin-top: 30px; text-align: center; color: #666;">
              <p>تم طباعة هذا التقرير في: ${new Date().toLocaleDateString(
                "ar-SA"
              )}</p>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error("Error printing order:", error);
      alert("حدث خطأ أثناء الطباعة");
    }
  };

  const openEditItemModal = (item: OrderItem) => {
    setSelectedItem(item);
    setItemForm({
      name: item.name,
      type: item.type,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      notes: item.notes || "",
    });
    setShowEditItemModal(true);
  };

  const openDeleteItemModal = (item: OrderItem) => {
    setSelectedItem(item);
    setShowDeleteItemModal(true);
  };

  const getFilteredAndSortedItems = () => {
    let filtered = [...items];

    // Apply type filter
    if (filters.type !== "all") {
      filtered = filtered.filter((item) => item.type === filters.type);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy.field as keyof OrderItem];
      let bValue: any = b[sortBy.field as keyof OrderItem];

      if (sortBy.order === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
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
        return <CheckCircle className="status-icon" />;
      case "in-progress":
        return <Clock className="status-icon" />;
      case "pending":
        return <Clock className="status-icon" />;
      case "cancelled":
        return <XCircle className="status-icon" />;
      default:
        return <Clock className="status-icon" />;
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

  const calculateOrderTotal = () => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  const getUniqueTypes = () => {
    const types = items.map((item) => item.type);
    return ["all", ...Array.from(new Set(types))];
  };

  if (loading) {
    return (
      <div className="od-order-details-container">
        <div className="od-loading-spinner">
          <div className="od-spinner"></div>
          <p>جاري تحميل تفاصيل الطلب...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="od-order-details-container">
        <div className="od-error-message">
          <p>لم يتم العثور على الطلب</p>
          <button
            onClick={() => navigate("/orders")}
            className="od-btn-secondary"
          >
            العودة إلى الطلبات
          </button>
        </div>
      </div>
    );
  }

  const filteredItems = getFilteredAndSortedItems();
  const orderTotal = calculateOrderTotal();

  return (
    <div className="od-order-details-container">
      {/* Header */}
      <div className="od-order-header">
        <div className="od-header-left">
          <button onClick={() => navigate("/orders")} className="od-back-btn">
            <ArrowLeft className="od-back-icon" />
            العودة إلى الطلبات
          </button>
          <div className="od-order-info">
            <h1 className="od-order-title">{order.title}</h1>
            <div className="od-order-meta">
              <span className="od-customer-name">
                <User className="od-meta-icon" />
                {order.customerName}
              </span>
              <span className="od-order-date">
                <Calendar className="od-meta-icon" />
                {formatDate(order.date)}
              </span>
            </div>
          </div>
        </div>
        <div className="od-header-actions">
          <button className="od-print-btn" onClick={printOrder}>
            <Printer className="od-btn-icon" />
            طباعة
          </button>
          <div className="od-status-selector">
            <label>تغيير الحالة:</label>
            <select
              value={orderStatus}
              onChange={(e) =>
                handleStatusChange(e.target.value as Order["status"])
              }
              className="od-status-select"
            >
              <option value="pending">في الانتظار</option>
              <option value="in-progress">قيد التنفيذ</option>
              <option value="completed">مكتمل</option>
              <option value="cancelled">ملغي</option>
            </select>
          </div>
        </div>
      </div>

      {/* Order Details Card */}
      <div className="od-order-details-card">
        <div className="od-details-grid">
          <div className="od-detail-item">
            <label>الحالة الحالية:</label>
            <div className={`od-status-badge ${getStatusClass(orderStatus)}`}>
              {getStatusIcon(orderStatus)}
              {getStatusText(orderStatus)}
            </div>
          </div>
          <div className="od-detail-item">
            <label>إجمالي الطلب:</label>
            <span className="od-order-total">{formatCurrency(orderTotal)}</span>
          </div>
          <div className="od-detail-item">
            <label>عدد العناصر:</label>
            <span className="od-items-count">{items.length}</span>
          </div>
          {order.notes && (
            <div className="od-detail-item od-full-width">
              <label>ملاحظات الطلب:</label>
              <span className="od-order-notes">{order.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Items Section */}
      <div className="od-items-section">
        <div className="od-section-header">
          <h2>عناصر الطلب</h2>
          <button
            className="od-add-item-btn"
            onClick={() => setShowAddItemModal(true)}
          >
            <Plus className="od-btn-icon" />
            إضافة عنصر
          </button>
        </div>

        {/* Filters and Sorting */}
        <div className="od-filters-section">
          <div className="od-filter-group">
            <label>النوع:</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="od-filter-select"
            >
              {getUniqueTypes().map((type) => (
                <option key={type} value={type}>
                  {type === "all" ? "جميع الأنواع" : type}
                </option>
              ))}
            </select>
          </div>

          <div className="od-sort-group">
            <label>ترتيب حسب:</label>
            <select
              value={sortBy.field}
              onChange={(e) => setSortBy({ ...sortBy, field: e.target.value })}
              className="od-sort-select"
            >
              <option value="name">الاسم</option>
              <option value="type">النوع</option>
              <option value="quantity">الكمية</option>
              <option value="unitPrice">السعر</option>
              <option value="total">الإجمالي</option>
            </select>
            <button
              className="od-sort-direction-btn"
              onClick={() =>
                setSortBy({
                  ...sortBy,
                  order: sortBy.order === "asc" ? "desc" : "asc",
                })
              }
            >
              {sortBy.order === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>

        {/* Items Table */}
        <div className="od-table-container">
          <table className="od-items-table">
            <thead>
              <tr>
                <th>اسم العنصر</th>
                <th>النوع</th>
                <th>الكمية</th>
                <th>الوحدة</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
                <th>ملاحظات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="od-no-data">
                    لا توجد عناصر في هذا الطلب
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="od-item-row">
                    <td>
                      <div className="od-item-name">{item.name}</div>
                    </td>
                    <td>
                      <div className="od-item-type">{item.type}</div>
                    </td>
                    <td>
                      <div className="od-item-quantity">{item.quantity}</div>
                    </td>
                    <td>
                      <div className="od-item-unit">{item.unit}</div>
                    </td>
                    <td>
                      <div className="od-item-unit-price">
                        {formatCurrency(item.unitPrice)}
                      </div>
                    </td>
                    <td>
                      <div className="od-item-total">
                        {formatCurrency(item.total)}
                      </div>
                    </td>
                    <td>
                      <div className="od-item-notes">{item.notes || "-"}</div>
                    </td>
                    <td>
                      <div className="od-action-buttons">
                        <button
                          className="od-action-btn edit"
                          onClick={() => openEditItemModal(item)}
                          title="تعديل"
                        >
                          <Edit />
                        </button>
                        <button
                          className="od-action-btn delete"
                          onClick={() => openDeleteItemModal(item)}
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

        {/* Order Summary */}
        <div className="od-order-summary">
          <div className="od-summary-item">
            <span>إجمالي العناصر:</span>
            <span>{items.length}</span>
          </div>
          <div className="od-summary-item total">
            <span>إجمالي الطلب:</span>
            <span>{formatCurrency(orderTotal)}</span>
          </div>
        </div>
      </div>

      {/* Add Item Modal */}
      {showAddItemModal && (
        <div className="od-modal-overlay">
          <div className="od-modal">
            <div className="od-modal-header">
              <h3>إضافة عنصر جديد</h3>
              <button
                className="od-close-btn"
                onClick={() => setShowAddItemModal(false)}
              >
                <X />
              </button>
            </div>
            <div className="od-modal-body">
              <div className="od-form-group">
                <label>اسم العنصر *</label>
                <input
                  type="text"
                  value={itemForm.name}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, name: e.target.value })
                  }
                  placeholder="أدخل اسم العنصر"
                  className="od-form-input"
                />
              </div>

              <div className="od-form-row">
                <div className="od-form-group">
                  <label>النوع *</label>
                  <input
                    type="text"
                    value={itemForm.type}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, type: e.target.value })
                    }
                    placeholder="مثل: جبس، دهان، بلاط"
                    className="od-form-input"
                  />
                </div>
                <div className="od-form-group">
                  <label>الوحدة *</label>
                  <input
                    type="text"
                    value={itemForm.unit}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, unit: e.target.value })
                    }
                    placeholder="مثل: متر، قطعة، كيلو"
                    className="od-form-input"
                  />
                </div>
              </div>

              <div className="od-form-row">
                <div className="od-form-group">
                  <label>الكمية *</label>
                  <input
                    type="number"
                    value={itemForm.quantity}
                    onChange={(e) =>
                      setItemForm({
                        ...itemForm,
                        quantity: parseFloat(e.target.value),
                      })
                    }
                    min="0.01"
                    step="0.01"
                    className="od-form-input"
                  />
                </div>
                <div className="od-form-group">
                  <label>سعر الوحدة *</label>
                  <input
                    type="number"
                    value={itemForm.unitPrice}
                    onChange={(e) =>
                      setItemForm({
                        ...itemForm,
                        unitPrice: parseFloat(e.target.value),
                      })
                    }
                    min="0"
                    step="0.01"
                    className="od-form-input"
                  />
                </div>
              </div>

              <div className="od-form-group">
                <label>ملاحظات</label>
                <textarea
                  value={itemForm.notes}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="od-form-textarea"
                  rows={3}
                />
              </div>

              {itemForm.quantity > 0 && itemForm.unitPrice > 0 && (
                <div className="od-total-preview">
                  <span>الإجمالي:</span>
                  <span className="od-total-amount">
                    {formatCurrency(itemForm.quantity * itemForm.unitPrice)}
                  </span>
                </div>
              )}
            </div>
            <div className="od-modal-footer">
              <button
                className="od-btn-secondary"
                onClick={() => setShowAddItemModal(false)}
              >
                إلغاء
              </button>
              <button
                className="od-btn-primary"
                onClick={handleAddItem}
                disabled={
                  !itemForm.name ||
                  !itemForm.type ||
                  !itemForm.unit ||
                  itemForm.quantity <= 0 ||
                  itemForm.unitPrice <= 0
                }
              >
                إضافة العنصر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditItemModal && selectedItem && (
        <div className="od-modal-overlay">
          <div className="od-modal">
            <div className="od-modal-header">
              <h3>تعديل العنصر</h3>
              <button
                className="od-close-btn"
                onClick={() => setShowEditItemModal(false)}
              >
                <X />
              </button>
            </div>
            <div className="od-modal-body">
              <div className="od-form-group">
                <label>اسم العنصر *</label>
                <input
                  type="text"
                  value={itemForm.name}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, name: e.target.value })
                  }
                  placeholder="أدخل اسم العنصر"
                  className="od-form-input"
                />
              </div>

              <div className="od-form-row">
                <div className="od-form-group">
                  <label>النوع *</label>
                  <input
                    type="text"
                    value={itemForm.type}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, type: e.target.value })
                    }
                    placeholder="مثل: جبس، دهان، بلاط"
                    className="od-form-input"
                  />
                </div>
                <div className="od-form-group">
                  <label>الوحدة *</label>
                  <input
                    type="text"
                    value={itemForm.unit}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, unit: e.target.value })
                    }
                    placeholder="مثل: متر، قطعة، كيلو"
                    className="od-form-input"
                  />
                </div>
              </div>

              <div className="od-form-row">
                <div className="od-form-group">
                  <label>الكمية *</label>
                  <input
                    type="number"
                    value={itemForm.quantity}
                    onChange={(e) =>
                      setItemForm({
                        ...itemForm,
                        quantity: parseFloat(e.target.value),
                      })
                    }
                    min="0.01"
                    step="0.01"
                    className="od-form-input"
                  />
                </div>
                <div className="od-form-group">
                  <label>سعر الوحدة *</label>
                  <input
                    type="number"
                    value={itemForm.unitPrice}
                    onChange={(e) =>
                      setItemForm({
                        ...itemForm,
                        unitPrice: parseFloat(e.target.value),
                      })
                    }
                    min="0"
                    step="0.01"
                    className="od-form-input"
                  />
                </div>
              </div>

              <div className="od-form-group">
                <label>ملاحظات</label>
                <textarea
                  value={itemForm.notes}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="od-form-textarea"
                  rows={3}
                />
              </div>

              {itemForm.quantity > 0 && itemForm.unitPrice > 0 && (
                <div className="od-total-preview">
                  <span>الإجمالي:</span>
                  <span className="od-total-amount">
                    {formatCurrency(itemForm.quantity * itemForm.unitPrice)}
                  </span>
                </div>
              )}
            </div>
            <div className="od-modal-footer">
              <button
                className="od-btn-secondary"
                onClick={() => setShowEditItemModal(false)}
              >
                إلغاء
              </button>
              <button
                className="od-btn-primary"
                onClick={handleEditItem}
                disabled={
                  !itemForm.name ||
                  !itemForm.type ||
                  !itemForm.unit ||
                  itemForm.quantity <= 0 ||
                  itemForm.unitPrice <= 0
                }
              >
                <Save className="od-btn-icon" />
                حفظ التغييرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Item Modal */}
      {showDeleteItemModal && selectedItem && (
        <div className="od-modal-overlay">
          <div className="od-modal od-delete-modal">
            <div className="od-modal-header">
              <h3>حذف العنصر</h3>
              <button
                className="od-close-btn"
                onClick={() => setShowDeleteItemModal(false)}
              >
                <X />
              </button>
            </div>
            <div className="od-modal-body">
              <p>هل أنت متأكد من حذف العنصر "{selectedItem.name}"؟</p>
              <p className="od-warning-text">لا يمكن التراجع عن هذا الإجراء.</p>
            </div>
            <div className="od-modal-footer">
              <button
                className="od-btn-secondary"
                onClick={() => setShowDeleteItemModal(false)}
              >
                إلغاء
              </button>
              <button className="od-btn-danger" onClick={handleDeleteItem}>
                <Trash2 className="od-btn-icon" />
                حذف العنصر
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
