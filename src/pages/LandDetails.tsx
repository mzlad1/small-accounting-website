import React, { useState, useEffect } from "react";
import {
  Mountain,
  MapPin,
  Ruler,
  DollarSign,
  StickyNote,
  User,
  Phone,
  Mail,
  ArrowLeft,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { useParams, useNavigate } from "react-router-dom";
import "./LandDetails.css";

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

export function LandDetails() {
  const { landId } = useParams<{ landId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [land, setLand] = useState<Land | null>(null);

  useEffect(() => {
    fetchData();
  }, [landId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      if (!landId) return;

      // Fetch land
      const landDoc = await getDoc(doc(db, "lands", landId));
      if (landDoc.exists()) {
        const landData = { id: landDoc.id, ...landDoc.data() } as Land;
        setLand(landData);
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
      <div className="land-details-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل التفاصيل...</p>
        </div>
      </div>
    );
  }

  if (!land) {
    return (
      <div className="land-details-container">
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
    <div className="land-details-container">
      {/* Header */}
      <div className="details-header">
        <button onClick={() => navigate("/lands")} className="back-btn">
          <ArrowLeft size={20} />
          العودة
        </button>
        <h1>تفاصيل الأرض</h1>
      </div>

      <div className="details-content">
        {/* Land Details Card */}
        <div className="details-card">
          <div className="card-header">
            <Mountain className="card-icon" />
            <h2>معلومات الأرض</h2>
          </div>

          <div className="card-body">
            <div className="detail-row">
              <div className="detail-label">
                <MapPin className="detail-icon" />
                <span>الموقع</span>
              </div>
              <div className="detail-value">{land.location}</div>
            </div>

            <div className="detail-row">
              <div className="detail-label">
                <Mountain className="detail-icon" />
                <span>اسم الحوض</span>
              </div>
              <div className="detail-value">{land.basinName}</div>
            </div>

            <div className="detail-row">
              <div className="detail-label">
                <Mountain className="detail-icon" />
                <span>رقم الحوض</span>
              </div>
              <div className="detail-value">{land.basinNumber}</div>
            </div>

            <div className="detail-row">
              <div className="detail-label">
                <Mountain className="detail-icon" />
                <span>رقم القطعة</span>
              </div>
              <div className="detail-value">{land.plotNumber}</div>
            </div>

            <div className="detail-row">
              <div className="detail-label">
                <Ruler className="detail-icon" />
                <span>المساحة</span>
              </div>
              <div className="detail-value">{land.area} م²</div>
            </div>

            <div className="detail-row">
              <div className="detail-label">
                <DollarSign className="detail-icon" />
                <span>السعر</span>
              </div>
              <div className="detail-value highlight">{formatCurrency(land.price)}</div>
            </div>

            {land.notes && (
              <div className="detail-row">
                <div className="detail-label">
                  <StickyNote className="detail-icon" />
                  <span>ملاحظات</span>
                </div>
                <div className="detail-value">{land.notes}</div>
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
                <h3>{land.ownerName}</h3>
              </div>
            </div>

            <div className="contact-details">
              <div className="contact-item">
                <Phone className="contact-icon" />
                <div className="contact-info">
                  <span className="contact-label">رقم الهاتف</span>
                  <a href={`tel:${land.ownerPhone}`} className="contact-value">
                    {land.ownerPhone}
                  </a>
                </div>
              </div>

              {land.ownerEmail && (
                <div className="contact-item">
                  <Mail className="contact-icon" />
                  <div className="contact-info">
                    <span className="contact-label">البريد الإلكتروني</span>
                    <a href={`mailto:${land.ownerEmail}`} className="contact-value">
                      {land.ownerEmail}
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="contact-actions">
              <a href={`tel:${land.ownerPhone}`} className="contact-btn phone">
                <Phone size={18} />
                اتصال هاتفي
              </a>
              {land.ownerEmail && (
                <a href={`mailto:${land.ownerEmail}`} className="contact-btn email">
                  <Mail size={18} />
                  إرسال بريد
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Images Section */}
      {land.images && land.images.length > 0 && (
        <div className="images-section">
          <h2>صور الأرض</h2>
          <div className="images-grid">
            {land.images.map((image, index) => (
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

