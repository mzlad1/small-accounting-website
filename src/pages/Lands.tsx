import React, { useState, useEffect } from "react";
import {
  MapPin,
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
} from "lucide-react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../config/firebase";
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
  const [itemsPerPage] = useState(9);
  const navigate = useNavigate();

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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const landsSnapshot = await getDocs(collection(db, "lands"));
      const landsData: Land[] = [];
      landsSnapshot.forEach((doc) => {
        landsData.push({ id: doc.id, ...doc.data() } as Land);
      });
      setLands(landsData);
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
      } else {
        await addDoc(collection(db, "lands"), landData);
        alert("تمت إضافة الأرض بنجاح");
      }

      setShowAddModal(false);
      setEditingLand(null);
      resetForm();
      fetchData();
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
      fetchData();
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

  const filteredLands = lands.filter(
    (land) =>
      land.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      land.basinName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      land.plotNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      land.ownerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination
  const totalPages = Math.ceil(filteredLands.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLands = filteredLands.slice(indexOfFirstItem, indexOfLastItem);

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
      <div className="lands-search-section">
        <div className="lands-search-box">
          <Search className="lands-search-icon" />
          <input
            type="text"
            placeholder="بحث عن أرض..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Lands Grid */}
      <div className="lands-grid">
        {currentLands.map((land) => (
          <div key={land.id} className="lands-card">
            <div className="lands-card-image">
              {land.images && land.images.length > 0 ? (
                <img src={land.images[0]} alt={`${land.basinName} - ${land.plotNumber}`} />
              ) : (
                <div className="lands-no-image">
                  <Mountain size={48} />
                </div>
              )}
              <div className="lands-card-price">
                {formatCurrency(land.price)}
              </div>
            </div>

            <div className="lands-card-content">
              <h3 className="lands-card-title">
                {land.basinName} - قطعة {land.plotNumber}
              </h3>

              <div className="lands-card-details">
                <div className="lands-detail-item">
                  <MapPin className="lands-detail-icon" />
                  <span>{land.location}</span>
                </div>
                <div className="lands-detail-item">
                  <Mountain className="lands-detail-icon" />
                  <span>حوض رقم {land.basinNumber}</span>
                </div>
                <div className="lands-detail-item">
                  <Ruler className="lands-detail-icon" />
                  <span>{land.area} م²</span>
                </div>
              </div>

              {land.notes && (
                <div className="lands-card-notes">
                  <StickyNote className="lands-note-icon" />
                  <p>{land.notes}</p>
                </div>
              )}

              <div className="lands-card-actions">
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
        ))}
      </div>

      {filteredLands.length === 0 && (
        <div className="lands-no-data-message">
          <Mountain size={64} />
          <p>لا توجد أراضي</p>
          <span>قم بإضافة أرض جديدة</span>
        </div>
      )}

      {/* Pagination */}
      {filteredLands.length > 0 && totalPages > 1 && (
        <div className="lands-pagination">
          <button
            className="lands-pagination-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            السابق
          </button>
          
          <div className="lands-pagination-numbers">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
              <button
                key={pageNumber}
                className={`lands-pagination-number ${
                  currentPage === pageNumber ? "active" : ""
                }`}
                onClick={() => handlePageChange(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
          </div>

          <button
            className="lands-pagination-btn"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            التالي
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="lands-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="lands-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingLand ? "تعديل أرض" : "إضافة أرض جديدة"}</h2>
            <form onSubmit={handleSubmit}>
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
