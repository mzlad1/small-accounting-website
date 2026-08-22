import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  User,
  Phone,
  Package,
  DollarSign,
  Calendar,
  SortAsc,
  SortDesc,
  Printer,
  Eye,
  RefreshCw,
  CheckCircle,
} from "lucide-react";
import {
  collection,
  getDocs,
  writeBatch,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  DocumentData,
  QuerySnapshot,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { fetchCacheFirst } from "../utils/cacheFirst";
import { subscribeAll } from "../utils/live";
import { matchesSearch } from "../utils/search";

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
  const [paginatedSuppliers, setPaginatedSuppliers] = useState<Supplier[]>([]);
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);

  // Add-modal: focus the first field on open, and keep the dialog open
  // after a successful add so several suppliers can be entered in a row.
  const addModalRef = useRef<HTMLDivElement | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  const focusFirstField = () => {
    setTimeout(() => {
      addModalRef.current
        ?.querySelector<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), select, textarea"
        )
        ?.focus();
    }, 60);
  };

  useEffect(() => {
    if (showAddModal) {
      setAddSuccess(false);
      focusFirstField();
    }
  }, [showAddModal]);

  // Cascade-delete flow: typed "موافق" confirmation required
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(
    null
  );
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const closeDeleteModal = () => {
    if (deleting) return;
    setShowDeleteModal(false);
    setSupplierToDelete(null);
    setDeleteConfirmText("");
  };

  useEffect(() => {
    setLoading(true);
    // Live subscription: instant paint from the persistent cache, then
    // the server, then every later change (own writes appear at once).
    const unsubscribe = subscribeAll(
      [
        query(collection(db, "suppliers"), orderBy("createdAt", "desc")),
        collection(db, "orderItems"),
        collection(db, "orders"),
        collection(db, "customers"),
      ],
      applySnapshots,
      () => setLoading(false),
      (error) => console.error("Error fetching data:", error)
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [suppliers, searchTerm, sortBy, currentPage, itemsPerPage]);

  // Any change to the search or the sort restarts the list from page 1
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy]);

  // Runs once from the local cache (instant paint) and again with the
  // server result. Must fully replace state, never append.
  const applySnapshots = (snapshots: Array<QuerySnapshot<DocumentData>>) => {
    const [
      suppliersSnapshot,
      orderItemsSnapshot,
      ordersSnapshot,
      customersSnapshot,
    ] = snapshots;

    // Fetch suppliers
    const suppliersData: Supplier[] = [];
    suppliersSnapshot.forEach((doc) => {
      suppliersData.push({ id: doc.id, ...doc.data() } as Supplier);
    });

    // Fetch supplier elements from orderItems collection
    const elementsData: SupplierElement[] = [];

    // Also fetch orders to get order titles and customer IDs
    const ordersMap: { [key: string]: any } = {};
    ordersSnapshot.forEach((orderDoc) => {
      ordersMap[orderDoc.id] = orderDoc.data();
    });

    // Also fetch customers to get customer names
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
  };

  const applyFiltersAndSort = () => {
    let filtered = [...suppliers];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter((supplier) =>
        matchesSearch(supplier, searchTerm)
      );
    }

    // Apply sorting
    const contactOf = (s: Supplier) =>
      [s.phone, s.email, s.address].filter(Boolean).join(" ");

    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortBy.field === "contact") {
        // "معلومات الاتصال" is a composed column — sort on the same text
        aValue = contactOf(a);
        bValue = contactOf(b);
      } else {
        aValue = a[sortBy.field as keyof Supplier];
        bValue = b[sortBy.field as keyof Supplier];
      }

      if (sortBy.field === "lastOrderDate") {
        aValue = aValue ? new Date(aValue).getTime() : 0;
        bValue = bValue ? new Date(bValue).getTime() : 0;
      } else if (
        sortBy.field === "totalElements" ||
        sortBy.field === "totalValue"
      ) {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      } else {
        aValue = (aValue ?? "").toString();
        bValue = (bValue ?? "").toString();
      }

      if (sortBy.order === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredSuppliers(filtered);

    // Calculate pagination
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    setTotalPages(totalPages);

    // Reset to first page if current page is beyond total pages
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }

    // Get paginated data
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginated = filtered.slice(startIndex, endIndex);
    setPaginatedSuppliers(paginated);
  };

  const handleAddSupplier = async () => {
    try {
      const newSupplier = {
        ...supplierForm,
        totalElements: 0,
        totalValue: 0,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "suppliers"), newSupplier);
      // The live subscription picks up the change automatically.

      // Stay open for the next entry: reset the form, confirm inline,
      // and put the cursor back in the first field.
      setSupplierForm({
        name: "",
        phone: "",
        email: "",
        address: "",
        notes: "",
      });
      setAddSuccess(true);
      focusFirstField();
      setTimeout(() => setAddSuccess(false), 2500);
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

      // The live subscription picks up the change automatically.

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

  const handleDeleteSupplier = (supplier: Supplier) => {
    setSupplierToDelete(supplier);
    setDeleteConfirmText("");
    setShowDeleteModal(true);
  };

  // Cascade delete: removes the supplier AND all their payments, and
  // UNLINKS the supplier from order elements (customers' order data —
  // items, totals, balances — must stay intact). The supplier doc goes
  // in the LAST batch so a mid-failure stays safely retryable.
  const confirmDeleteSupplier = async () => {
    if (!supplierToDelete || deleting) return;

    setDeleting(true);
    try {
      const supplierId = supplierToDelete.id;

      const [paymentsSnap, itemsSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "supplierPayments"),
            where("supplierId", "==", supplierId)
          )
        ),
        getDocs(
          query(
            collection(db, "orderItems"),
            where("supplierId", "==", supplierId)
          )
        ),
      ]);

      const ops = [
        ...itemsSnap.docs.map((d) => ({ ref: d.ref, del: false })),
        ...paymentsSnap.docs.map((d) => ({ ref: d.ref, del: true })),
        { ref: doc(db, "suppliers", supplierId), del: true },
      ];

      // Firestore batches cap at 500 operations — commit in chunks
      for (let i = 0; i < ops.length; i += 450) {
        const batch = writeBatch(db);
        ops.slice(i, i + 450).forEach((op) => {
          if (op.del) {
            batch.delete(op.ref);
          } else {
            batch.update(op.ref, { supplierId: "", supplierName: "" });
          }
        });
        await batch.commit();
      }

      setShowDeleteModal(false);
      setSupplierToDelete(null);
      setDeleteConfirmText("");
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error deleting supplier:", error);
      alert("حدث خطأ أثناء حذف المورد وبياناته — لم يتم حذف المورد، حاول مجدداً");
    } finally {
      setDeleting(false);
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
    return new Date(dateString).toLocaleDateString("en-GB");
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
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2b241c; padding-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #d8cdbb; padding: 8px; text-align: right; }
              th { background-color: #f0eae0; font-weight: bold; }
              .summary { margin-top: 20px; padding: 15px; background-color: #faf6ee; border-radius: 8px; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>قائمة الموردين</h1>
              <p>تم طباعة هذا التقرير في: ${new Date().toLocaleDateString("en-GB")}</p>
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
            className="suppliers-payments-btn"
            onClick={() => navigate("/supplier-payments")}
            title="إدارة دفعات الموردين"
          >
            <DollarSign className="suppliers-btn-icon" />
            دفعات الموردين
          </button>
          <button
            className="suppliers-print-btn"
            onClick={printSuppliers}
            title="طباعة قائمة الموردين"
          >
            <Printer className="suppliers-btn-icon" />
            طباعة
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

      {/* Search */}
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
      </div>

      {/* Suppliers Table */}
      <div className="suppliers-table-container">
        <table className="suppliers-table">
          <thead>
            <tr>
              <th
                onClick={() => handleSort("name")}
                className="sortable th-sortable"
              >
                <div className="suppliers-th-content">
                  <User className="suppliers-th-icon" />
                  اسم المورد
                  {getSortIcon("name")}
                </div>
              </th>
              <th
                onClick={() => handleSort("contact")}
                className="sortable th-sortable"
              >
                <div className="suppliers-th-content">
                  <Phone className="suppliers-th-icon" />
                  معلومات الاتصال
                  {getSortIcon("contact")}
                </div>
              </th>
              <th
                onClick={() => handleSort("totalElements")}
                className="sortable th-sortable"
              >
                <div className="suppliers-th-content">
                  <Package className="suppliers-th-icon" />
                  العناصر
                  {getSortIcon("totalElements")}
                </div>
              </th>
              <th
                onClick={() => handleSort("totalValue")}
                className="sortable th-sortable"
              >
                <div className="suppliers-th-content">
                  <DollarSign className="suppliers-th-icon" />
                  إجمالي القيمة
                  {getSortIcon("totalValue")}
                </div>
              </th>
              <th
                onClick={() => handleSort("lastOrderDate")}
                className="sortable th-sortable"
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
            {paginatedSuppliers.length === 0 ? (
              <tr>
                <td colSpan={6} className="suppliers-no-data">
                  لا توجد موردين
                </td>
              </tr>
            ) : (
              paginatedSuppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  className="suppliers-supplier-row row-clickable"
                  onClick={(e) => {
                    if (
                      (e.target as HTMLElement).closest(
                        "button, a, input, select"
                      )
                    )
                      return;
                    handleViewSupplier(supplier);
                  }}
                >
                  <td>
                    <div className="suppliers-supplier-info">
                      <div className="suppliers-supplier-avatar">
                        <User className="suppliers-avatar-icon" />
                      </div>
                      <div className="suppliers-supplier-details">
                        <span
                          className="suppliers-supplier-name clickable"
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

      {/* Pagination Controls */}
      {filteredSuppliers.length > 0 && (
        <div className="pagination-container">
          <div className="pagination-info">
            <span>
              عرض {(currentPage - 1) * itemsPerPage + 1} إلى{" "}
              {Math.min(currentPage * itemsPerPage, filteredSuppliers.length)} من{" "}
              {filteredSuppliers.length} مورد
            </span>
            <div className="items-per-page">
              <label>عدد العناصر في الصفحة:</label>
              <select
                value={itemsPerPage}
                onChange={(e) =>
                  handleItemsPerPageChange(Number(e.target.value))
                }
                className="pagination-select"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="pagination-controls">
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
            >
              الأولى
            </button>
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              السابقة
            </button>

            {getPageNumbers().map((page) => (
              <button
                key={page}
                className={`pagination-btn ${
                  currentPage === page ? "active" : ""
                }`}
                onClick={() => handlePageChange(page)}
              >
                {page}
              </button>
            ))}

            <button
              className="pagination-btn"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              التالية
            </button>
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
            >
              الأخيرة
            </button>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="suppliers-modal-overlay">
          <div className="suppliers-modal" ref={addModalRef}>
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
              {addSuccess && (
                <div className="modal-success-banner">
                  <CheckCircle />
                  تمت الإضافة بنجاح
                </div>
              )}
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

      {/* Delete Confirmation Modal — typed "موافق" required */}
      {showDeleteModal && supplierToDelete && (
        <div className="modal-overlay">
          <div className="modal delete-modal">
            <div className="modal-header">
              <h3>تأكيد الحذف</h3>
              <button className="close-btn" onClick={closeDeleteModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                هل أنت متأكد من حذف المورد{" "}
                <strong>{supplierToDelete.name}</strong>؟
              </p>
              <p className="warning-text">
                سيتم حذف جميع دفعات المورد نهائياً، وسيتم إلغاء ربط المورد من
                عناصر الطلبات المرتبطة به — لا يمكن التراجع عن هذا الإجراء!
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
                onClick={closeDeleteModal}
                disabled={deleting}
              >
                إلغاء
              </button>
              <button
                className="btn-danger"
                onClick={confirmDeleteSupplier}
                disabled={deleting || deleteConfirmText.trim() !== "موافق"}
              >
                {deleting ? "جاري الحذف..." : "حذف المورد وجميع بياناته"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
