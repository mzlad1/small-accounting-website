import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Package,
  User,
  Calendar,
  DollarSign,
  Printer,
  Search,
  Filter,
  SortAsc,
  SortDesc,
  Users,
} from "lucide-react";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "./SupplierDetails.css";

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
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

export function SupplierDetails() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [elements, setElements] = useState<SupplierElement[]>([]);
  const [filteredElements, setFilteredElements] = useState<SupplierElement[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    type: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [sortBy, setSortBy] = useState({
    field: "orderDate",
    order: "desc" as "asc" | "desc",
  });

  useEffect(() => {
    if (supplierId) {
      fetchSupplierData();
    }
  }, [supplierId]);

  useEffect(() => {
    applyFiltersAndSort();
  }, [elements, searchTerm, filters, sortBy]);

  const fetchSupplierData = async () => {
    try {
      setLoading(true);

      // Fetch supplier details
      const supplierDoc = await getDoc(doc(db, "suppliers", supplierId!));
      if (supplierDoc.exists()) {
        const supplierData = {
          id: supplierDoc.id,
          ...supplierDoc.data(),
        } as Supplier;
        setSupplier(supplierData);
      } else {
        alert("المورد غير موجود");
        navigate("/suppliers");
        return;
      }

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
        if (itemData.supplierId === supplierId) {
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

      setElements(elementsData);
    } catch (error) {
      console.error("Error fetching supplier data:", error);
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...elements];

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(
        (element) =>
          element.elementName
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          element.elementType
            .toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          element.orderTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
          element.customerName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply type filter
    if (filters.type !== "all") {
      filtered = filtered.filter(
        (element) => element.elementType === filters.type
      );
    }

    // Apply date filters
    if (filters.dateFrom) {
      filtered = filtered.filter(
        (element) => new Date(element.orderDate) >= new Date(filters.dateFrom)
      );
    }
    if (filters.dateTo) {
      filtered = filtered.filter(
        (element) => new Date(element.orderDate) <= new Date(filters.dateTo)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any = a[sortBy.field as keyof SupplierElement];
      let bValue: any = b[sortBy.field as keyof SupplierElement];

      if (sortBy.field === "orderDate") {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      if (sortBy.order === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredElements(filtered);
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

  const printSupplierElements = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>تفاصيل المورد - ${supplier?.name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
              .supplier-info { background-color: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .summary { margin-top: 20px; padding: 15px; background-color: #f9fafb; border-radius: 8px; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>تفاصيل المورد: ${supplier?.name}</h1>
              <p>تم طباعة هذا التقرير في: ${new Date().toLocaleDateString(
                "en-US"
              )}</p>
            </div>
            <div class="supplier-info">
              <h3>معلومات المورد</h3>
              <p><strong>الاسم:</strong> ${supplier?.name}</p>
              ${
                supplier?.phone
                  ? `<p><strong>الهاتف:</strong> ${supplier.phone}</p>`
                  : ""
              }
              ${
                supplier?.email
                  ? `<p><strong>البريد الإلكتروني:</strong> ${supplier.email}</p>`
                  : ""
              }
              ${
                supplier?.address
                  ? `<p><strong>العنوان:</strong> ${supplier.address}</p>`
                  : ""
              }
              ${
                supplier?.notes
                  ? `<p><strong>ملاحظات:</strong> ${supplier.notes}</p>`
                  : ""
              }
            </div>
            <table>
              <thead>
                                 <tr>
                   <th>التاريخ</th>
                   <th>الطلب</th>
                   <th>العميل</th>
                   <th>اسم العنصر</th>
                   <th>النوع</th>
                   <th>الكمية</th>
                   <th>الوحدة</th>
                   <th>سعر الوحدة</th>
                   <th>الإجمالي</th>
                   <th>ملاحظات</th>
                 </tr>
              </thead>
              <tbody>
                ${filteredElements
                  .map(
                    (element) => `
                                     <tr>
                     <td>${formatDate(element.orderDate)}</td>
                     <td>${element.orderTitle}</td>
                     <td>${element.customerName}</td>
                     <td>${element.elementName}</td>
                     <td>${element.elementType}</td>
                     <td>${element.quantity}</td>
                     <td>${element.unit}</td>
                     <td>${formatCurrency(element.unitPrice)}</td>
                     <td>${formatCurrency(element.totalPrice)}</td>
                     <td>${element.notes || "-"}</td>
                   </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="summary">
              <h3>ملخص</h3>
              <p><strong>إجمالي العناصر:</strong> ${filteredElements.length}</p>
              <p><strong>إجمالي القيمة:</strong> ${formatCurrency(
                filteredElements.reduce((sum, e) => sum + e.totalPrice, 0)
              )}</p>
              <p><strong>متوسط سعر العنصر:</strong> ${formatCurrency(
                filteredElements.length > 0
                  ? filteredElements.reduce((sum, e) => sum + e.totalPrice, 0) /
                      filteredElements.length
                  : 0
              )}</p>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error("Error printing supplier elements:", error);
      alert("حدث خطأ أثناء الطباعة");
    }
  };

  if (loading) {
    return (
      <div className="supplier-details-container">
        <div className="supplier-details-loading-spinner">
          <div className="supplier-details-spinner"></div>
          <p>جاري تحميل تفاصيل المورد...</p>
        </div>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="supplier-details-container">
        <div className="supplier-details-error-message">
          <h2>المورد غير موجود</h2>
          <button
            onClick={() => navigate("/suppliers")}
            className="supplier-details-btn-primary"
          >
            العودة إلى الموردين
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="supplier-details-container">
      {/* Header */}
      <div className="supplier-details-header">
        <div className="supplier-details-header-content">
          <button
            className="supplier-details-back-btn"
            onClick={() => navigate("/suppliers")}
            title="العودة إلى الموردين"
          >
            <ArrowLeft className="btn-icon" />
          </button>
          <div className="supplier-details-header-info">
            <h1>{supplier.name}</h1>
            <p>تفاصيل جميع العناصر الموردة</p>
          </div>
        </div>
        <div className="supplier-details-header-actions">
          <button
            className="supplier-details-print-btn"
            onClick={printSupplierElements}
            title="طباعة تفاصيل المورد"
          >
            <Printer className="btn-icon" />
            طباعة
          </button>
        </div>
      </div>

      {/* Supplier Info Card */}
      <div className="supplier-details-info-card">
        <div className="supplier-details-avatar">
          <User className="supplier-details-avatar-icon" />
        </div>
        <div className="supplier-details-info">
          <h3>{supplier.name}</h3>
          <div className="supplier-details-contact-details">
            {supplier.phone && (
              <div className="supplier-details-contact-item">
                <span className="supplier-details-contact-label">هاتف:</span>
                <span className="supplier-details-contact-value">
                  {supplier.phone}
                </span>
              </div>
            )}
            {supplier.email && (
              <div className="supplier-details-contact-item">
                <span className="supplier-details-contact-label">بريد:</span>
                <span className="supplier-details-contact-value">
                  {supplier.email}
                </span>
              </div>
            )}
            {supplier.address && (
              <div className="supplier-details-contact-item">
                <span className="supplier-details-contact-label">عنوان:</span>
                <span className="supplier-details-contact-value">
                  {supplier.address}
                </span>
              </div>
            )}
            {supplier.notes && (
              <div className="supplier-details-contact-item">
                <span className="supplier-details-contact-label">ملاحظات:</span>
                <span className="supplier-details-contact-value">
                  {supplier.notes}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="supplier-details-summary-section">
        <div className="supplier-details-summary-cards">
          <div className="supplier-details-summary-card">
            <div className="supplier-details-summary-icon">
              <Package />
            </div>
            <div className="supplier-details-summary-content">
              <h3>إجمالي العناصر</h3>
              <p className="supplier-details-summary-number">
                {filteredElements.length}
              </p>
            </div>
          </div>
          <div className="supplier-details-summary-card">
            <div className="supplier-details-summary-icon">
              <DollarSign />
            </div>
            <div className="supplier-details-summary-content">
              <h3>إجمالي القيمة</h3>
              <p className="supplier-details-summary-number">
                {formatCurrency(
                  filteredElements.reduce((sum, e) => sum + e.totalPrice, 0)
                )}
              </p>
            </div>
          </div>
          <div className="supplier-details-summary-card">
            <div className="supplier-details-summary-icon">
              <Calendar />
            </div>
            <div className="supplier-details-summary-content">
              <h3>متوسط سعر العنصر</h3>
              <p className="supplier-details-summary-number">
                {formatCurrency(
                  filteredElements.length > 0
                    ? filteredElements.reduce(
                        (sum, e) => sum + e.totalPrice,
                        0
                      ) / filteredElements.length
                    : 0
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="supplier-details-search-filters-section">
        <div className="supplier-details-search-box">
          <Search className="supplier-details-search-icon" />
          <input
            type="text"
            placeholder="البحث بالعنصر أو النوع أو الطلب أو العميل..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="supplier-details-search-input"
          />
        </div>

        <div className="supplier-details-filters-row">
          <div className="supplier-details-filter-group">
            <label>النوع:</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              className="supplier-details-filter-select"
            >
              <option value="all">جميع الأنواع</option>
              {Array.from(new Set(elements.map((e) => e.elementType))).map(
                (type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="supplier-details-filter-group">
            <label>من تاريخ:</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                setFilters({ ...filters, dateFrom: e.target.value })
              }
              className="supplier-details-filter-input"
            />
          </div>

          <div className="supplier-details-filter-group">
            <label>إلى تاريخ:</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                setFilters({ ...filters, dateTo: e.target.value })
              }
              className="supplier-details-filter-input"
            />
          </div>
        </div>
      </div>

      {/* Elements Table */}
      <div className="supplier-details-table-container">
        <table className="supplier-details-elements-table">
          <thead>
            <tr>
              <th onClick={() => handleSort("orderDate")} className="sortable">
                <div className="supplier-details-th-content">
                  <Calendar className="supplier-details-th-icon" />
                  التاريخ
                  {getSortIcon("orderDate")}
                </div>
              </th>
              <th onClick={() => handleSort("orderTitle")} className="sortable">
                <div className="supplier-details-th-content">
                  <Package className="supplier-details-th-icon" />
                  الطلب
                  {getSortIcon("orderTitle")}
                </div>
              </th>
              <th
                onClick={() => handleSort("customerName")}
                className="sortable"
              >
                <div className="supplier-details-th-content">
                  <Users className="supplier-details-th-icon" />
                  العميل
                  {getSortIcon("customerName")}
                </div>
              </th>
              <th
                onClick={() => handleSort("elementName")}
                className="sortable"
              >
                <div className="supplier-details-th-content">
                  <Package className="supplier-details-th-icon" />
                  اسم العنصر
                  {getSortIcon("elementName")}
                </div>
              </th>
              <th
                onClick={() => handleSort("elementType")}
                className="sortable"
              >
                <div className="supplier-details-th-content">
                  <Package className="supplier-details-th-icon" />
                  النوع
                  {getSortIcon("elementType")}
                </div>
              </th>
              <th onClick={() => handleSort("quantity")} className="sortable">
                <div className="supplier-details-th-content">
                  <Package className="supplier-details-th-icon" />
                  الكمية
                  {getSortIcon("quantity")}
                </div>
              </th>
              <th>الوحدة</th>
              <th onClick={() => handleSort("unitPrice")} className="sortable">
                <div className="supplier-details-th-content">
                  <DollarSign className="supplier-details-th-icon" />
                  سعر الوحدة
                  {getSortIcon("unitPrice")}
                </div>
              </th>
              <th onClick={() => handleSort("totalPrice")} className="sortable">
                <div className="supplier-details-th-content">
                  <DollarSign className="supplier-details-th-icon" />
                  الإجمالي
                  {getSortIcon("totalPrice")}
                </div>
              </th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {filteredElements.length === 0 ? (
              <tr>
                <td colSpan={10} className="supplier-details-no-data">
                  لا توجد عناصر
                </td>
              </tr>
            ) : (
              filteredElements.map((element) => (
                <tr key={element.id} className="supplier-details-element-row">
                  <td>{formatDate(element.orderDate)}</td>
                  <td>
                    <div className="supplier-details-order-info">
                      <span className="supplier-details-order-title">
                        {element.orderTitle}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="supplier-details-customer-info">
                      <span className="supplier-details-customer-name">
                        {element.customerName}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="supplier-details-element-info">
                      <span className="supplier-details-element-name">
                        {element.elementName}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="supplier-details-type-badge">
                      {element.elementType}
                    </div>
                  </td>
                  <td>
                    <div className="supplier-details-quantity-info">
                      <span className="supplier-details-quantity-number">
                        {element.quantity}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="supplier-details-unit-info">
                      <span className="supplier-details-unit-text">
                        {element.unit}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="supplier-details-unit-price">
                      {formatCurrency(element.unitPrice)}
                    </div>
                  </td>
                  <td>
                    <div className="supplier-details-total-price">
                      {formatCurrency(element.totalPrice)}
                    </div>
                  </td>
                  <td>
                    <div className="supplier-details-element-notes">
                      {element.notes || "-"}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
