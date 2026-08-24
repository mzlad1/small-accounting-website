import React, { useState, useEffect, useRef } from "react";
import {
  MapPin,
  Map,
  Ruler,
  DollarSign,
  Image,
  StickyNote,
  Phone,
  Plus,
  Edit,
  Trash2,
  Search,
  Eye,
  Mountain,
  Upload,
  X,
  CheckCircle,
  SortAsc,
  SortDesc,
} from "lucide-react";
import { LocationValue } from "../components/LocationValue";
import { Pagination } from "../components/Pagination";
import { FiltersBar, SearchField, SortControl } from "../components/Filters";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, DocumentData, QuerySnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../config/firebase";
import { fetchCacheFirst } from "../utils/cacheFirst";
import { subscribeAll } from "../utils/live";
import { matchesSearch } from "../utils/search";
import { useNavigate } from "react-router-dom";
import "./Lands.css";

interface Land {
  id: string;
  location: string;
  basinName: string;
  basinNumber: string;
  plotNumber: string;
  area: number;
  price: number;
  images: string[];
  notes: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  createdAt: string;
}

export function Lands() {
  const [loading, setLoading] = useState(true);
  const [lands, setLands] = useState<Land[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLand, setEditingLand] = useState<Land | null>(null);
  const [uploading, setUploading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(9);
  // Sorting lives in the filters bar (the listing has no table headers)
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const navigate = useNavigate();

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const [formData, setFormData] = useState({
    location: "",
    basinName: "",
    basinNumber: "",
    plotNumber: "",
    area: 0,
    price: 0,
    images: [] as string[],
    notes: "",
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
  });

  // Add-modal: focus the first field on open, and keep the dialog open
  // after a successful add so several lands can be entered in a row.
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

  useEffect(() => {
    setLoading(true);
    // Live subscription: instant paint from the persistent cache, then
    // the server, then every later change (own writes appear at once).
    const unsubscribe = subscribeAll(
      [collection(db, "lands")],
      applySnapshots,
      () => setLoading(false),
      (error) => console.error("Error fetching data:", error)
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySnapshots = (snapshots: Array<QuerySnapshot<DocumentData>>) => {
    const [landsSnapshot] = snapshots;

    const landsData: Land[] = [];
    landsSnapshot.forEach((doc) => {
      landsData.push({ id: doc.id, ...doc.data() } as Land);
    });
    setLands(landsData);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const storageRef = ref(storage, `lands/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        return url;
      });

      const urls = await Promise.all(uploadPromises);
      setFormData({ ...formData, images: [...formData.images, ...urls] });
      alert("تم رفع الصور بنجاح");
    } catch (error) {
      console.error("Error uploading images:", error);
      alert("حدث خطأ أثناء رفع الصور");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = formData.images.filter((_, i) => i !== index);
    setFormData({ ...formData, images: newImages });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.ownerName || !formData.ownerPhone) {
      alert("الرجاء إدخال بيانات المالك");
      return;
    }

    try {
      const landData = {
        ...formData,
        createdAt: editingLand ? editingLand.createdAt : new Date().toISOString(),
      };

      if (editingLand) {
        await updateDoc(doc(db, "lands", editingLand.id), landData);
        alert("تم تحديث الأرض بنجاح");
        setShowAddModal(false);
        setEditingLand(null);
        resetForm();
      } else {
        await addDoc(collection(db, "lands"), landData);
        // Stay open for the next entry: reset the form, confirm inline,
        // and put the cursor back in the first field.
        resetForm();
        setAddSuccess(true);
        focusFirstField();
        setTimeout(() => setAddSuccess(false), 2500);
      }
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error saving land:", error);
      alert("حدث خطأ أثناء حفظ البيانات");
    }
  };

  const handleEdit = (land: Land) => {
    setEditingLand(land);
    setFormData({
      location: land.location,
      basinName: land.basinName,
      basinNumber: land.basinNumber,
      plotNumber: land.plotNumber,
      area: land.area,
      price: land.price,
      images: land.images || [],
      notes: land.notes,
      ownerName: land.ownerName,
      ownerPhone: land.ownerPhone,
      ownerEmail: land.ownerEmail,
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه الأرض؟")) return;

    try {
      await deleteDoc(doc(db, "lands", id));
      alert("تم حذف الأرض بنجاح");
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error deleting land:", error);
      alert("حدث خطأ أثناء الحذف");
    }
  };

  const resetForm = () => {
    setFormData({
      location: "",
      basinName: "",
      basinNumber: "",
      plotNumber: "",
      area: 0,
      price: 0,
      images: [],
      notes: "",
      ownerName: "",
      ownerPhone: "",
      ownerEmail: "",
    });
  };

  const filteredLands = lands.filter((land) =>
    matchesSearch(land, searchTerm)
  );

  // Sorting (was on the table headers, now driven from the filters bar) —
  // always applied BEFORE the pagination slice.
  const sortedLands = [...filteredLands].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "basinName":
        comparison = (a.basinName || "").localeCompare(b.basinName || "", "ar");
        break;
      case "location":
        comparison = (a.location || "").localeCompare(b.location || "", "ar");
        break;
      case "basinNumber":
        comparison = (a.basinNumber || "").localeCompare(b.basinNumber || "", "ar", {
          numeric: true,
        });
        break;
      case "plotNumber":
        comparison = (a.plotNumber || "").localeCompare(b.plotNumber || "", "ar", {
          numeric: true,
        });
        break;
      case "area":
        comparison = (a.area || 0) - (b.area || 0);
        break;
      case "price":
        comparison = (a.price || 0) - (b.price || 0);
        break;
      default:
        comparison = (a.createdAt || "").localeCompare(b.createdAt || "");
    }
    return sortOrder === "asc" ? comparison : -comparison;
  });

  // Pagination
  const totalPages = Math.ceil(filteredLands.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLands = sortedLands.slice(indexOfFirstItem, indexOfLastItem);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IL", {
      style: "currency",
      currency: "ILS",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="lands-page-container">
        <div className="lands-loading-spinner">
          <div className="lands-spinner"></div>
          <p>جاري تحميل الأراضي...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lands-page-container">
      {/* Header */}
      <div className="lands-page-header">
        <div className="lands-header-content">
          <h1>الأراضي</h1>
          <p>إدارة الأراضي المتاحة</p>
        </div>
        <button
          className="lands-add-btn"
          onClick={() => {
            resetForm();
            setEditingLand(null);
            setShowAddModal(true);
          }}
        >
          <Plus className="lands-btn-icon" />
          إضافة أرض
        </button>
      </div>

      {/* Search */}
      <FiltersBar onClear={() => setSearchTerm("")}>
        <SearchField
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="بحث عن أرض..."
        />
        {/* Sorting moved off the (now removed) column headers into the bar */}
        <SortControl
          value={sortBy}
          onChange={(field) => {
            if (field !== sortBy) handleSort(field);
          }}
          options={[
            { value: "createdAt", label: "تاريخ الإضافة" },
            { value: "basinName", label: "اسم الحوض" },
            { value: "location", label: "الموقع" },
            { value: "basinNumber", label: "رقم الحوض" },
            { value: "plotNumber", label: "رقم القطعة" },
            { value: "area", label: "المساحة" },
            { value: "price", label: "السعر" },
          ]}
          order={sortOrder}
          onToggleOrder={() => handleSort(sortBy)}
        />
      </FiltersBar>

      {/* Listing cards */}
      <div className="lnd-grid">
        {currentLands.map((land) => (
          <div
            key={land.id}
            className="lnd-prop"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button, a, input, select")) return;
              navigate(`/lands/${land.id}`);
            }}
          >
            <div className="lnd-prop-photo">
              {land.images && land.images.length > 0 ? (
                <img
                  src={land.images[0]}
                  alt={`${land.basinName} - ${land.plotNumber}`}
                />
              ) : (
                <div className="lnd-prop-ph">
                  <Map size={44} />
                </div>
              )}
              <div className="lnd-prop-badge">
                <span className="lnd-tag">
                  <Map size={12} />
                  قطعة {land.plotNumber}
                </span>
              </div>
              {land.images && land.images.length > 0 && (
                <span className="lnd-photocount">
                  <Image size={12} />
                  {land.images.length}
                </span>
              )}
            </div>

            <div className="lnd-priceband">
              <span className="lnd-price">{formatCurrency(land.price)}</span>
              {land.area > 0 && (
                <span className="lnd-permeter">
                  {formatCurrency(land.price / land.area)} / م²
                </span>
              )}
            </div>

            <div className="lnd-prop-body">
              <h3>{land.basinName}</h3>

              <div className="lnd-loc">
                <MapPin size={13} className="lnd-loc-icon" />
                <LocationValue value={land.location} />
              </div>

              <div className="lnd-chips">
                <span>
                  <Mountain size={12} />
                  حوض رقم {land.basinNumber}
                </span>
                <span>
                  <Ruler size={12} />
                  {land.area} م²
                </span>
              </div>

              {land.notes && (
                <div className="lnd-note">
                  <StickyNote size={12} />
                  <p>{land.notes}</p>
                </div>
              )}

              <div className="lnd-prop-foot">
                <div className="lnd-actions">
                  <button
                    className="lands-action-btn lands-view-btn"
                    onClick={() => navigate(`/lands/${land.id}`)}
                    title="عرض التفاصيل"
                  >
                    <Eye size={16} />
                    تفاصيل
                  </button>
                  {land.images && land.images.length > 0 && (
                    <button
                      className="lands-action-btn lands-gallery-btn"
                      onClick={() => navigate(`/lands/${land.id}/gallery`)}
                      title="عرض الصور"
                    >
                      <Image size={16} />
                      الصور ({land.images.length})
                    </button>
                  )}
                  <button
                    className="lands-action-btn lands-contact-btn"
                    onClick={() => navigate(`/lands/${land.id}`)}
                    title="معلومات المالك"
                  >
                    <Phone size={16} />
                    تواصل
                  </button>
                  <button
                    className="lands-action-btn lands-edit-btn"
                    onClick={() => handleEdit(land)}
                    title="تعديل"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    className="lands-action-btn lands-delete-btn"
                    onClick={() => handleDelete(land.id)}
                    title="حذف"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredLands.length === 0 && (
        <div className="lnd-empty">
          <Mountain size={34} />
          <p>لا توجد أراضي مطابقة — أضف أرضاً جديدة للبدء</p>
        </div>
      )}

      {/* Pagination */}
      {filteredLands.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={filteredLands.length}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
          onItemsPerPageChange={(size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          }}
          itemLabel="أرض"
          pageSizeOptions={[9, 18, 36]}
        />
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="lands-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div
            className="lands-modal-content"
            ref={addModalRef}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editingLand ? "تعديل أرض" : "إضافة أرض جديدة"}</h2>
            <form onSubmit={handleSubmit}>
              {addSuccess && (
                <div className="modal-success-banner">
                  <CheckCircle />
                  تمت الإضافة بنجاح
                </div>
              )}
              <div className="lands-form-grid">
                <div className="lands-form-group">
                  <label>الموقع *</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) =>
                      setFormData({ ...formData, location: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="lands-form-group">
                  <label>اسم الحوض *</label>
                  <input
                    type="text"
                    value={formData.basinName}
                    onChange={(e) =>
                      setFormData({ ...formData, basinName: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="lands-form-group">
                  <label>رقم الحوض *</label>
                  <input
                    type="text"
                    value={formData.basinNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, basinNumber: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="lands-form-group">
                  <label>رقم القطعة *</label>
                  <input
                    type="text"
                    value={formData.plotNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, plotNumber: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="lands-form-group">
                  <label>المساحة (م²) *</label>
                  <input
                    type="number"
                    value={formData.area}
                    onChange={(e) =>
                      setFormData({ ...formData, area: parseFloat(e.target.value) })
                    }
                    required
                  />
                </div>

                <div className="lands-form-group">
                  <label>السعر (₪) *</label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: parseFloat(e.target.value) })
                    }
                    required
                  />
                </div>

                <div className="lands-form-group lands-full-width">
                  <label>اسم المالك *</label>
                  <input
                    type="text"
                    value={formData.ownerName}
                    onChange={(e) =>
                      setFormData({ ...formData, ownerName: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="lands-form-group">
                  <label>رقم هاتف المالك *</label>
                  <input
                    type="tel"
                    value={formData.ownerPhone}
                    onChange={(e) =>
                      setFormData({ ...formData, ownerPhone: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="lands-form-group">
                  <label>بريد المالك الإلكتروني</label>
                  <input
                    type="email"
                    value={formData.ownerEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, ownerEmail: e.target.value })
                    }
                  />
                </div>

                <div className="lands-form-group lands-full-width">
                  <label>الصور الجوية</label>
                  <div className="lands-upload-area">
                    <input
                      type="file"
                      id="lands-image-upload"
                      multiple
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: "none" }}
                    />
                    <label
                      htmlFor="lands-image-upload"
                      className="lands-upload-btn"
                    >
                      <Upload size={20} />
                      {uploading ? "جاري الرفع..." : "اختر صور"}
                    </label>
                  </div>
                  <div className="lands-images-preview">
                    {formData.images.map((image, index) => (
                      <div key={index} className="lands-image-preview-item">
                        <img src={image} alt={`صورة ${index + 1}`} />
                        <button
                          type="button"
                          className="lands-remove-image-btn"
                          onClick={() => handleRemoveImage(index)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lands-form-group lands-full-width">
                  <label>ملاحظات</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    rows={3}
                  />
                </div>
              </div>

              <div className="lands-modal-actions">
                <button type="submit" className="lands-submit-btn" disabled={uploading}>
                  {editingLand ? "تحديث" : "إضافة"}
                </button>
                <button
                  type="button"
                  className="lands-cancel-btn"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingLand(null);
                    resetForm();
                  }}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
