import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Mountain,
  MapPin,
  Ruler,
  DollarSign,
  X,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useParams, useNavigate } from "react-router-dom";
import "./LandGallery.css";

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

export function LandGallery() {
  const { landId } = useParams<{ landId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [land, setLand] = useState<Land | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetchLand();
  }, [landId]);

  const fetchLand = async () => {
    try {
      setLoading(true);

      if (!landId) return;

      const landDoc = await getDoc(doc(db, "lands", landId));
      if (landDoc.exists()) {
        setLand({ id: landDoc.id, ...landDoc.data() } as Land);
      }
    } catch (error) {
      console.error("Error fetching land:", error);
      alert("حدث خطأ أثناء تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IL", {
      style: "currency",
      currency: "ILS",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="land-gallery-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل الصورة...</p>
        </div>
      </div>
    );
  }

  if (!land) {
    return (
      <div className="land-gallery-container">
        <div className="no-data-message">
          <p>لم يتم العثور على الأرض</p>
          <button onClick={() => navigate("/lands")} className="back-btn">
            العودة للأراضي
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="land-gallery-container">
      {/* Header */}
      <div className="gallery-header">
        <button onClick={() => navigate(`/lands/${landId}`)} className="back-btn">
          <ArrowLeft size={20} />
          العودة
        </button>
        <h1>الصورة الجوية</h1>
      </div>

      {/* Land Info Summary */}
      <div className="land-gallery-summary">
        <div className="land-gallery-summary-content">
          <h2>{land.basinName} - قطعة {land.plotNumber}</h2>
          <div className="land-gallery-summary-details">
            <div className="land-gallery-summary-item">
              <MapPin className="land-gallery-summary-icon" />
              <span>{land.location}</span>
            </div>
            <div className="land-gallery-summary-item">
              <Mountain className="land-gallery-summary-icon" />
              <span>حوض رقم {land.basinNumber}</span>
            </div>
            <div className="land-gallery-summary-item">
              <Ruler className="land-gallery-summary-icon" />
              <span>{land.area} م²</span>
            </div>
            <div className="land-gallery-summary-item">
              <DollarSign className="land-gallery-summary-icon" />
              <span>{formatCurrency(land.price)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      {land.images && land.images.length > 0 ? (
        <div className="gallery-grid">
          {land.images.map((image, index) => (
            <div
              key={index}
              className="gallery-item"
              onClick={() => setSelectedImage(image)}
            >
              <img src={image} alt={`صورة ${index + 1}`} />
              <div className="gallery-overlay">
                <span>عرض بحجم كامل</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-images-message">
          <Mountain size={64} />
          <p>لا توجد صور لهذه الأرض</p>
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedImage && (
        <div className="lightbox-overlay" onClick={() => setSelectedImage(null)}>
          <button className="lightbox-close" onClick={() => setSelectedImage(null)}>
            <X size={24} />
          </button>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={selectedImage} alt="صورة مكبرة" />
          </div>
        </div>
      )}
    </div>
  );
}

