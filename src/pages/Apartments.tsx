import React, { useState, useEffect, useRef } from "react";
import {
  Building2,
  Home,
  MapPin,
  Layers,
  Ruler,
  DollarSign,
  CreditCard,
  Image,
  StickyNote,
  Phone,
  Plus,
  Edit,
  Trash2,
  Search,
  Eye,
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
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../config/firebase";
import { fetchCacheFirst } from "../utils/cacheFirst";
import { subscribeAll } from "../utils/live";
import { matchesSearch } from "../utils/search";
import { useNavigate } from "react-router-dom";
import "./Apartments.css";

interface Apartment {
  id: string;
  location: string;
  buildingName: string;
  floor: string;
  area: number;
  price: number;
  paymentMethod: string;
  images: string[];
  notes: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  createdAt: string;
}

export function Apartments() {
  const [loading, setLoading] = useState(true);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingApartment, setEditingApartment] = useState<Apartment | null>(null);
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
    buildingName: "",
    floor: "",
    area: 0,
    price: 0,
    paymentMethod: "نقداً",
    images: [] as string[],
    notes: "",
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
  });

  // Add-modal: focus the first field on open, and keep the dialog open
  // after a successful add so several apartments can be entered in a row.
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
      [collection(db, "apartments")],
      applySnapshots,
      () => setLoading(false),
      (error) => console.error("Error fetching data:", error)
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySnapshots = (snapshots: Array<QuerySnapshot<DocumentData>>) => {
    const [apartmentsSnapshot] = snapshots;

    const apartmentsData: Apartment[] = [];
    apartmentsSnapshot.forEach((doc) => {
      apartmentsData.push({ id: doc.id, ...doc.data() } as Apartment);
    });
    setApartments(apartmentsData);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const storageRef = ref(storage, `apartments/${Date.now()}_${file.name}`);
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
      const apartmentData = {
        ...formData,
        createdAt: editingApartment ? editingApartment.createdAt : new Date().toISOString(),
      };

      if (editingApartment) {
        await updateDoc(doc(db, "apartments", editingApartment.id), apartmentData);
        alert("تم تحديث الشقة بنجاح");
        setShowAddModal(false);
        setEditingApartment(null);
        resetForm();
      } else {
        await addDoc(collection(db, "apartments"), apartmentData);
        // Stay open for the next entry: reset the form, confirm inline,
        // and put the cursor back in the first field.
        resetForm();
        setAddSuccess(true);
        focusFirstField();
        setTimeout(() => setAddSuccess(false), 2500);
      }
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error saving apartment:", error);
      alert("حدث خطأ أثناء حفظ البيانات");
    }
  };

  const handleEdit = (apartment: Apartment) => {
    setEditingApartment(apartment);
    setFormData({
      location: apartment.location,
      buildingName: apartment.buildingName,
      floor: apartment.floor,
      area: apartment.area,
      price: apartment.price,
      paymentMethod: apartment.paymentMethod,
      images: apartment.images,
      notes: apartment.notes,
      ownerName: apartment.ownerName,
      ownerPhone: apartment.ownerPhone,
      ownerEmail: apartment.ownerEmail,
    });
    setShowAddModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه الشقة؟")) return;

    try {
      await deleteDoc(doc(db, "apartments", id));
      alert("تم حذف الشقة بنجاح");
      // The live subscription picks up the change automatically.
    } catch (error) {
      console.error("Error deleting apartment:", error);
      alert("حدث خطأ أثناء الحذف");
    }
  };

  const resetForm = () => {
    setFormData({
      location: "",
      buildingName: "",
      floor: "",
      area: 0,
      price: 0,
      paymentMethod: "نقداً",
      images: [],
      notes: "",
      ownerName: "",
      ownerPhone: "",
      ownerEmail: "",
    });
  };

  const filteredApartments = apartments.filter((apartment) =>
    matchesSearch(apartment, searchTerm)
  );

  // Sorting (was on the table headers, now driven from the filters bar) —
  // always applied BEFORE the pagination slice.
  const sortedApartments = [...filteredApartments].sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case "buildingName":
        comparison = (a.buildingName || "").localeCompare(b.buildingName || "", "ar");
        break;
      case "location":
        comparison = (a.location || "").localeCompare(b.location || "", "ar");
        break;
      case "floor":
        comparison = (a.floor || "").localeCompare(b.floor || "", "ar", {
          numeric: true,
        });
        break;
      case "area":
        comparison = (a.area || 0) - (b.area || 0);
        break;
      case "price":
        comparison = (a.price || 0) - (b.price || 0);
        break;
      case "paymentMethod":
        comparison = (a.paymentMethod || "").localeCompare(b.paymentMethod || "", "ar");
        break;
      default:
        comparison = (a.createdAt || "").localeCompare(b.createdAt || "");
    }
    return sortOrder === "asc" ? comparison : -comparison;
  });

  // Pagination
  const totalPages = Math.ceil(filteredApartments.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentApartments = sortedApartments.slice(indexOfFirstItem, indexOfLastItem);

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

  // Payment-method pill tone — reuses the system's status color family
  const paymentTone = (method: string) => {
    if (method === "نقداً") return "apt-tag-cash";
    if (method === "تقسيط") return "apt-tag-install";
    if (method === "شيكات") return "apt-tag-check";
    return "apt-tag-bank";
  };

  if (loading) {
    return (
      <div className="apartments-page-container">
        <div className="apartments-loading-spinner">
          <div className="apartments-spinner"></div>
          <p>جاري تحميل الشقق...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="apartments-page-container">
      {/* Header */}
      <div className="apartments-page-header">
        <div className="apartments-header-content">
          <h1>الشقق</h1>
          <p>إدارة الشقق المتاحة</p>
        </div>
        <button
          className="apartments-add-btn"
          onClick={() => {
            resetForm();
            setEditingApartment(null);
            setShowAddModal(true);
          }}
        >
          <Plus className="apartments-btn-icon" />
          إضافة شقة
        </button>
      </div>

      {/* Search */}
      <FiltersBar onClear={() => setSearchTerm("")}>
        <SearchField
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="بحث عن شقة..."
        />
        {/* Sorting moved off the (now removed) column headers into the bar */}
        <SortControl
          value={sortBy}
          onChange={(field) => {
            if (field !== sortBy) handleSort(field);
          }}
          options={[
            { value: "createdAt", label: "تاريخ الإضافة" },
            { value: "buildingName", label: "اسم العمارة" },
            { value: "location", label: "الموقع" },
            { value: "floor", label: "الطابق" },
            { value: "area", label: "المساحة" },
            { value: "price", label: "السعر" },
            { value: "paymentMethod", label: "آلية الدفع" },
          ]}
          order={sortOrder}
          onToggleOrder={() => handleSort(sortBy)}
        />
      </FiltersBar>

      {/* Listing cards */}
      <div className="apt-grid">
        {currentApartments.map((apartment) => (
          <div
            key={apartment.id}
            className="apt-prop"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button, a, input, select")) return;
              navigate(`/apartments/${apartment.id}`);
            }}
          >
            <div className="apt-prop-photo">
              {apartment.images && apartment.images.length > 0 ? (
                <img src={apartment.images[0]} alt={apartment.buildingName} />
              ) : (
                <div className="apt-prop-ph">
                  <Home size={44} />
                </div>
              )}
              <div className="apt-prop-badge">
                <span className={`apt-tag ${paymentTone(apartment.paymentMethod)}`}>
                  <CreditCard size={12} />
                  {apartment.paymentMethod}
                </span>
              </div>
              {apartment.images && apartment.images.length > 0 && (
                <span className="apt-photocount">
                  <Image size={12} />
                  {apartment.images.length}
                </span>
              )}
            </div>

            <div className="apt-priceband">
              <span className="apt-price">{formatCurrency(apartment.price)}</span>
              {apartment.area > 0 && (
                <span className="apt-permeter">
                  {formatCurrency(apartment.price / apartment.area)} / م²
                </span>
              )}
            </div>

            <div className="apt-prop-body">
              <h3>{apartment.buildingName}</h3>

              <div className="apt-loc">
                <MapPin size={13} className="apt-loc-icon" />
                <LocationValue value={apartment.location} />
              </div>

              <div className="apt-chips">
                <span>
                  <Layers size={12} />
                  الطابق {apartment.floor}
                </span>
                <span>
                  <Ruler size={12} />
                  {apartment.area} م²
                </span>
              </div>

              {apartment.notes && (
                <div className="apt-note">
                  <StickyNote size={12} />
                  <p>{apartment.notes}</p>
                </div>
              )}

              <div className="apt-prop-foot">
                <div className="apt-actions">
                  <button
                    className="apartments-action-btn apartments-view-btn"
                    onClick={() => navigate(`/apartments/${apartment.id}`)}
                    title="عرض التفاصيل"
                  >
                    <Eye size={16} />
                    تفاصيل
                  </button>
                  {apartment.images && apartment.images.length > 0 && (
                    <button
                      className="apartments-action-btn apartments-gallery-btn"
                      onClick={() => navigate(`/apartments/${apartment.id}/gallery`)}
                      title="عرض الصور"
                    >
                      <Image size={16} />
                      الصور ({apartment.images.length})
                    </button>
                  )}
                  <button
                    className="apartments-action-btn apartments-contact-btn"
                    onClick={() => navigate(`/apartments/${apartment.id}`)}
                    title="معلومات المالك"
                  >
                    <Phone size={16} />
                    تواصل
                  </button>
                  <button
                    className="apartments-action-btn apartments-edit-btn"
                    onClick={() => handleEdit(apartment)}
                    title="تعديل"
                  >
                    <Edit size={16} />
                  </button>
                  <button
                    className="apartments-action-btn apartments-delete-btn"
                    onClick={() => handleDelete(apartment.id)}
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

      {filteredApartments.length === 0 && (
        <div className="apt-empty">
          <Building2 size={34} />
          <p>لا توجد شقق مطابقة — أضف شقة جديدة للبدء</p>
        </div>
      )}

      {/* Pagination */}
      {filteredApartments.length > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={filteredApartments.length}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
          onItemsPerPageChange={(size) => {
            setItemsPerPage(size);
            setCurrentPage(1);
          }}
          itemLabel="شقة"
          pageSizeOptions={[9, 18, 36]}
        />
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="apartments-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div
            className="apartments-modal-content"
            ref={addModalRef}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editingApartment ? "تعديل شقة" : "إضافة شقة جديدة"}</h2>
            <form onSubmit={handleSubmit}>
              {addSuccess && (
                <div className="modal-success-banner">
                  <CheckCircle />
                  تمت الإضافة بنجاح
                </div>
              )}
              <div className="apartments-form-grid">
                <div className="apartments-form-group">
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

                <div className="apartments-form-group">
                  <label>اسم العمارة *</label>
                  <input
                    type="text"
                    value={formData.buildingName}
                    onChange={(e) =>
                      setFormData({ ...formData, buildingName: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="apartments-form-group">
                  <label>الطابق *</label>
                  <input
                    type="text"
                    value={formData.floor}
                    onChange={(e) =>
                      setFormData({ ...formData, floor: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="apartments-form-group">
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

                <div className="apartments-form-group">
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

                <div className="apartments-form-group">
                  <label>آلية الدفع *</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) =>
                      setFormData({ ...formData, paymentMethod: e.target.value })
                    }
                    required
                  >
                    <option value="نقداً">نقداً</option>
                    <option value="تقسيط">تقسيط</option>
                    <option value="شيكات">شيكات</option>
                    <option value="تحويل بنكي">تحويل بنكي</option>
                  </select>
                </div>

                <div className="apartments-form-group apartments-full-width">
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

                <div className="apartments-form-group">
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

                <div className="apartments-form-group">
                  <label>بريد المالك الإلكتروني</label>
                  <input
                    type="email"
                    value={formData.ownerEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, ownerEmail: e.target.value })
                    }
                  />
                </div>

                <div className="apartments-form-group apartments-full-width">
                  <label>ملاحظات</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    rows={3}
                  />
                </div>

                <div className="apartments-form-group apartments-full-width">
                  <label>الصور</label>
                  <div className="apartments-upload-area">
                    <input
                      type="file"
                      id="apartments-image-upload"
                      multiple
                      accept="image/*"
                      onChange={handleImageUpload}
                      style={{ display: "none" }}
                    />
                    <label
                      htmlFor="apartments-image-upload"
                      className="apartments-upload-btn"
                    >
                      <Upload size={20} />
                      {uploading ? "جاري الرفع..." : "اختر صور"}
                    </label>
                  </div>
                  <div className="apartments-images-preview">
                    {formData.images.map((image, index) => (
                      <div key={index} className="apartments-image-preview-item">
                        <img src={image} alt={`صورة ${index + 1}`} />
                        <button
                          type="button"
                          className="apartments-remove-image-btn"
                          onClick={() => handleRemoveImage(index)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="apartments-modal-actions">
                <button type="submit" className="apartments-submit-btn" disabled={uploading}>
                  {editingApartment ? "تحديث" : "إضافة"}
                </button>
                <button
                  type="button"
                  className="apartments-cancel-btn"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingApartment(null);
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
