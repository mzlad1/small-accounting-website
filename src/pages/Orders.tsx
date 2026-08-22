import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
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
  DocumentData,
  QuerySnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../config/firebase";
import { fetchCacheFirst } from "../utils/cacheFirst";
import { subscribeAll } from "../utils/live";
import { matchesSearch } from "../utils/search";

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
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>(
    []
  );
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderForm, setOrderForm] = useState({
    customerId: "",
    title: "",
    date: new Date().toISOString().split("T")[0],
    status: "pending" as Order["status"],
    total: 0, // This will be calculated from order items later
    notes: "",
  });
  const [existingTitles, setExistingTitles] = useState<string[]>([]);
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const [filteredTitles, setFilteredTitles] = useState<string[]>([]);
  const [showAddElementModal, setShowAddElementModal] = useState(false);
  const [selectedOrderForElement, setSelectedOrderForElement] =
    useState<Order | null>(null);
  const [elementForm, setElementForm] = useState({
    name: "",
    type: "",
    quantity: 1,
    unit: "",
    unitPrice: 0,
    notes: "",
    supplierId: "",
    supplierName: "",
    images: [] as string[],
  });
  const [uploadingImages, setUploadingImages] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [existingElementNames, setExistingElementNames] = useState<string[]>(
    []
  );
  const [showElementNameSuggestions, setShowElementNameSuggestions] =
    useState(false);
  const [filteredElementNames, setFilteredElementNames] = useState<string[]>(
    []
  );
  const [selectedTitleIndex, setSelectedTitleIndex] = useState(-1);
  const [selectedElementNameIndex, setSelectedElementNameIndex] = useState(-1);

  // Add-modal: focus the first field on open, and keep the dialog open
  // after a successful add so several orders can be entered in a row.
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

  const addElementModalRef = useRef<HTMLDivElement | null>(null);
  const [elementAddSuccess, setElementAddSuccess] = useState(false);

  const focusFirstElementField = () => {
    setTimeout(() => {
      addElementModalRef.current
        ?.querySelector<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), select, textarea"
        )
        ?.focus();
    }, 60);
  };

  useEffect(() => {
    if (showAddElementModal) {
      setElementAddSuccess(false);
      focusFirstElementField();
    }
  }, [showAddElementModal]);

  useEffect(() => {
    setLoading(true);
    // Live subscription: instant paint from the persistent cache, then
    // the server, then every later change (own writes appear at once).
    const unsubscribe = subscribeAll(
      [
        collection(db, "customers"),
        collection(db, "suppliers"),
        query(collection(db, "orders"), orderBy("createdAt", "desc")),
        collection(db, "orderItems"),
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
  }, [orders, searchTerm, filters, sortBy]);

  const applySnapshots = (snapshots: Array<QuerySnapshot<DocumentData>>) => {
    const [
      customersSnapshot,
      suppliersSnapshot,
      ordersSnapshot,
      orderItemsSnapshot,
    ] = snapshots;

    // Fetch customers first
    const customersData: Customer[] = [];
    customersSnapshot.forEach((doc) => {
      customersData.push({ id: doc.id, ...doc.data() } as Customer);
    });
    setCustomers(customersData);

    // Fetch suppliers
    const suppliersData: { id: string; name: string }[] = [];
    suppliersSnapshot.forEach((doc) => {
      const data = doc.data();
      suppliersData.push({ id: doc.id, name: data.name });
    });
    setSuppliers(suppliersData);

    // Fetch orders with customer names
    const ordersData: Order[] = [];

    // Fetch all order items to calculate totals
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

    // Extract unique order titles for autocomplete
    const uniqueTitles = [
      ...new Set(ordersData.map((order) => order.title)),
    ].filter((title) => title.trim() !== "");
    console.log("📝 Extracted order titles:", uniqueTitles);
    setExistingTitles(uniqueTitles);

    // Extract unique element names from all order items
    const uniqueElementNames = [
      ...new Set(orderItemsData.map((item) => item.name)),
    ].filter((name) => name.trim() !== "");
    console.log("📦 Extracted element names:", uniqueElementNames);
    setExistingElementNames(uniqueElementNames);
  };

  const applyFiltersAndSort = () => {
    let filtered = [...orders];

    // Apply search (matches any field of the order)
    if (searchTerm) {
      filtered = filtered.filter((order) => matchesSearch(order, searchTerm));
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

      const docRef = await addDoc(collection(db, "orders"), newOrder);
      const newOrderWithId = {
        id: docRef.id,
        ...newOrder,
        numberOfItems: 0,
        total: 0,
      };

      // Stay open for the next entry: reset the form, confirm inline,
      // and put the cursor back in the first field.
      setOrderForm({
        customerId: "",
        title: "",
        date: new Date().toISOString().split("T")[0],
        status: "pending",
        total: 0, // This will be calculated from order items later
        notes: "",
      });
      setShowTitleSuggestions(false);
      setSelectedTitleIndex(-1);
      setAddSuccess(true);
      focusFirstField();
      setTimeout(() => setAddSuccess(false), 2500);
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error adding order:", error);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (window.confirm("هل أنت متأكد من حذف هذا الطلب؟")) {
      try {
        await deleteDoc(doc(db, "orders", orderId));
      } catch (error) {
        console.error("Error deleting order:", error);
      }
    }
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrder(order);
    setOrderForm({
      customerId: order.customerId,
      title: order.title,
      date: order.date,
      status: order.status,
      total: order.total,
      notes: order.notes || "",
    });
    setShowEditModal(true);
  };

  const handleUpdateOrder = async () => {
    if (!editingOrder) return;

    try {
      // Get customer name for the selected customer
      const selectedCustomer = customers.find(
        (c) => c.id === orderForm.customerId
      );

      if (!selectedCustomer) {
        alert("يرجى اختيار عميل صحيح");
        return;
      }

      const orderData = {
        customerId: orderForm.customerId,
        customerName: selectedCustomer.name,
        title: orderForm.title,
        date: orderForm.date,
        status: orderForm.status,
        total: orderForm.total,
        notes: orderForm.notes,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, "orders", editingOrder.id), orderData);

      // Update cache
      const updatedOrder = {
        ...editingOrder,
        ...orderData,
      };

      setShowEditModal(false);
      setEditingOrder(null);
      setOrderForm({
        customerId: "",
        title: "",
        date: new Date().toISOString().split("T")[0],
        status: "pending",
        total: 0,
        notes: "",
      });
    } catch (error) {
      console.error("Error updating order:", error);
    }
  };

  const handleSort = (field: string) => {
    setSortBy((prev) => ({
      field,
      order: prev.field === field && prev.order === "desc" ? "asc" : "desc",
    }));
  };

  const handleTitleInputChange = (value: string) => {
    setOrderForm({ ...orderForm, title: value });
    setSelectedTitleIndex(-1); // Reset selection when typing

    if (value.length > 0) {
      const filtered = existingTitles.filter((title) =>
        title.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredTitles(filtered);
      setShowTitleSuggestions(filtered.length > 0);
    } else {
      setShowTitleSuggestions(false);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (!showTitleSuggestions || filteredTitles.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedTitleIndex((prev) => {
          const newIndex = prev < filteredTitles.length - 1 ? prev + 1 : 0;
          // Scroll to selected item
          setTimeout(() => {
            const selectedElement = document.querySelector(
              `.suggestions-dropdown .suggestion-item:nth-child(${
                newIndex + 1
              })`
            );
            if (selectedElement) {
              selectedElement.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
              });
            }
          }, 0);
          return newIndex;
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedTitleIndex((prev) => {
          const newIndex = prev > 0 ? prev - 1 : filteredTitles.length - 1;
          // Scroll to selected item
          setTimeout(() => {
            const selectedElement = document.querySelector(
              `.suggestions-dropdown .suggestion-item:nth-child(${
                newIndex + 1
              })`
            );
            if (selectedElement) {
              selectedElement.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
              });
            }
          }, 0);
          return newIndex;
        });
        break;
      case "Enter":
        e.preventDefault();
        if (
          selectedTitleIndex >= 0 &&
          selectedTitleIndex < filteredTitles.length
        ) {
          selectTitle(filteredTitles[selectedTitleIndex]);
        }
        break;
      case "Escape":
        setShowTitleSuggestions(false);
        setSelectedTitleIndex(-1);
        break;
    }
  };

  const selectTitle = (title: string) => {
    setOrderForm({ ...orderForm, title });
    setShowTitleSuggestions(false);
    setSelectedTitleIndex(-1);
  };

  const handleElementNameInputChange = (value: string) => {
    setElementForm({ ...elementForm, name: value });
    setSelectedElementNameIndex(-1); // Reset selection when typing

    if (value.length > 0) {
      const filtered = existingElementNames.filter((name) =>
        name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredElementNames(filtered);
      setShowElementNameSuggestions(filtered.length > 0);
    } else {
      setShowElementNameSuggestions(false);
    }
  };

  const handleElementNameKeyDown = (e: React.KeyboardEvent) => {
    if (!showElementNameSuggestions || filteredElementNames.length === 0)
      return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedElementNameIndex((prev) => {
          const newIndex =
            prev < filteredElementNames.length - 1 ? prev + 1 : 0;
          // Scroll to selected item
          setTimeout(() => {
            const selectedElement = document.querySelector(
              `.suggestions-dropdown .suggestion-item:nth-child(${
                newIndex + 1
              })`
            );
            if (selectedElement) {
              selectedElement.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
              });
            }
          }, 0);
          return newIndex;
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedElementNameIndex((prev) => {
          const newIndex =
            prev > 0 ? prev - 1 : filteredElementNames.length - 1;
          // Scroll to selected item
          setTimeout(() => {
            const selectedElement = document.querySelector(
              `.suggestions-dropdown .suggestion-item:nth-child(${
                newIndex + 1
              })`
            );
            if (selectedElement) {
              selectedElement.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
              });
            }
          }, 0);
          return newIndex;
        });
        break;
      case "Enter":
        e.preventDefault();
        if (
          selectedElementNameIndex >= 0 &&
          selectedElementNameIndex < filteredElementNames.length
        ) {
          selectElementName(filteredElementNames[selectedElementNameIndex]);
        }
        break;
      case "Escape":
        setShowElementNameSuggestions(false);
        setSelectedElementNameIndex(-1);
        break;
    }
  };

  const selectElementName = (name: string) => {
    setElementForm({ ...elementForm, name });
    setShowElementNameSuggestions(false);
    setSelectedElementNameIndex(-1);
  };

  const handleAddElement = (order: Order) => {
    setSelectedOrderForElement(order);
    setElementForm({
      name: "",
      type: "",
      quantity: 1,
      unit: "",
      unitPrice: 0,
      notes: "",
      supplierId: "",
      supplierName: "",
      images: [],
    });
    setSelectedFiles([]);
    setShowAddElementModal(true);
  };

  const handleSaveElement = async () => {
    if (!selectedOrderForElement) return;

    try {
      setUploadingImages(true);

      // Upload images if any
      let imageUrls: string[] = [];
      if (selectedFiles.length > 0) {
        const uploadPromises = selectedFiles.map(async (file) => {
          const fileName = `order-items/${
            selectedOrderForElement.id
          }/${Date.now()}_${file.name}`;
          const storageRef = ref(storage, fileName);
          await uploadBytes(storageRef, file);
          return await getDownloadURL(storageRef);
        });
        imageUrls = await Promise.all(uploadPromises);
      }

      const total = elementForm.quantity * elementForm.unitPrice;
      const newElement = {
        ...elementForm,
        orderId: selectedOrderForElement.id,
        total,
        images: imageUrls,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "orderItems"), newElement);

      // Success banner + reset, dialog stays open for the next element
      setElementForm({
        name: "",
        type: "",
        quantity: 1,
        unit: "",
        unitPrice: 0,
        notes: "",
        supplierId: "",
        supplierName: "",
        images: [],
      });
      setSelectedFiles([]);
      setShowElementNameSuggestions(false);
      setElementAddSuccess(true);
      focusFirstElementField();
      setTimeout(() => setElementAddSuccess(false), 2500);
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error adding element:", error);
      alert("حدث خطأ أثناء إضافة العنصر");
    } finally {
      setUploadingImages(false);
    }
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

  const printOrders = () => {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        const filteredOrders = orders.filter((order) => {
          const matchesSearchTerm = matchesSearch(order, searchTerm);

          const matchesStatus =
            filters.status === "all" || order.status === filters.status;
          const matchesCustomer =
            filters.customer === "all" || order.customerId === filters.customer;

          return matchesSearchTerm && matchesStatus && matchesCustomer;
        });

        printWindow.document.write(`
          <!DOCTYPE html>
          <html dir="rtl" lang="ar">
          <head>
            <meta charset="UTF-8">
            <title>قائمة الطلبات</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; direction: rtl; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2b241c; padding-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #d8cdbb; padding: 8px; text-align: right; }
              th { background-color: #f0eae0; font-weight: bold; }
              .status { display: inline-block; padding: 4px 8px; border-radius: 4px; color: white; font-size: 12px; }
              .status.pending { background-color: #a9741f; }
              .status.in-progress { background-color: #bc5727; }
              .status.completed { background-color: #4a7c59; }
              .status.cancelled { background-color: #b23b2e; }
              .summary { margin-top: 20px; padding: 15px; background-color: #faf6ee; border-radius: 8px; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>قائمة الطلبات</h1>
              <p>تم طباعة هذا التقرير في: ${new Date().toLocaleDateString("en-GB")}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>عنوان الطلب</th>
                  <th>العميل</th>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                  <th>إجمالي الطلب</th>
                  <th>ملاحظات</th>
                </tr>
              </thead>
              <tbody>
                ${filteredOrders
                  .map(
                    (order) => `
                  <tr>
                    <td>${order.title}</td>
                    <td>${order.customerName}</td>
                    <td>${formatDate(order.date)}</td>
                    <td><span class="status ${getStatusClass(
                      order.status
                    )}">${getStatusText(order.status)}</span></td>
                    <td>${formatCurrency(order.total)}</td>
                    <td>${order.notes || "-"}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
            <div class="summary">
              <h3>ملخص</h3>
              <p><strong>إجمالي الطلبات:</strong> ${filteredOrders.length}</p>
              <p><strong>إجمالي المبالغ:</strong> ${formatCurrency(
                filteredOrders.reduce((sum, o) => sum + o.total, 0)
              )}</p>
              <p><strong>طلبات معلقة:</strong> ${
                filteredOrders.filter((o) => o.status === "pending").length
              }</p>
              <p><strong>طلبات قيد التنفيذ:</strong> ${
                filteredOrders.filter((o) => o.status === "in-progress").length
              }</p>
              <p><strong>طلبات مكتملة:</strong> ${
                filteredOrders.filter((o) => o.status === "completed").length
              }</p>
              <p><strong>طلبات ملغية:</strong> ${
                filteredOrders.filter((o) => o.status === "cancelled").length
              }</p>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (error) {
      console.error("Error printing orders:", error);
      alert("حدث خطأ أثناء الطباعة");
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
    return new Date(dateString).toLocaleDateString("en-GB");
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
        <div className="header-actions">
          <button
            className="print-btn"
            onClick={printOrders}
            title="طباعة قائمة الطلبات"
          >
            <Printer className="btn-icon" />
            طباعة
          </button>
          <button
            className="add-order-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="btn-icon" />
            إضافة طلب جديد
          </button>
        </div>
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
      <div className="filters-bar">
        <div className="filter-field filter-field-search">
          <label>بحث</label>
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="بحث..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="filter-field">
          <label>الحالة</label>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="all">جميع الحالات</option>
            <option value="pending">في الانتظار</option>
            <option value="in-progress">قيد التنفيذ</option>
            <option value="completed">مكتمل</option>
            <option value="cancelled">ملغي</option>
          </select>
        </div>

        <div className="filter-field">
          <label>العميل</label>
          <select
            value={filters.customer}
            onChange={(e) =>
              setFilters({ ...filters, customer: e.target.value })
            }
          >
            <option value="all">جميع العملاء</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label>من تاريخ</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) =>
              setFilters({ ...filters, dateFrom: e.target.value })
            }
          />
        </div>

        <div className="filter-field">
          <label>إلى تاريخ</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
          />
        </div>

        <button
          type="button"
          className="filters-clear-btn"
          onClick={() => {
            setSearchTerm("");
            setFilters({
              status: "all",
              customer: "all",
              dateFrom: "",
              dateTo: "",
            });
          }}
        >
          مسح الفلاتر
        </button>
      </div>

      {/* Orders Table */}
      <div className="orders-table-container">
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
                        className="action-btn add-element"
                        title="إضافة عنصر"
                        onClick={() => handleAddElement(order)}
                      >
                        <Plus />
                      </button>
                      <button
                        className="action-btn view"
                        title="عرض التفاصيل"
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <Eye />
                      </button>
                      <button
                        className="action-btn edit"
                        title="تعديل الطلب"
                        onClick={() => handleEditOrder(order)}
                      >
                        <Edit />
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
          <div className="modal" ref={addModalRef}>
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
              {addSuccess && (
                <div className="modal-success-banner">
                  <CheckCircle />
                  تمت الإضافة بنجاح
                </div>
              )}
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
                <div className="autocomplete-container">
                  <input
                    type="text"
                    value={orderForm.title}
                    onChange={(e) => handleTitleInputChange(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    onFocus={() => {
                      if (orderForm.title.length > 0) {
                        const filtered = existingTitles.filter((title) =>
                          title
                            .toLowerCase()
                            .includes(orderForm.title.toLowerCase())
                        );
                        setFilteredTitles(filtered);
                        setShowTitleSuggestions(filtered.length > 0);
                      }
                    }}
                    onBlur={() => {
                      // Delay hiding to allow clicking on suggestions
                      setTimeout(() => setShowTitleSuggestions(false), 200);
                    }}
                    placeholder="أدخل عنوان الطلب أو اختر من القائمة"
                    className="form-input"
                    autoComplete="off"
                  />
                  {showTitleSuggestions && filteredTitles.length > 0 && (
                    <div className="suggestions-dropdown">
                      {filteredTitles.map((title, index) => (
                        <div
                          key={index}
                          className={`suggestion-item ${
                            index === selectedTitleIndex ? "selected" : ""
                          }`}
                          onClick={() => selectTitle(title)}
                        >
                          {title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {existingTitles.length > 0 && (
                  <small className="form-hint">
                    💡 ابدأ بالكتابة لرؤية العناوين السابقة (
                    {existingTitles.length} عنوان متاح)
                  </small>
                )}
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

      {/* Edit Order Modal */}
      {showEditModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>تعديل الطلب</h3>
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
                  className="form-select"
                  value={orderForm.customerId}
                  onChange={(e) =>
                    setOrderForm({ ...orderForm, customerId: e.target.value })
                  }
                  required
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
                <div className="autocomplete-container">
                  <input
                    type="text"
                    className="form-input"
                    value={orderForm.title}
                    onChange={(e) => handleTitleInputChange(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    onFocus={() => {
                      if (orderForm.title.length > 0) {
                        const filtered = existingTitles.filter((title) =>
                          title
                            .toLowerCase()
                            .includes(orderForm.title.toLowerCase())
                        );
                        setFilteredTitles(filtered);
                        setShowTitleSuggestions(filtered.length > 0);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowTitleSuggestions(false), 200);
                    }}
                    placeholder="أدخل عنوان الطلب أو اختر من القائمة"
                    required
                    autoComplete="off"
                  />
                  {showTitleSuggestions && filteredTitles.length > 0 && (
                    <div className="suggestions-dropdown">
                      {filteredTitles.map((title, index) => (
                        <div
                          key={index}
                          className={`suggestion-item ${
                            index === selectedTitleIndex ? "selected" : ""
                          }`}
                          onClick={() => selectTitle(title)}
                        >
                          {title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {existingTitles.length > 0 && (
                  <small className="form-hint">
                    💡 ابدأ بالكتابة لرؤية العناوين السابقة (
                    {existingTitles.length} عنوان متاح)
                  </small>
                )}
              </div>

              <div className="form-group">
                <label>تاريخ الطلب</label>
                <input
                  type="date"
                  className="form-input"
                  value={orderForm.date}
                  onChange={(e) =>
                    setOrderForm({ ...orderForm, date: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label>حالة الطلب</label>
                <select
                  className="form-select"
                  value={orderForm.status}
                  onChange={(e) =>
                    setOrderForm({
                      ...orderForm,
                      status: e.target.value as Order["status"],
                    })
                  }
                >
                  <option value="pending">في الانتظار</option>
                  <option value="in-progress">قيد التنفيذ</option>
                  <option value="completed">مكتمل</option>
                  <option value="cancelled">ملغي</option>
                </select>
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  className="form-textarea"
                  value={orderForm.notes}
                  onChange={(e) =>
                    setOrderForm({ ...orderForm, notes: e.target.value })
                  }
                  placeholder="أدخل أي ملاحظات إضافية"
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
                onClick={handleUpdateOrder}
                disabled={!orderForm.customerId || !orderForm.title}
              >
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Element Modal */}
      {showAddElementModal && selectedOrderForElement && (
        <div className="modal-overlay">
          <div className="modal" ref={addElementModalRef}>
            <div className="modal-header">
              <h3>إضافة عنصر جديد - {selectedOrderForElement.title}</h3>
              <button
                className="close-btn"
                onClick={() => setShowAddElementModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {elementAddSuccess && (
                <div className="modal-success-banner">
                  <CheckCircle /> تمت الإضافة بنجاح
                </div>
              )}
              <div className="form-group">
                <label>اسم العنصر *</label>
                <div className="autocomplete-container">
                  <input
                    type="text"
                    value={elementForm.name}
                    onChange={(e) =>
                      handleElementNameInputChange(e.target.value)
                    }
                    onKeyDown={handleElementNameKeyDown}
                    onFocus={() => {
                      if (elementForm.name.length > 0) {
                        const filtered = existingElementNames.filter((name) =>
                          name
                            .toLowerCase()
                            .includes(elementForm.name.toLowerCase())
                        );
                        setFilteredElementNames(filtered);
                        setShowElementNameSuggestions(filtered.length > 0);
                      }
                    }}
                    onBlur={() => {
                      // Delay hiding to allow clicking on suggestions
                      setTimeout(
                        () => setShowElementNameSuggestions(false),
                        200
                      );
                    }}
                    placeholder="أدخل اسم العنصر أو اختر من القائمة"
                    className="form-input"
                    autoComplete="off"
                  />
                  {showElementNameSuggestions &&
                    filteredElementNames.length > 0 && (
                      <div className="suggestions-dropdown">
                        {filteredElementNames.map((name, index) => (
                          <div
                            key={index}
                            className={`suggestion-item ${
                              index === selectedElementNameIndex
                                ? "selected"
                                : ""
                            }`}
                            onClick={() => selectElementName(name)}
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                </div>
                {existingElementNames.length > 0 && (
                  <small className="form-hint">
                    💡 ابدأ بالكتابة لرؤية أسماء العناصر السابقة (
                    {existingElementNames.length} اسم متاح)
                  </small>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>النوع *</label>
                  <input
                    type="text"
                    value={elementForm.type}
                    onChange={(e) =>
                      setElementForm({ ...elementForm, type: e.target.value })
                    }
                    placeholder="مثل: جبس، دهان، بلاط"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>الوحدة *</label>
                  <input
                    type="text"
                    value={elementForm.unit}
                    onChange={(e) =>
                      setElementForm({ ...elementForm, unit: e.target.value })
                    }
                    placeholder="مثل: متر، قطعة، كيلو"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>الكمية *</label>
                  <input
                    type="number"
                    value={elementForm.quantity}
                    onChange={(e) =>
                      setElementForm({
                        ...elementForm,
                        quantity: parseFloat(e.target.value),
                      })
                    }
                    min="0.01"
                    step="0.01"
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label>سعر الوحدة *</label>
                  <input
                    type="number"
                    value={elementForm.unitPrice}
                    onChange={(e) =>
                      setElementForm({
                        ...elementForm,
                        unitPrice: parseFloat(e.target.value),
                      })
                    }
                    min="0"
                    step="0.01"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea
                  value={elementForm.notes}
                  onChange={(e) =>
                    setElementForm({ ...elementForm, notes: e.target.value })
                  }
                  placeholder="أدخل ملاحظات (اختياري)"
                  className="form-textarea"
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>المورد</label>
                <select
                  value={elementForm.supplierId}
                  onChange={(e) => {
                    const selectedSupplier = suppliers.find(
                      (s) => s.id === e.target.value
                    );
                    setElementForm({
                      ...elementForm,
                      supplierId: e.target.value,
                      supplierName: selectedSupplier?.name || "",
                    });
                  }}
                  className="form-select"
                >
                  <option value="">اختر المورد (اختياري)</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>الصور</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      setSelectedFiles(Array.from(e.target.files));
                    }
                  }}
                  className="form-input"
                />
                {selectedFiles.length > 0 && (
                  <small className="form-hint">
                    تم اختيار {selectedFiles.length} صورة
                  </small>
                )}
              </div>

              {elementForm.quantity > 0 && elementForm.unitPrice > 0 && (
                <div className="total-preview">
                  <span>الإجمالي:</span>
                  <span className="total-amount">
                    {formatCurrency(
                      elementForm.quantity * elementForm.unitPrice
                    )}
                  </span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowAddElementModal(false)}
              >
                إلغاء
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveElement}
                disabled={
                  !elementForm.name ||
                  !elementForm.type ||
                  !elementForm.unit ||
                  elementForm.quantity <= 0 ||
                  elementForm.unitPrice <= 0 ||
                  uploadingImages
                }
              >
                {uploadingImages ? "جاري رفع الصور..." : "إضافة العنصر"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
