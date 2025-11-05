import React, { useState, useEffect } from "react";
import Calendar from "react-calendar";
import { Plus, X, Clock, Mail, Edit, Trash2, Bell } from "lucide-react";
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
import { db } from "../config/firebase";
import { useAuth } from "../contexts/AuthContext";
import emailjs from "@emailjs/browser";
import { format, isSameDay, isAfter, isBefore, addMinutes } from "date-fns";
import "react-calendar/dist/Calendar.css";
import "./Calendar.css";

interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date string
  time: string; // HH:MM format
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

  useEffect(() => {
    if (currentUser) {
      fetchEvents();
      // Check for reminders every minute
      const interval = setInterval(() => {
        // Always fetch fresh events before checking reminders
        fetchEvents().then(() => {
          checkReminders();
        });
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const eventsQuery = query(
        collection(db, "calendarEvents"),
        where("userEmail", "==", currentUser?.email),
        orderBy("date", "asc")
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

  const checkReminders = async () => {
    const now = new Date();
    console.log("Checking reminders at:", now.toLocaleString());

    // Fetch fresh events from database
    let currentEvents = events;
    if (events.length === 0) {
      console.log("No events in state, fetching from database...");
      try {
        const eventsQuery = query(
          collection(db, "calendarEvents"),
          where("userEmail", "==", currentUser?.email),
          orderBy("date", "asc")
        );
        const eventsSnapshot = await getDocs(eventsQuery);
        currentEvents = [];
        eventsSnapshot.forEach((doc) => {
          currentEvents.push({ id: doc.id, ...doc.data() } as CalendarEvent);
        });
        console.log("Fetched fresh events:", currentEvents);
      } catch (error) {
        console.error("Error fetching fresh events:", error);
        return;
      }
    }

    console.log("Total events to check:", currentEvents.length);
    console.log("All events:", currentEvents);

    // Add a test event for debugging (only if no events exist)
    if (currentEvents.length === 0) {
      const testEvent = {
        id: "test-123",
        title: "Test Event",
        date: format(new Date(), "yyyy-MM-dd"),
        time: format(new Date(Date.now() + 2 * 60 * 1000), "HH:mm"), // 2 minutes from now
        note: "This is a test event",
        userEmail: currentUser?.email || "",
        reminderSent: false,
        createdAt: new Date().toISOString(),
      };
      currentEvents = [testEvent];
      console.log("Added test event for debugging:", testEvent);
    }

    const eventsToRemind = currentEvents.filter((event) => {
      // Create event datetime with seconds set to 0 for accurate comparison
      const eventDateTime = new Date(`${event.date}T${event.time}:00`);

      // Create current time but round down to the minute (set seconds to 0)
      const currentTime = new Date(now);
      currentTime.setSeconds(0, 0); // Set seconds and milliseconds to 0

      const timeDiff = eventDateTime.getTime() - currentTime.getTime();
      const timeDiffMinutes = Math.round(timeDiff / (1000 * 60));

      console.log(
        `Event: ${event.title}`,
        `\n  Event DateTime: ${eventDateTime.toLocaleString()} (${event.date} ${
          event.time
        })`,
        `\n  Current Time (rounded): ${currentTime.toLocaleString()}`,
        `\n  TimeDiff: ${timeDiffMinutes} minutes`,
        `\n  ReminderSent: ${event.reminderSent}`,
        `\n  Should remind: ${
          timeDiffMinutes <= 5 && timeDiffMinutes >= 0 && !event.reminderSent
        }`
      );

      // Send reminder if event is within 5 minutes (0-5 minutes from now) and hasn't been sent yet
      return (
        timeDiffMinutes <= 5 && timeDiffMinutes >= 0 && !event.reminderSent
      );
    });

    console.log(`Found ${eventsToRemind.length} events to remind`);

    for (const event of eventsToRemind) {
      console.log(`Sending reminder for: ${event.title}`);
      await sendEmailReminder(event);
      // Refresh events after sending to update the state
      await fetchEvents();
    }
  };

  const sendEmailReminder = async (event: CalendarEvent) => {
    try {
      console.log("Attempting to send email with data:", {
        to_email: event.userEmail,
        to_name: currentUser?.displayName || "مستخدم",
        event_title: event.title,
        event_date: format(new Date(event.date), "dd/MM/yyyy"),
        event_time: event.time,
        event_note: event.note,
      });

      // Initialize EmailJS
      const result = await emailjs.send(
        "service_khshse4", // Replace with your EmailJS service ID
        "template_ebxflzi", // Replace with your EmailJS template ID
        {
          to_email: event.userEmail,
          to_name: currentUser?.displayName || "مستخدم",
          event_title: event.title,
          event_date: format(new Date(event.date), "dd/MM/yyyy"),
          event_time: event.time,
          event_note: event.note,
        },
        "3AU1RwSSy_BN9h50e" // Replace with your EmailJS public key
      );

      console.log("EmailJS Response:", result);

      // Update event to mark reminder as sent
      await updateDoc(doc(db, "calendarEvents", event.id), {
        reminderSent: true,
      });

      console.log("✅ Reminder sent successfully for event:", event.title);
      alert(`تم إرسال تذكير بنجاح للموعد: ${event.title}`);
    } catch (error) {
      console.error("❌ Error sending reminder:", error);
      alert(
        `فشل في إرسال التذكير للموعد: ${event.title}. تحقق من إعدادات EmailJS`
      );
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

  // Test email function
  const testEmailSetup = async () => {
    try {
      console.log("Testing email setup...");
      const result = await emailjs.send(
        "service_khshse4",
        "template_ebxflzi",
        {
          to_email: currentUser?.email || "test@example.com",
          to_name: currentUser?.displayName || "مستخدم",
          event_title: "اختبار النظام",
          event_date: format(new Date(), "dd/MM/yyyy"),
          event_time: format(new Date(), "HH:mm"),
          event_note: "هذا اختبار لتأكيد عمل نظام إرسال الإيميلات",
        },
        "3AU1RwSSy_BN9h50e"
      );

      console.log("Test email result:", result);
      alert("✅ تم إرسال الإيميل التجريبي بنجاح! تحقق من صندوق الوارد");
    } catch (error) {
      console.error("Test email failed:", error);
      alert(
        "❌ فشل في إرسال الإيميل التجريبي. تحقق من إعدادات EmailJS في وحة التحكم"
      );
    }
  };

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
      <div className="calendar-header">
        <h1 className="calendar-title">تقويم المواعيد والتذكيرات</h1>
        <div className="header-actions">
          <button
            className="test-email-btn"
            onClick={testEmailSetup}
            title="اختبار إعدادات الإيميل"
          >
            <Mail className="icon" />
            اختبار الإيميل
          </button>
          <button
            className="check-reminders-btn"
            onClick={checkReminders}
            title="فحص التذكيرات الآن"
          >
            <Bell className="icon" />
            فحص التذكيرات
          </button>
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
                        <Bell className="icon" />
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
