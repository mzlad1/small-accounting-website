import React, { useState, useEffect } from "react";
import Calendar from "react-calendar";
import {
  Plus,
  X,
  Clock,
  Edit,
  Trash2,
  Bell,
  BellRing,
  BellOff,
  Send,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../config/firebase";
import { useAuth } from "../contexts/AuthContext";
import {
  requestNotificationPermission,
  onForegroundMessage,
  getNotificationPermissionStatus,
  removeNotificationToken,
} from "../utils/messaging";
import { format } from "date-fns";
import "react-calendar/dist/Calendar.css";
import "./Calendar.css";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  note: string;
  userEmail: string;
  reminderSent: boolean;
  createdAt: string;
}

export function CalendarPage() {
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    title: "",
    time: "",
    note: "",
  });

  // FCM Notification states
  const [notificationStatus, setNotificationStatus] =
    useState<string>("default");
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [foregroundNotification, setForegroundNotification] =
    useState<any>(null);

  useEffect(() => {
    if (currentUser) {
      fetchEvents();
      checkNotificationStatus();
      setupForegroundListener();
    }
  }, [currentUser]);

  const checkNotificationStatus = () => {
    const status = getNotificationPermissionStatus();
    setNotificationStatus(status);
  };

  const setupForegroundListener = () => {
    try {
      const unsubscribe = onForegroundMessage((payload) => {
        setForegroundNotification(payload);
        // Auto-dismiss after 5 seconds
        setTimeout(() => setForegroundNotification(null), 5000);
        // Refresh events to update reminderSent status
        fetchEvents();
      });
      return unsubscribe;
    } catch (error) {
      console.error("Error setting up foreground listener:", error);
    }
  };

  const handleEnableNotifications = async () => {
    if (!currentUser?.email) return;

    setNotificationLoading(true);
    try {
      const token = await requestNotificationPermission(currentUser.email);
      if (token) {
        setNotificationStatus("granted");
        alert("تم تفعيل الإشعارات بنجاح! ستصلك تذكيرات المواعيد تلقائياً");
      } else {
        setNotificationStatus(getNotificationPermissionStatus());
        alert(
          "لم يتم تفعيل الإشعارات. يرجى السماح بالإشعارات من إعدادات المتصفح",
        );
      }
    } catch (error: any) {
      console.error("Error enabling notifications:", error);
      alert("حدث خطأ في تفعيل الإشعارات: " + (error?.message || error));
    } finally {
      setNotificationLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    if (!currentUser?.email) return;

    try {
      await removeNotificationToken(currentUser.email);
      setNotificationStatus("denied");
      alert("تم إيقاف الإشعارات");
    } catch (error) {
      console.error("Error disabling notifications:", error);
    }
  };

  const handleTestNotification = async () => {
    try {
      const sendTest = httpsCallable(functions, "sendTestNotification");
      await sendTest();
      alert("تم إرسال إشعار تجريبي بنجاح!");
    } catch (error: any) {
      console.error("Test notification failed:", error);
      alert(error.message || "فشل في إرسال الإشعار التجريبي");
    }
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const eventsQuery = query(
        collection(db, "calendarEvents"),
        where("userEmail", "==", currentUser?.email),
        orderBy("date", "asc"),
      );

      const eventsSnapshot = await getDocs(eventsQuery);
      const eventsData: CalendarEvent[] = [];

      eventsSnapshot.forEach((doc) => {
        eventsData.push({ id: doc.id, ...doc.data() } as CalendarEvent);
      });

      setEvents(eventsData);
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.time || !formData.note) {
      alert("يرجى ملء جميع الحقول");
      return;
    }

    try {
      const eventData = {
        title: formData.title,
        date: format(selectedDate, "yyyy-MM-dd"),
        time: formData.time,
        note: formData.note,
        userEmail: currentUser?.email || "",
        reminderSent: false,
        createdAt: new Date().toISOString(),
      };

      if (editingEvent) {
        await updateDoc(doc(db, "calendarEvents", editingEvent.id), eventData);
      } else {
        await addDoc(collection(db, "calendarEvents"), eventData);
      }

      setFormData({ title: "", time: "", note: "" });
      setShowModal(false);
      setEditingEvent(null);
      await fetchEvents();
    } catch (error) {
      console.error("Error saving event:", error);
      alert("حدث خطأ في حفظ الحدث");
    }
  };

  const handleEdit = (event: CalendarEvent) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      time: event.time,
      note: event.note,
    });
    setSelectedDate(new Date(event.date));
    setShowModal(true);
  };

  const handleDelete = async (eventId: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الحدث؟")) {
      try {
        await deleteDoc(doc(db, "calendarEvents", eventId));
        await fetchEvents();
      } catch (error) {
        console.error("Error deleting event:", error);
        alert("حدث خطأ في حذف الحدث");
      }
    }
  };

  const getEventsForDate = (date: Date) => {
    const dateString = format(date, "yyyy-MM-dd");
    return events.filter((event) => event.date === dateString);
  };

  const getTileContent = ({ date, view }: { date: Date; view: string }) => {
    if (view === "month") {
      const dayEvents = getEventsForDate(date);
      if (dayEvents.length > 0) {
        return (
          <div className="calendar-tile-content">
            <div className="event-indicator">{dayEvents.length}</div>
          </div>
        );
      }
    }
    return null;
  };

  const getTileClassName = ({ date, view }: { date: Date; view: string }) => {
    if (view === "month") {
      const dayEvents = getEventsForDate(date);
      if (dayEvents.length > 0) {
        return "has-events";
      }
    }
    return "";
  };

  const selectedDateEvents = getEventsForDate(selectedDate);

  if (loading) {
    return (
      <div className="calendar-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل التقويم...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="calendar-container">
      {/* Foreground Notification Toast */}
      {foregroundNotification && (
        <div className="notification-toast">
          <div className="toast-icon">
            <BellRing size={20} />
          </div>
          <div className="toast-content">
            <strong>{foregroundNotification.notification?.title}</strong>
            <p>{foregroundNotification.notification?.body}</p>
          </div>
          <button
            className="toast-close"
            onClick={() => setForegroundNotification(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="calendar-header">
        <h1 className="calendar-title">تقويم المواعيد والتذكيرات</h1>
        <div className="header-actions">
          <button
            className="add-event-btn"
            onClick={() => {
              setEditingEvent(null);
              setFormData({ title: "", time: "", note: "" });
              setShowModal(true);
            }}
          >
            <Plus className="icon" />
            إضافة موعد جديد
          </button>
        </div>
      </div>

      {/* FCM Notification Status Bar */}
      <div className="notification-bar">
        <div className="notification-bar-content">
          <div className="notification-status">
            {notificationStatus === "granted" ? (
              <>
                <div className="status-badge active">
                  <Bell size={16} />
                  <span>الإشعارات مفعلة</span>
                </div>
                <p className="status-desc">
                  ستصلك تذكيرات تلقائية قبل 5 دقائق من كل موعد عبر Firebase
                  Cloud Functions
                </p>
              </>
            ) : notificationStatus === "denied" ? (
              <>
                <div className="status-badge inactive">
                  <BellOff size={16} />
                  <span>الإشعارات معطلة</span>
                </div>
                <p className="status-desc">
                  قم بتفعيل الإشعارات لتلقي تذكيرات المواعيد تلقائياً
                </p>
              </>
            ) : (
              <>
                <div className="status-badge pending">
                  <AlertCircle size={16} />
                  <span>الإشعارات غير مفعلة</span>
                </div>
                <p className="status-desc">
                  فعّل الإشعارات للحصول على تذكيرات تلقائية عبر Firebase Cloud
                  Messaging
                </p>
              </>
            )}
          </div>

          <div className="notification-actions">
            {notificationStatus === "granted" ? (
              <>
                <button
                  className="notif-btn test"
                  onClick={handleTestNotification}
                  title="إرسال إشعار تجريبي"
                >
                  <Send size={16} />
                  اختبار
                </button>
                <button
                  className="notif-btn disable"
                  onClick={handleDisableNotifications}
                  title="إيقاف الإشعارات"
                >
                  <BellOff size={16} />
                  إيقاف
                </button>
              </>
            ) : (
              <button
                className="notif-btn enable"
                onClick={handleEnableNotifications}
                disabled={notificationLoading}
              >
                <Bell size={16} />
                {notificationLoading ? "جاري التفعيل..." : "تفعيل الإشعارات"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="calendar-content">
        <div className="calendar-section">
          <Calendar
            onChange={(value) => {
              if (value instanceof Date) {
                setSelectedDate(value);
              }
            }}
            value={selectedDate}
            tileContent={getTileContent}
            tileClassName={getTileClassName}
            locale="ar-EG"
          />
        </div>

        <div className="events-section">
          <h2 className="events-title">
            مواعيد يوم {format(selectedDate, "dd/MM/yyyy")}
          </h2>

          {selectedDateEvents.length > 0 ? (
            <div className="events-list">
              {selectedDateEvents.map((event) => (
                <div key={event.id} className="event-card">
                  <div className="event-header">
                    <h3 className="event-title">{event.title}</h3>
                    <div className="event-actions">
                      <button
                        className="action-btn edit"
                        onClick={() => handleEdit(event)}
                        title="تعديل"
                      >
                        <Edit />
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => handleDelete(event.id)}
                        title="حذف"
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>

                  <div className="event-details">
                    <div className="event-time">
                      <Clock className="icon" />
                      {event.time}
                    </div>
                    <div className="event-note">
                      <p>{event.note}</p>
                    </div>
                    {event.reminderSent && (
                      <div className="reminder-sent">
                        <CheckCircle className="icon" />
                        تم إرسال التذكير
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-events">
              <p>لا توجد مواعيد في هذا اليوم</p>
              <span>انقر على "إضافة موعد جديد" لإضافة موعد</span>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Event Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingEvent ? "تعديل الموعد" : "إضافة موعد جديد"}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                <X />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="event-form">
              <div className="form-group">
                <label>التاريخ المحدد:</label>
                <div className="selected-date">
                  {format(selectedDate, "dd/MM/yyyy")}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="title">عنوان الموعد:</label>
                <input
                  type="text"
                  id="title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="أدخل عنوان الموعد"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="time">الوقت:</label>
                <input
                  type="time"
                  id="time"
                  value={formData.time}
                  onChange={(e) =>
                    setFormData({ ...formData, time: e.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="note">ملاحظات:</label>
                <textarea
                  id="note"
                  value={formData.note}
                  onChange={(e) =>
                    setFormData({ ...formData, note: e.target.value })
                  }
                  placeholder="أدخل تفاصيل أو ملاحظات إضافية"
                  rows={4}
                  required
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="submit-btn">
                  {editingEvent ? "تحديث الموعد" : "حفظ الموعد"}
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => setShowModal(false)}
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
