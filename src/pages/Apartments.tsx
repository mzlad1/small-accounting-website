import React, { useState, useEffect } from "react";
import {
  Building2,
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
} from "lucide-react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../config/firebase";
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
  const [itemsPerPage] = useState(9);
  const navigate = useNavigate();

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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const apartmentsSnapshot = await getDocs(collection(db, "apartments"));
      const apartmentsData: Apartment[] = [];
      apartmentsSnapshot.forEach((doc) => {
        apartmentsData.push({ id: doc.id, ...doc.data() } as Apartment);
      });
      setApartments(apartmentsData);
    } catch (error) {
      console.error("Error fetching data:", error);
      alert("حدث خطأ أثناء تحميل البيانات");
    } finally {
      setLoading(false);
    }
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
      } else {
        await addDoc(collection(db, "apartments"), apartmentData);
        alert("تمت إضافة الشقة بنجاح");
      }

      setShowAddModal(false);
      setEditingApartment(null);
      resetForm();
      fetchData();
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
      fetchData();
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

  const filteredApartments = apartments.filter(
    (apartment) =>
      apartment.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apartment.buildingName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apartment.ownerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredApartments.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentApartments = filteredApartments.slice(indexOfFirstItem, indexOfLastItem);

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
      <div className="apartments-search-section">
        <div className="apartments-search-box">
          <Search className="apartments-search-icon" />
          <input
            type="text"
            placeholder="بحث عن شقة..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Apartments Grid */}
      <div className="apartments-grid">
        {currentApartments.map((apartment) => (
          <div key={apartment.id} className="apartments-card">
            <div className="apartments-card-image">
              {apartment.images.length > 0 ? (
                <img src={apartment.images[0]} alt={apartment.buildingName} />
              ) : (
                <div className="apartments-no-image">
                  <Building2 size={48} />
                </div>
              )}
              <div className="apartments-card-price">
                {formatCurrency(apartment.price)}
              </div>
            </div>

            <div className="apartments-card-content">
              <h3 className="apartments-card-title">{apartment.buildingName}</h3>

              <div className="apartments-card-details">
                <div className="apartments-detail-item">
                  <MapPin className="apartments-detail-icon" />
                  <span>{apartment.location}</span>
                </div>
                <div className="apartments-detail-item">
                  <Layers className="apartments-detail-icon" />
                  <span>الطابق {apartment.floor}</span>
                </div>
                <div className="apartments-detail-item">
                  <Ruler className="apartments-detail-icon" />
                  <span>{apartment.area} م²</span>
                </div>
                <div className="apartments-detail-item">
                  <CreditCard className="apartments-detail-icon" />
                  <span>{apartment.paymentMethod}</span>
                </div>
              </div>

              {apartment.notes && (
                <div className="apartments-card-notes">
                  <StickyNote className="apartments-note-icon" />
                  <p>{apartment.notes}</p>
                </div>
              )}

              <div className="apartments-card-actions">
                <button
                  className="apartments-action-btn apartments-view-btn"
                  onClick={() => navigate(`/apartments/${apartment.id}`)}
                  title="عرض التفاصيل"
                >
                  <Eye size={16} />
                  تفاصيل
                </button>
                {apartment.images.length > 0 && (
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
        ))}
      </div>

      {filteredApartments.length === 0 && (
        <div className="apartments-no-data-message">
          <Building2 size={64} />
          <p>لا توجد شقق</p>
          <span>قم بإضافة شقة جديدة</span>
        </div>
      )}

      {/* Pagination */}
      {filteredApartments.length > 0 && totalPages > 1 && (
        <div className="apartments-pagination">
          <button
            className="apartments-pagination-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            السابق
          </button>
          
          <div className="apartments-pagination-numbers">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                className={`apartments-pagination-number ${
                  currentPage === pageNumber ? "active" : ""
                }`}
                onClick={() => handlePageChange(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
          </div>

          <button
            className="apartments-pagination-btn"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            التالي
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="apartments-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="apartments-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingApartment ? "تعديل شقة" : "إضافة شقة جديدة"}</h2>
            <form onSubmit={handleSubmit}>
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
