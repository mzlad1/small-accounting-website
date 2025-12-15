import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Building2,
  MapPin,
  Layers,
  Ruler,
  DollarSign,
  X,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useParams, useNavigate } from "react-router-dom";
import "./ApartmentGallery.css";

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
  ownerId: string;
  ownerName: string;
  createdAt: string;
}

export function ApartmentGallery() {
  const { apartmentId } = useParams<{ apartmentId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetchApartment();
  }, [apartmentId]);

  const fetchApartment = async () => {
    try {
      setLoading(true);

      if (!apartmentId) return;

      const apartmentDoc = await getDoc(doc(db, "apartments", apartmentId));
      if (apartmentDoc.exists()) {
        setApartment({
          id: apartmentDoc.id,
          ...apartmentDoc.data(),
        } as Apartment);
      }
    } catch (error) {
      console.error("Error fetching apartment:", error);
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
      <div className="apartment-gallery-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل الصور...</p>
        </div>
      </div>
    );
  }

  if (!apartment) {
    return (
      <div className="apartment-gallery-container">
        <div className="no-data-message">
          <p>لم يتم العثور على الشقة</p>
          <button onClick={() => navigate("/apartments")} className="back-btn">
            العودة للشقق
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="apartment-gallery-container">
      {/* Header */}
      <div className="gallery-header">
        <button
          onClick={() => navigate(`/apartments/${apartmentId}`)}
          className="back-btn"
        >
          <ArrowLeft size={20} />
          العودة
        </button>
        <h1>صور الشقة</h1>
      </div>

      {/* Apartment Info Summary */}
      <div className="apartment-gallery-summary">
        <div className="apartment-gallery-summary-content">
          <h2>{apartment.buildingName}</h2>
          <div className="apartment-gallery-summary-details">
            <div className="apartment-gallery-summary-item">
              <MapPin className="apartment-gallery-summary-icon" />
              <span>{apartment.location}</span>
            </div>
            <div className="apartment-gallery-summary-item">
              <Layers className="apartment-gallery-summary-icon" />
              <span>الطابق {apartment.floor}</span>
            </div>
            <div className="apartment-gallery-summary-item">
              <Ruler className="apartment-gallery-summary-icon" />
              <span>{apartment.area} م²</span>
            </div>
            <div className="apartment-gallery-summary-item">
              <DollarSign className="apartment-gallery-summary-icon" />
              <span>{formatCurrency(apartment.price)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      {apartment.images.length > 0 ? (
        <div className="gallery-grid">
          {apartment.images.map((image, index) => (
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
          <Building2 size={64} />
          <p>لا توجد صور لهذه الشقة</p>
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedImage && (
        <div
          className="lightbox-overlay"
          onClick={() => setSelectedImage(null)}
        >
          <button
            className="lightbox-close"
            onClick={() => setSelectedImage(null)}
          >
            <X size={24} />
          </button>
          <div
            className="lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={selectedImage} alt="صورة مكبرة" />
          </div>
        </div>
      )}
    </div>
  );
}
