import React, { useState, useEffect } from "react";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  User,
  Package,
  DollarSign,
  Calendar,
  SortAsc,
  SortDesc,
  Printer,
  Eye,
  RefreshCw,
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

import { useNavigate } from "react-router-dom";
import "./Suppliers.css";

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  totalElements: number;
  totalValue: number;
  lastOrderDate?: string;
  createdAt: string;
  updatedAt?: string;
}

interface SupplierElement {
  id: string;
  supplierId: string;
  supplierName: string;
  orderId: string;
  orderTitle: string;
  customerId: string;
  customerName: string;
  elementName: string;
  elementType: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  orderDate: string;
  notes?: string;
}

export function Suppliers() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState<Supplier[]>([]);
  const [supplierElements, setSupplierElements] = useState<SupplierElement[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState({
    field: "name",
    order: "asc" as "asc" | "desc",
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [suppliers, searchTerm, sortBy]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch suppliers
      const suppliersSnapshot = await getDocs(
        query(collection(db, "suppliers"), orderBy("createdAt", "desc"))
      );
      const suppliersData: Supplier[] = [];
      suppliersSnapshot.forEach((doc) => {
        suppliersData.push({ id: doc.id, ...doc.data() } as Supplier);
      });

      // Fetch supplier elements from orderItems collection
      const orderItemsSnapshot = await getDocs(collection(db, "orderItems"));
      const elementsData: SupplierElement[] = [];

      // Also fetch orders to get order titles and customer IDs
      const ordersSnapshot = await getDocs(collection(db, "orders"));
      const ordersMap: { [key: string]: any } = {};
      ordersSnapshot.forEach((orderDoc) => {
        ordersMap[orderDoc.id] = orderDoc.data();
      });

      // Also fetch customers to get customer names
      const customersSnapshot = await getDocs(collection(db, "customers"));
      const customersMap: { [key: string]: any } = {};
      customersSnapshot.forEach((customerDoc) => {
        customersMap[customerDoc.id] = customerDoc.data();
      });

      orderItemsSnapshot.forEach((itemDoc) => {
        const itemData = itemDoc.data();
        if (itemData.supplierId && itemData.supplierName) {
          const orderId = itemData.orderId;
          const orderData = ordersMap[orderId];
          const customerId = orderData?.customerId;
          const customerData = customersMap[customerId];

          elementsData.push({
            id: itemDoc.id,
            supplierId: itemData.supplierId,
            supplierName: itemData.supplierName,
            orderId: orderId,
            orderTitle: orderData?.title || "طلب بدون عنوان",
            customerId: customerId || "",
            customerName: customerData?.name || "عميل غير معروف",
            elementName: itemData.name,
            elementType: itemData.type,
            quantity: itemData.quantity,
            unit: itemData.unit,
            unitPrice: itemData.unitPrice,
            totalPrice: itemData.total,
            orderDate: orderData?.date || itemData.createdAt,
            notes: itemData.notes,
          });
        }
      });

      setSupplierElements(elementsData);

      // Calculate supplier statistics
      const suppliersWithStats = suppliersData.map((supplier) => {
        const supplierElementsList = elementsData.filter(
          (element) => element.supplierId === supplier.id
        );

        const totalElements = supplierElementsList.length;
        const totalValue = supplierElementsList.reduce(
          (sum, element) => sum + (element.totalPrice || 0),
          0
        );

        const lastOrderDate =
          supplierElementsList.length > 0
            ? supplierElementsList.sort(
                (a, b) =>
                  new Date(b.orderDate).getTime() -
                  new Date(a.orderDate).getTime()
              )[0].orderDate
            : undefined;

        return {
          ...supplier,
          totalElements,
          totalValue,
          lastOrderDate,
        };
      });

      setSuppliers(suppliersWithStats);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...suppliers];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(
        (supplier) =>
          supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          supplier.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          supplier.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy.field as keyof Supplier];
      let bValue: any = b[sortBy.field as keyof Supplier];

      if (sortBy.field === "lastOrderDate") {
        aValue = aValue ? new Date(aValue).getTime() : 0;
        bValue = bValue ? new Date(bValue).getTime() : 0;
      }

      if (sortBy.order === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredSuppliers(filtered);
  };

  const handleAddSupplier = async () => {
    try {
      const newSupplier = {
        ...supplierForm,
        totalElements: 0,
        totalValue: 0,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "suppliers"), newSupplier);
      const newSupplierWithId = {
        id: docRef.id,
        ...newSupplier,
      };

      alert("تم إضافة المورد بنجاح!");
      setShowAddModal(false);
      setSupplierForm({
        name: "",
        phone: "",
        email: "",
        address: "",
        notes: "",
      });
    } catch (error) {
      console.error("Error adding supplier:", error);
    }
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierForm({
      name: supplier.name,
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
    });
    setShowEditModal(true);
  };

  const handleUpdateSupplier = async () => {
    if (!editingSupplier) return;

    try {
      const updatedSupplier = {
        ...supplierForm,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(
        doc(db, "suppliers", editingSupplier.id),
        updatedSupplier
      );

      // Update cache
      const updatedSupplierWithId = {
        ...editingSupplier,
        ...updatedSupplier,
      };

      alert("تم تحديث المورد بنجاح!");
      setShowEditModal(false);
      setEditingSupplier(null);
      setSupplierForm({
        name: "",
        phone: "",
        email: "",
        address: "",
        notes: "",
      });
    } catch (error) {
      console.error("Error updating supplier:", error);
    }
  };

  const handleDeleteSupplier = async (supplier: Supplier) => {
    if (!confirm("هل أنت متأكد من حذف هذا المورد؟")) return;

    try {
      await deleteDoc(doc(db, "suppliers", supplier.id));

      alert("تم حذف المورد بنجاح!");
    } catch (error) {
      console.error("Error deleting supplier:", error);
    }
  };

  const handleViewSupplier = (supplier: Supplier) => {
    navigate(`/suppliers/${supplier.id}`);
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

  const printSuppliers = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>قائمة الموردين</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .summary { margin-top: 20px; padding: 15px; background-color: #f9fafb; border-radius: 8px; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>قائمة الموردين</h1>
              <p>تم طباعة هذا التقرير في: ${new Date().toLocaleDateString(
                "en-US"
              )}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>اسم المورد</th>
                  <th>الهاتف</th>
                  <th>البريد الإلكتروني</th>
                  <th>عدد العناصر</th>
                  <th>إجمالي القيمة</th>
                  <th>آخر طلبية</th>
                </tr>
              </thead>
              <tbody>
                ${filteredSuppliers
                  .map(
                    (supplier) => `
                  <tr>
                    <td>${supplier.name}</td>
                    <td>${supplier.phone || "-"}</td>
                    <td>${supplier.email || "-"}</td>
                    <td>${supplier.totalElements || 0}</td>
                    <td>${formatCurrency(supplier.totalValue || 0)}</td>
                    <td>${
                      supplier.lastOrderDate
                        ? formatDate(supplier.lastOrderDate)
                        : "-"
                    }</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="summary">
              <h3>ملخص</h3>
              <p><strong>إجمالي الموردين:</strong> ${
                filteredSuppliers.length
              }</p>
              <p><strong>إجمالي العناصر:</strong> ${filteredSuppliers.reduce(
                (sum, s) => sum + (s.totalElements || 0),
                0
              )}</p>
              <p><strong>إجمالي القيمة:</strong> ${formatCurrency(
                filteredSuppliers.reduce(
                  (sum, s) => sum + (s.totalValue || 0),
                  0
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
      console.error("Error printing suppliers:", error);
      alert("حدث خطأ أثناء الطباعة");
    }
  };

  if (loading) {
    return (
      <div className="suppliers-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل الموردين...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="suppliers-container">
      {/* Header */}
      <div className="suppliers-header">
        <div className="suppliers-header-content">
          <h1>الموردين</h1>
          <p>إدارة جميع الموردين والعناصر الموردة</p>
        </div>
        <div className="suppliers-header-actions">
          <button
            className="suppliers-print-btn"
            onClick={printSuppliers}
            title="طباعة قائمة الموردين"
          >
            <Printer className="suppliers-btn-icon" />
            طباعة
          </button>
          <button
            className="suppliers-refresh-btn"
            onClick={() => fetchData()}
            title="تحديث البيانات"
          >
            <RefreshCw className="suppliers-btn-icon" />
            تحديث
          </button>
          <button
            className="suppliers-add-supplier-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="suppliers-btn-icon" />
            إضافة مورد جديد
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="suppliers-search-section">
        <div className="suppliers-search-box">
          <Search className="suppliers-search-icon" />
          <input
            type="text"
            placeholder="البحث بالاسم أو الهاتف أو البريد الإلكتروني..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="suppliers-search-input"
          />
        </div>
      </div>

      {/* Summary Section */}
      <div className="suppliers-summary-section">
        <div className="suppliers-summary-cards">
          <div className="suppliers-summary-card">
            <div className="suppliers-summary-icon">
              <User />
            </div>
            <div className="suppliers-summary-content">
              <h3>إجمالي الموردين</h3>
              <p className="suppliers-summary-number">
                {filteredSuppliers.length}
              </p>
            </div>
          </div>
          <div className="suppliers-summary-card">
            <div className="suppliers-summary-icon">
              <Package />
            </div>
            <div className="suppliers-summary-content">
              <h3>إجمالي العناصر</h3>
              <p className="suppliers-summary-number">
                {filteredSuppliers.reduce(
                  (sum, s) => sum + (s.totalElements || 0),
                  0
                )}
              </p>
            </div>
          </div>
          <div className="suppliers-summary-card">
            <div className="suppliers-summary-icon">
              <DollarSign />
            </div>
            <div className="suppliers-summary-content">
              <h3>إجمالي القيمة</h3>
              <p className="suppliers-summary-number">
                {formatCurrency(
                  filteredSuppliers.reduce(
                    (sum, s) => sum + (s.totalValue || 0),
                    0
                  )
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="suppliers-table-container">
        <table className="suppliers-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("name")} className="sortable">
                <div className="suppliers-th-content">
                  <User className="suppliers-th-icon" />
                  اسم المورد
                  {getSortIcon("name")}
                </div>
              </th>
              <th>معلومات الاتصال</th>
              <th
                onClick={() => handleSort("totalElements")}
                className="sortable"
              >
                <div className="suppliers-th-content">
                  <Package className="suppliers-th-icon" />
                  العناصر
                  {getSortIcon("totalElements")}
                </div>
              </th>
              <th onClick={() => handleSort("totalValue")} className="sortable">
                <div className="suppliers-th-content">
                  <DollarSign className="suppliers-th-icon" />
                  إجمالي القيمة
                  {getSortIcon("totalValue")}
                </div>
              </th>
              <th
                onClick={() => handleSort("lastOrderDate")}
                className="sortable"
              >
                <div className="suppliers-th-content">
                  <Calendar className="suppliers-th-icon" />
                  آخر طلبية
                  {getSortIcon("lastOrderDate")}
                </div>
              </th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={6} className="suppliers-no-data">
                  لا توجد موردين
                </td>
              </tr>
            ) : (
              filteredSuppliers.map((supplier) => (
                <tr key={supplier.id} className="suppliers-supplier-row">
                  <td>
                    <div className="suppliers-supplier-info">
                      <div className="suppliers-supplier-avatar">
                        <User className="suppliers-avatar-icon" />
                      </div>
                      <div className="suppliers-supplier-details">
                        <span
                          className="suppliers-supplier-name clickable"
                          onClick={() => handleViewSupplier(supplier)}
                          title="انقر لعرض التفاصيل"
                        >
                          {supplier.name}
                        </span>
                        {supplier.notes && (
                          <span className="suppliers-supplier-notes">
                            {supplier.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="suppliers-contact-info">
                      {supplier.phone && (
                        <div className="suppliers-contact-item">
                          <span className="suppliers-contact-label">هاتف:</span>
                          <span className="suppliers-contact-value">
                            {supplier.phone}
                          </span>
                        </div>
                      )}
                      {supplier.email && (
                        <div className="suppliers-contact-item">
                          <span className="suppliers-contact-label">بريد:</span>
                          <span className="suppliers-contact-value">
                            {supplier.email}
                          </span>
                        </div>
                      )}
                      {supplier.address && (
                        <div className="suppliers-contact-item">
                          <span className="suppliers-contact-label">
                            عنوان:
                          </span>
                          <span className="suppliers-contact-value">
                            {supplier.address}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="suppliers-elements-count">
                      <span className="suppliers-count-number">
                        {supplier.totalElements || 0}
                      </span>
                      <span className="suppliers-count-label">عنصر</span>
                    </div>
                  </td>
                  <td>
                    <div className="suppliers-value-amount">
                      {formatCurrency(supplier.totalValue || 0)}
                    </div>
                  </td>
                  <td>
                    <div className="suppliers-last-order">
                      {supplier.lastOrderDate ? (
                        <span className="suppliers-order-date">
                          {formatDate(supplier.lastOrderDate)}
                        </span>
                      ) : (
                        <span className="suppliers-no-orders">
                          لا توجد طلبيات
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="suppliers-action-buttons">
                      <button
                        className="suppliers-action-btn view"
                        onClick={() => handleViewSupplier(supplier)}
                        title="عرض التفاصيل"
                      >
                        <Eye />
                      </button>
                      <button
                        className="suppliers-action-btn edit"
                        onClick={() => handleEditSupplier(supplier)}
                        title="تعديل"
                      >
                        <Edit />
                      </button>
                      <button
                        className="suppliers-action-btn delete"
                        onClick={() => handleDeleteSupplier(supplier)}
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

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="suppliers-modal-overlay">
          <div className="suppliers-modal">
            <div className="suppliers-modal-header">
              <h3>إضافة مورد جديد</h3>
              <button
                className="suppliers-close-btn"
                onClick={() => setShowAddModal(false)}
              >
                ×
              </button>
            </div>
            <div className="suppliers-modal-body">
              <div className="suppliers-form-group">
                <label>اسم المورد *</label>
                <input
                  type="text"
                  value={supplierForm.name}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, name: e.target.value })
                  }
                  placeholder="أدخل اسم المورد"
                  className="suppliers-form-input"
                />
              </div>

              <div className="suppliers-form-row">
                <div className="suppliers-form-group">
                  <label>رقم الهاتف (اختياري)</label>
                  <input
                    type="tel"
                    value={supplierForm.phone}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        phone: e.target.value,
                      })
                    }
                    placeholder="أدخل رقم الهاتف"
                    className="suppliers-form-input"
                  />
                </div>
                <div className="suppliers-form-group">
                  <label>البريد الإلكتروني (اختياري)</label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        email: e.target.value,
                      })
                    }
                    placeholder="أدخل البريد الإلكتروني"
                    className="suppliers-form-input"
                  />
                </div>
              </div>

              <div className="suppliers-form-group">
                <label>العنوان (اختياري)</label>
                <input
                  type="text"
                  value={supplierForm.address}
                  onChange={(e) =>
                    setSupplierForm({
                      ...supplierForm,
                      address: e.target.value,
                    })
                  }
                  placeholder="أدخل العنوان"
                  className="suppliers-form-input"
                />
              </div>

              <div className="suppliers-form-group">
                <label>ملاحظات (اختياري)</label>
                <textarea
                  value={supplierForm.notes}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="suppliers-form-textarea"
                  rows={3}
                />
              </div>
            </div>
            <div className="suppliers-modal-footer">
              <button
                className="suppliers-btn-secondary"
                onClick={() => setShowAddModal(false)}
              >
                إلغاء
              </button>
              <button
                className="suppliers-btn-primary"
                onClick={handleAddSupplier}
                disabled={!supplierForm.name.trim()}
              >
                إضافة المورد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Supplier Modal */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>تعديل المورد</h3>
              <button
                className="close-btn"
                onClick={() => setShowEditModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="suppliers-form-group">
                <label>اسم المورد *</label>
                <input
                  type="text"
                  value={supplierForm.name}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, name: e.target.value })
                  }
                  placeholder="أدخل اسم المورد"
                  className="suppliers-form-input"
                />
              </div>

              <div className="suppliers-form-row">
                <div className="suppliers-form-group">
                  <label>رقم الهاتف (اختياري)</label>
                  <input
                    type="tel"
                    value={supplierForm.phone}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        phone: e.target.value,
                      })
                    }
                    placeholder="أدخل رقم الهاتف"
                    className="suppliers-form-input"
                  />
                </div>
                <div className="suppliers-form-group">
                  <label>البريد الإلكتروني (اختياري)</label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) =>
                      setSupplierForm({
                        ...supplierForm,
                        email: e.target.value,
                      })
                    }
                    placeholder="أدخل البريد الإلكتروني"
                    className="suppliers-form-input"
                  />
                </div>
              </div>

              <div className="suppliers-form-group">
                <label>العنوان (اختياري)</label>
                <input
                  type="text"
                  value={supplierForm.address}
                  onChange={(e) =>
                    setSupplierForm({
                      ...supplierForm,
                      address: e.target.value,
                    })
                  }
                  placeholder="أدخل العنوان"
                  className="suppliers-form-input"
                />
              </div>

              <div className="suppliers-form-group">
                <label>ملاحظات (اختياري)</label>
                <textarea
                  value={supplierForm.notes}
                  onChange={(e) =>
                    setSupplierForm({ ...supplierForm, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="suppliers-form-textarea"
                  rows={3}
                />
              </div>
            </div>
            <div className="suppliers-modal-footer">
              <button
                className="suppliers-btn-secondary"
                onClick={() => setShowEditModal(false)}
              >
                إلغاء
              </button>
              <button
                className="suppliers-btn-primary"
                onClick={handleUpdateSupplier}
                disabled={!supplierForm.name.trim()}
              >
                تحديث المورد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
