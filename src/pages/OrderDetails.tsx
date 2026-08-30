import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
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
  writeBatch,
  doc,
  query,
  where,
  orderBy,
  DocumentData,
  QuerySnapshot,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db, storage } from "../config/firebase";
import { fetchCacheFirst } from "../utils/cacheFirst";
import { subscribeAll } from "../utils/live";
import { matchesSearch } from "../utils/search";
import { compressImage, IMMUTABLE_CACHE } from "../utils/imageCompress";
import {
  parseLegacyDmy,
  getItemDateIso,
  formatItemDate,
} from "../utils/itemDate";
import {
  FiltersBar,
  SearchField,
  SelectField,
  SortControl,
} from "../components/Filters";

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
  itemDate?: string;
  unitPrice: number;
  total: number;
  notes?: string;
  supplierId?: string;
  supplierName?: string;
  images?: string[];
  createdAt: string;
}

export function OrderDetails() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>(
    []
  );
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
    itemDate: "",
    unitPrice: 0,
    notes: "",
    supplierId: "",
    supplierName: "",
    images: [] as string[],
  });
  const [uploadingImages, setUploadingImages] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const [orderStatus, setOrderStatus] = useState<Order["status"]>("pending");

  // Element name suggestions state
  const [existingElementNames, setExistingElementNames] = useState<string[]>(
    []
  );
  const [showElementNameSuggestions, setShowElementNameSuggestions] =
    useState(false);
  const [filteredElementNames, setFilteredElementNames] = useState<string[]>(
    []
  );
  const [selectedElementNameIndex, setSelectedElementNameIndex] = useState(-1);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(true);

  // Add-modal: focus the first field on open, and keep the dialog open
  // after a successful add so several items can be entered in a row.
  const addModalRef = useRef<HTMLDivElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const migratedRef = useRef(false);
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
    if (showAddItemModal) {
      setAddSuccess(false);
      focusFirstField();
    }
  }, [showAddItemModal]);

  useEffect(() => {
    if (!orderId) return;

    setLoading(true);
    // Live subscription: instant paint from the persistent cache, then
    // the server, then every later change (own writes appear at once).
    const unsubscribe = subscribeAll(
      [
        query(collection(db, "orders"), where("__name__", "==", orderId)),
        collection(db, "suppliers"),
        query(
          collection(db, "orderItems"),
          where("orderId", "==", orderId),
          orderBy("createdAt", "asc")
        ),
        collection(db, "orderItems"),
      ],
      applySnapshots,
      () => setLoading(false),
      (error) => console.error("Error fetching order data:", error)
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (order) {
      setOrderStatus(order.status);
    }
  }, [order]);

  const applySnapshots = (snapshots: Array<QuerySnapshot<DocumentData>>) => {
    const [orderDoc, suppliersSnapshot, itemsSnapshot, allItemsSnapshot] =
      snapshots;

    // Fetch order details
    if (!orderDoc.empty) {
      const orderData = {
        id: orderDoc.docs[0].id,
        ...orderDoc.docs[0].data(),
      } as Order;
      setOrder(orderData);
      setOrderStatus(orderData.status);
    }

    // Fetch suppliers
    const suppliersData: { id: string; name: string }[] = [];
    suppliersSnapshot.forEach((doc) => {
      const data = doc.data();
      suppliersData.push({ id: doc.id, name: data.name });
    });
    setSuppliers(suppliersData);

    // Fetch order items
    const itemsData: OrderItem[] = [];
    itemsSnapshot.forEach((doc) => {
      itemsData.push({ id: doc.id, ...doc.data() } as OrderItem);
    });
    setItems(itemsData);

    // Fetch all order items to get existing element names for suggestions
    const allItemsData: any[] = [];
    allItemsSnapshot.forEach((doc) => {
      allItemsData.push({ id: doc.id, ...doc.data() });
    });

    // Extract unique element names from all order items
    const uniqueElementNames = [
      ...new Set(allItemsData.map((item) => item.name)),
    ].filter((name) => name && name.trim() !== "");
    setExistingElementNames(uniqueElementNames);
  };

  const handleImageUpload = async (files: File[]): Promise<string[]> => {
    const uploadPromises = files.map(async (file) => {
      const upload = await compressImage(file);
      const fileName = `order-items/${orderId}/${Date.now()}_${upload.name}`;
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, upload, {
        contentType: upload.type,
        cacheControl: IMMUTABLE_CACHE,
      });
      return await getDownloadURL(storageRef);
    });
    return await Promise.all(uploadPromises);
  };

  const handleDeleteImage = async (imageUrl: string) => {
    try {
      const imageRef = ref(storage, imageUrl);
      await deleteObject(imageRef);
    } catch (error) {
      console.error("Error deleting image:", error);
    }
  };

  const handleAddItem = async () => {
    try {
      setUploadingImages(true);

      // Upload images if any
      let imageUrls: string[] = [];
      if (selectedFiles.length > 0) {
        imageUrls = await handleImageUpload(selectedFiles);
      }

      const total = itemForm.quantity * itemForm.unitPrice;
      const newItem = {
        ...itemForm,
        orderId: orderId!,
        total,
        images: imageUrls,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "orderItems"), newItem);

      // Stay open for the next entry: reset the form, confirm inline,
      // and put the cursor back in the first field.
      setItemForm({
        name: "",
        type: "",
        quantity: 1,
        unit: "",
        itemDate: "",
        unitPrice: 0,
        notes: "",
        supplierId: "",
        supplierName: "",
        images: [],
      });
      setSelectedFiles([]);
      setShowElementNameSuggestions(false);
      setSelectedElementNameIndex(-1);
      setAddSuccess(true);
      focusFirstField();
      setTimeout(() => setAddSuccess(false), 2500);
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error adding item:", error);
      alert("حدث خطأ أثناء إضافة العنصر");
    } finally {
      setUploadingImages(false);
    }
  };

  const handleEditItem = async () => {
    if (!selectedItem) return;

    try {
      setUploadingImages(true);

      // Upload new images if any
      let newImageUrls: string[] = [];
      if (selectedFiles.length > 0) {
        newImageUrls = await handleImageUpload(selectedFiles);
      }

      // Combine existing and new images
      const allImages = [...itemForm.images, ...newImageUrls];

      const total = itemForm.quantity * itemForm.unitPrice;
      const updatedItem = {
        ...itemForm,
        total,
        images: allImages,
      };

      await updateDoc(doc(db, "orderItems", selectedItem.id), updatedItem);

      setShowEditItemModal(false);
      setSelectedItem(null);
      setItemForm({
        name: "",
        type: "",
        quantity: 1,
        unit: "",
        itemDate: "",
        unitPrice: 0,
        notes: "",
        supplierId: "",
        supplierName: "",
        images: [],
      });
      setSelectedFiles([]);
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error updating item:", error);
    } finally {
      setUploadingImages(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!selectedItem) return;

    try {
      await deleteDoc(doc(db, "orderItems", selectedItem.id));

      setShowDeleteItemModal(false);
      setSelectedItem(null);
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  const handleStatusChange = async (newStatus: Order["status"]) => {
    if (!order) return;

    try {
      await updateDoc(doc(db, "orders", order.id), { status: newStatus });
      setOrderStatus(newStatus);
      // The live subscription picks up the change automatically.
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
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2b241c; padding-bottom: 20px; }
              .order-info { margin-bottom: 20px; }
              .order-info p { margin: 5px 0; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #d8cdbb; padding: 8px; text-align: right; }
              th { background-color: #f0eae0; font-weight: bold; }
              .total { font-weight: bold; font-size: 1.2em; margin-top: 20px; }
              .status { display: inline-block; padding: 4px 8px; border-radius: 4px; color: white; }
              .status.pending { background-color: #a9741f; }
              .status.in-progress { background-color: #bc5727; }
              .status.completed { background-color: #4a7c59; }
              .status.cancelled { background-color: #b23b2e; }
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
                  <th>التاريخ</th>
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
                    <td>${formatItemDate(item)}</td>
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
                "EN-GB"
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
      itemDate: getItemDateIso(item),
      unitPrice: item.unitPrice,
      notes: item.notes || "",
      supplierId: item.supplierId || "",
      supplierName: item.supplierName || "",
      images: item.images || [],
    });
    setSelectedFiles([]);
    setShowEditItemModal(true);
  };

  const openDeleteItemModal = (item: OrderItem) => {
    setSelectedItem(item);
    setShowDeleteItemModal(true);
  };

  // One-time migration: items whose الوحدة holds a d/m/yyyy date get a
  // proper itemDate field (the original unit value stays untouched)
  useEffect(() => {
    if (migratedRef.current || items.length === 0) return;
    const toMigrate = items.filter(
      (it) => !it.itemDate && parseLegacyDmy(it.unit)
    );
    if (toMigrate.length === 0) return;
    migratedRef.current = true;
    const batch = writeBatch(db);
    toMigrate.forEach((it) =>
      batch.update(doc(db, "orderItems", it.id), {
        itemDate: parseLegacyDmy(it.unit),
      })
    );
    batch
      .commit()
      .then(() =>
        console.log(`Migrated ${toMigrate.length} item dates from unit field`)
      )
      .catch((e) => console.warn("itemDate migration failed:", e));
  }, [items]);

  const getFilteredAndSortedItems = () => {
    let filtered = [...items];

    // Any-field search
    if (searchTerm) {
      filtered = filtered.filter((item) => matchesSearch(item, searchTerm));
    }

    // Apply type filter
    if (filters.type !== "all") {
      filtered = filtered.filter((item) => item.type === filters.type);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;
      if (sortBy.field === "itemDate") {
        aValue = getItemDateIso(a);
        bValue = getItemDateIso(b);
      } else {
        aValue = a[sortBy.field as keyof OrderItem];
        bValue = b[sortBy.field as keyof OrderItem];
      }

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
    return new Date(dateString).toLocaleDateString("en-GB");
  };

  const calculateOrderTotal = () => {
    return items.reduce((sum, item) => sum + item.total, 0);
  };

  const getUniqueTypes = () => {
    const types = items.map((item) => item.type);
    return ["all", ...Array.from(new Set(types))];
  };

  // Element name suggestions functions
  const handleElementNameInputChange = (value: string) => {
    setItemForm({ ...itemForm, name: value });
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
    setItemForm({ ...itemForm, name });
    setShowElementNameSuggestions(false);
    setSelectedElementNameIndex(-1);
  };

  const openImageViewer = (images: string[], startIndex: number = 0) => {
    setViewerImages(images);
    setCurrentImageIndex(startIndex);
    setShowImageViewer(true);
  };

  const nextImage = () => {
    setImageLoading(true);
    setCurrentImageIndex((prev) => (prev + 1) % viewerImages.length);
  };

  const prevImage = () => {
    setImageLoading(true);
    setCurrentImageIndex(
      (prev) => (prev - 1 + viewerImages.length) % viewerImages.length
    );
  };

  const handleImageViewerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") nextImage();
    if (e.key === "ArrowLeft") prevImage();
    if (e.key === "Escape") setShowImageViewer(false);
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
        <FiltersBar
          onClear={() => {
            setSearchTerm("");
            setFilters({ type: "all" });
            setSortBy({ field: "name", order: "asc" });
          }}
        >
          <SearchField value={searchTerm} onChange={setSearchTerm} />
          <SelectField
            label="النوع"
            value={filters.type}
            onChange={(type) => setFilters({ ...filters, type })}
            options={getUniqueTypes().map((type) => ({
              value: type,
              label: type === "all" ? "جميع الأنواع" : type,
            }))}
          />
          <SortControl
            value={sortBy.field}
            onChange={(field) => setSortBy({ ...sortBy, field })}
            options={[
              { value: "name", label: "الاسم" },
              { value: "type", label: "النوع" },
              { value: "quantity", label: "الكمية" },
              { value: "unitPrice", label: "السعر" },
              { value: "total", label: "الإجمالي" },
              { value: "itemDate", label: "التاريخ" },
            ]}
            order={sortBy.order}
            onToggleOrder={() =>
              setSortBy({
                ...sortBy,
                order: sortBy.order === "asc" ? "desc" : "asc",
              })
            }
          />
        </FiltersBar>

        {/* Items Table */}
        <div className="od-table-container">
          <table className="od-items-table">
            <thead>
              <tr>
                <th>اسم العنصر</th>
                <th>النوع</th>
                <th>الكمية</th>
                <th>التاريخ</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
                <th>الصور</th>
                <th>ملاحظات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="od-no-data">
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
                      <div className="od-item-unit">{formatItemDate(item)}</div>
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
                      <div className="od-item-images">
                        {item.images && item.images.length > 0 ? (
                          <div className="od-images-preview">
                            <div
                              className="od-image-wrapper"
                              onClick={() => openImageViewer(item.images!, 0)}
                            >
                              <img
                                src={item.images[0]}
                                alt={`${item.name}`}
                                className="od-table-image"
                              />
                              {item.images.length > 1 && (
                                <span className="od-image-badge">
                                  {item.images.length}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="od-no-images">-</span>
                        )}
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
          <div className="od-modal" ref={addModalRef}>
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
              {addSuccess && (
                <div className="modal-success-banner">
                  <CheckCircle />
                  تمت الإضافة بنجاح
                </div>
              )}
              <div className="od-form-group">
                <label>اسم العنصر *</label>
                <div className="autocomplete-container">
                  <input
                    type="text"
                    value={itemForm.name}
                    onChange={(e) =>
                      handleElementNameInputChange(e.target.value)
                    }
                    onKeyDown={handleElementNameKeyDown}
                    onFocus={() => {
                      if (itemForm.name.length > 0) {
                        const filtered = existingElementNames.filter((name) =>
                          name
                            .toLowerCase()
                            .includes(itemForm.name.toLowerCase())
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
                    className="od-form-input"
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
                  <label>التاريخ *</label>
                  <input
                    type="date"
                    value={itemForm.itemDate}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, itemDate: e.target.value })
                    }
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

              <div className="od-form-group">
                <label>المورد</label>
                <select
                  value={itemForm.supplierId}
                  onChange={(e) => {
                    const selectedSupplier = suppliers.find(
                      (s) => s.id === e.target.value
                    );
                    setItemForm({
                      ...itemForm,
                      supplierId: e.target.value,
                      supplierName: selectedSupplier?.name || "",
                    });
                  }}
                  className="od-form-select"
                >
                  <option value="">اختر المورد (اختياري)</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="od-form-group">
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
                  className="od-form-input"
                />
                {selectedFiles.length > 0 && (
                  <small className="form-hint">
                    تم اختيار {selectedFiles.length} صورة
                  </small>
                )}
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
                  !itemForm.itemDate ||
                  itemForm.quantity <= 0 ||
                  itemForm.unitPrice <= 0 ||
                  uploadingImages
                }
              >
                {uploadingImages ? "جاري رفع الصور..." : "إضافة العنصر"}
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
                onClick={() => {
                  setShowEditItemModal(false);
                  setItemForm({
                    name: "",
                    type: "",
                    quantity: 1,
                    unit: "",
                    itemDate: "",
                    unitPrice: 0,
                    notes: "",
                    supplierId: "",
                    supplierName: "",
                    images: [],
                  });
                  setSelectedFiles([]);
                  setSelectedItem(null);
                }}
              >
                <X />
              </button>
            </div>
            <div className="od-modal-body">
              <div className="od-form-group">
                <label>اسم العنصر *</label>
                <div className="autocomplete-container">
                  <input
                    type="text"
                    value={itemForm.name}
                    onChange={(e) =>
                      handleElementNameInputChange(e.target.value)
                    }
                    onKeyDown={handleElementNameKeyDown}
                    onFocus={() => {
                      if (itemForm.name.length > 0) {
                        const filtered = existingElementNames.filter((name) =>
                          name
                            .toLowerCase()
                            .includes(itemForm.name.toLowerCase())
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
                    className="od-form-input"
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
                  <label>التاريخ *</label>
                  <input
                    type="date"
                    value={itemForm.itemDate}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, itemDate: e.target.value })
                    }
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

              <div className="od-form-group">
                <label>المورد</label>
                <select
                  value={itemForm.supplierId}
                  onChange={(e) => {
                    const selectedSupplier = suppliers.find(
                      (s) => s.id === e.target.value
                    );
                    setItemForm({
                      ...itemForm,
                      supplierId: e.target.value,
                      supplierName: selectedSupplier?.name || "",
                    });
                  }}
                  className="od-form-select"
                >
                  <option value="">اختر المورد (اختياري)</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              {itemForm.images && itemForm.images.length > 0 && (
                <div className="od-form-group">
                  <label>الصور الحالية</label>
                  <div className="od-images-grid">
                    {itemForm.images.map((imageUrl, index) => (
                      <div key={index} className="od-image-item">
                        <img src={imageUrl} alt={`صورة ${index + 1}`} />
                        <button
                          type="button"
                          className="od-delete-image-btn"
                          onClick={async () => {
                            await handleDeleteImage(imageUrl);
                            setItemForm({
                              ...itemForm,
                              images: itemForm.images.filter(
                                (_, i) => i !== index
                              ),
                            });
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="od-form-group">
                <label>إضافة صور جديدة</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      setSelectedFiles(Array.from(e.target.files));
                    }
                  }}
                  className="od-form-input"
                />
                {selectedFiles.length > 0 && (
                  <small className="form-hint">
                    تم اختيار {selectedFiles.length} صورة جديدة
                  </small>
                )}
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
                onClick={() => {
                  setShowEditItemModal(false);
                  setItemForm({
                    name: "",
                    type: "",
                    quantity: 1,
                    unit: "",
                    itemDate: "",
                    unitPrice: 0,
                    notes: "",
                    supplierId: "",
                    supplierName: "",
                    images: [],
                  });
                  setSelectedFiles([]);
                  setSelectedItem(null);
                }}
              >
                إلغاء
              </button>
              <button
                className="od-btn-primary"
                onClick={handleEditItem}
                disabled={
                  !itemForm.name ||
                  !itemForm.type ||
                  !itemForm.itemDate ||
                  itemForm.quantity <= 0 ||
                  itemForm.unitPrice <= 0 ||
                  uploadingImages
                }
              >
                <Save className="od-btn-icon" />
                {uploadingImages ? "جاري رفع الصور..." : "حفظ التغييرات"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Viewer Modal */}
      {showImageViewer && (
        <div
          className="od-image-viewer-overlay"
          onClick={() => setShowImageViewer(false)}
        >
          <div
            className="od-image-viewer"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleImageViewerKeyDown}
            tabIndex={0}
          >
            <button
              className="od-viewer-close"
              onClick={() => setShowImageViewer(false)}
            >
              <X size={24} />
            </button>

            <button
              className="od-viewer-nav od-viewer-prev"
              onClick={prevImage}
              disabled={imageLoading}
            >
              <ArrowLeft size={32} />
            </button>

            <div className="od-viewer-content">
              {imageLoading && (
                <div className="od-image-loader">
                  <div className="od-spinner"></div>
                </div>
              )}
              <img
                src={viewerImages[currentImageIndex]}
                alt={`Image ${currentImageIndex + 1}`}
                onLoad={() => setImageLoading(false)}
                style={{ display: imageLoading ? "none" : "block" }}
              />
              <div className="od-viewer-counter">
                {currentImageIndex + 1} / {viewerImages.length}
              </div>
            </div>

            <button
              className="od-viewer-nav od-viewer-next"
              onClick={nextImage}
              disabled={imageLoading}
            >
              <ArrowLeft size={32} style={{ transform: "rotate(180deg)" }} />
            </button>
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
