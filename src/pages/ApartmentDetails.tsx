import React, { useState, useEffect } from "react";
import {
  Building2,
  MapPin,
  Layers,
  Ruler,
  DollarSign,
  CreditCard,
  StickyNote,
  User,
  Phone,
  Mail,
  ArrowLeft,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useParams, useNavigate } from "react-router-dom";
import "./ApartmentDetails.css";

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

export function ApartmentDetails() {
  const { apartmentId } = useParams<{ apartmentId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [apartment, setApartment] = useState<Apartment | null>(null);

  useEffect(() => {
    fetchData();
  }, [apartmentId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      if (!apartmentId) return;

      // Fetch apartment
      const apartmentDoc = await getDoc(doc(db, "apartments", apartmentId));
      if (apartmentDoc.exists()) {
        const apartmentData = { id: apartmentDoc.id, ...apartmentDoc.data() } as Apartment;
        setApartment(apartmentData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
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
      <div className="apartment-details-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل التفاصيل...</p>
        </div>
      </div>
    );
  }

  if (!apartment) {
    return (
      <div className="apartment-details-container">
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
    <div className="apartment-details-container">
      {/* Header */}
      <div className="details-header">
        <button onClick={() => navigate("/apartments")} className="back-btn">
          <ArrowLeft size={20} />
          العودة
        </button>
        <h1>تفاصيل الشقة</h1>
      </div>

      <div className="details-content">
        {/* Apartment Details Card */}
        <div className="details-card">
          <div className="card-header">
            <Building2 className="card-icon" />
            <h2>معلومات الشقة</h2>
          </div>

          <div className="card-body">
            <div className="detail-row">
              <div className="detail-label">
                <Building2 className="detail-icon" />
                <span>اسم العمارة</span>
              </div>
              <div className="detail-value">{apartment.buildingName}</div>
            </div>

            <div className="detail-row">
              <div className="detail-label">
                <MapPin className="detail-icon" />
                <span>الموقع</span>
              </div>
              <div className="detail-value">{apartment.location}</div>
            </div>

            <div className="detail-row">
              <div className="detail-label">
                <Layers className="detail-icon" />
                <span>الطابق</span>
              </div>
              <div className="detail-value">{apartment.floor}</div>
            </div>

            <div className="detail-row">
              <div className="detail-label">
                <Ruler className="detail-icon" />
                <span>المساحة</span>
              </div>
              <div className="detail-value">{apartment.area} م²</div>
            </div>

            <div className="detail-row">
              <div className="detail-label">
                <DollarSign className="detail-icon" />
                <span>السعر</span>
              </div>
              <div className="detail-value highlight">{formatCurrency(apartment.price)}</div>
            </div>

            <div className="detail-row">
              <div className="detail-label">
                <CreditCard className="detail-icon" />
                <span>آلية الدفع</span>
              </div>
              <div className="detail-value">{apartment.paymentMethod}</div>
            </div>

            {apartment.notes && (
              <div className="detail-row">
                <div className="detail-label">
                  <StickyNote className="detail-icon" />
                  <span>ملاحظات</span>
                </div>
                <div className="detail-value">{apartment.notes}</div>
              </div>
            )}
          </div>
        </div>

        {/* Owner Details Card */}
        <div className="details-card owner-card">
          <div className="card-header">
            <User className="card-icon" />
            <h2>معلومات المالك</h2>
          </div>

          <div className="card-body">
            <div className="owner-info">
              <div className="owner-avatar">
                <User size={48} />
              </div>
              <div className="owner-details">
                <h3>{apartment.ownerName}</h3>
              </div>
            </div>

            <div className="contact-details">
              <div className="contact-item">
                <Phone className="contact-icon" />
                <div className="contact-info">
                  <span className="contact-label">رقم الهاتف</span>
                  <a href={`tel:${apartment.ownerPhone}`} className="contact-value">
                    {apartment.ownerPhone}
                  </a>
                </div>
              </div>

              {apartment.ownerEmail && (
                <div className="contact-item">
                  <Mail className="contact-icon" />
                  <div className="contact-info">
                    <span className="contact-label">البريد الإلكتروني</span>
                    <a href={`mailto:${apartment.ownerEmail}`} className="contact-value">
                      {apartment.ownerEmail}
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="contact-actions">
              <a href={`tel:${apartment.ownerPhone}`} className="contact-btn phone">
                <Phone size={18} />
                اتصال هاتفي
              </a>
              {apartment.ownerEmail && (
                <a href={`mailto:${apartment.ownerEmail}`} className="contact-btn email">
                  <Mail size={18} />
                  إرسال بريد
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Images Section */}
      {apartment.images.length > 0 && (
        <div className="images-section">
          <h2>صور الشقة</h2>
          <div className="images-grid">
            {apartment.images.map((image, index) => (
              <div key={index} className="image-item">
                <img src={image} alt={`صورة ${index + 1}`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

