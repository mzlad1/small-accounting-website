import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../config/firebase";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  Calendar,
  FileText,
  CheckCircle,
  Circle,
} from "lucide-react";
import "./Tasks.css";

interface Task {
  id: string;
  name: string;
  description: string;
  date: string;
  notes?: string;
  completed: boolean;
  createdAt: string;
}

export function Tasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    completed: false,
  });

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const tasksQuery = query(
        collection(db, "tasks"),
        orderBy("date", "desc")
      );
      const tasksSnapshot = await getDocs(tasksQuery);
      const tasksData: Task[] = [];
      tasksSnapshot.forEach((doc) => {
        const data = doc.data();
        tasksData.push({
          id: doc.id,
          name: data.name,
          description: data.description,
          date: data.date,
          notes: data.notes || "",
          completed: data.completed || false,
          createdAt: data.createdAt,
        });
      });
      setTasks(tasksData);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      alert("حدث خطأ أثناء جلب المهام");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (task?: Task) => {
    if (task) {
      setEditingTask(task);
      setFormData({
        name: task.name,
        description: task.description,
        date: task.date,
        notes: task.notes || "",
        completed: task.completed,
      });
    } else {
      setEditingTask(null);
      setFormData({
        name: "",
        description: "",
        date: new Date().toISOString().split("T")[0],
        notes: "",
        completed: false,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTask(null);
    setFormData({
      name: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
      notes: "",
      completed: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("الرجاء إدخال اسم المهمة");
      return;
    }

    if (!formData.description.trim()) {
      alert("الرجاء إدخال وصف المهمة");
      return;
    }

    if (!formData.date) {
      alert("الرجاء اختيار تاريخ المهمة");
      return;
    }

    try {
      if (editingTask) {
        // Update existing task
        await updateDoc(doc(db, "tasks", editingTask.id), {
          name: formData.name.trim(),
          description: formData.description.trim(),
          date: formData.date,
          notes: formData.notes.trim(),
          completed: formData.completed,
        });
        alert("تم تحديث المهمة بنجاح");
      } else {
        // Add new task
        await addDoc(collection(db, "tasks"), {
          name: formData.name.trim(),
          description: formData.description.trim(),
          date: formData.date,
          notes: formData.notes.trim(),
          completed: false,
          createdAt: new Date().toISOString(),
        });
        alert("تمت إضافة المهمة بنجاح");
      }
      handleCloseModal();
      fetchTasks();
    } catch (error) {
      console.error("Error saving task:", error);
      alert("حدث خطأ أثناء حفظ المهمة");
    }
  };

  const handleDelete = async (taskId: string) => {
    if (!window.confirm("هل أنت متأكد من حذف هذه المهمة؟")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "tasks", taskId));
      alert("تم حذف المهمة بنجاح");
      fetchTasks();
    } catch (error) {
      console.error("Error deleting task:", error);
      alert("حدث خطأ أثناء حذف المهمة");
    }
  };

  const handleToggleComplete = async (task: Task) => {
    try {
      await updateDoc(doc(db, "tasks", task.id), {
        completed: !task.completed,
      });
      fetchTasks();
    } catch (error) {
      console.error("Error updating task status:", error);
      alert("حدث خطأ أثناء تحديث حالة المهمة");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ar-EG", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const groupTasksByDate = () => {
    const grouped: { [key: string]: Task[] } = {};
    tasks.forEach((task) => {
      if (!grouped[task.date]) {
        grouped[task.date] = [];
      }
      grouped[task.date].push(task);
    });
    return grouped;
  };

  const groupedTasks = groupTasksByDate();
  const sortedDates = Object.keys(groupedTasks).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  if (loading) {
    return (
      <div className="tasks-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>جاري تحميل المهام...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tasks-container">
      {/* Header */}
      <div className="tasks-header">
        <div>
          <h1 className="tasks-title">المهام</h1>
          <p className="tasks-subtitle">إدارة وتتبع جميع المهام اليومية</p>
        </div>
        <button className="add-task-btn" onClick={() => handleOpenModal()}>
          <Plus className="btn-icon" />
          <span>إضافة مهمة جديدة</span>
        </button>
      </div>

      {/* Tasks List */}
      <div className="tasks-content">
        {tasks.length === 0 ? (
          <div className="empty-state">
            <FileText className="empty-icon" />
            <h3>لا توجد مهام</h3>
            <p>ابدأ بإضافة مهمة جديدة</p>
            <button className="add-task-btn" onClick={() => handleOpenModal()}>
              <Plus className="btn-icon" />
              <span>إضافة مهمة</span>
            </button>
          </div>
        ) : (
          <div className="tasks-by-date">
            {sortedDates.map((date) => (
              <div key={date} className="date-group">
                <div className="date-header">
                  <Calendar className="date-icon" />
                  <h2 className="date-title">{formatDate(date)}</h2>
                  <span className="tasks-count">
                    {groupedTasks[date].length} مهمة
                  </span>
                </div>
                <div className="tasks-list">
                  {groupedTasks[date].map((task) => (
                    <div
                      key={task.id}
                      className={`task-card ${
                        task.completed ? "completed" : ""
                      }`}
                    >
                      <div className="task-main">
                        <button
                          className="complete-checkbox"
                          onClick={() => handleToggleComplete(task)}
                        >
                          {task.completed ? (
                            <CheckCircle className="check-icon completed" />
                          ) : (
                            <Circle className="check-icon" />
                          )}
                        </button>
                        <div className="task-content">
                          <h3 className="task-name">{task.name}</h3>
                          <p className="task-description">{task.description}</p>
                          {task.notes && (
                            <p className="task-notes">
                              <strong>ملاحظات:</strong> {task.notes}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="task-actions">
                        <button
                          className="action-btn edit"
                          onClick={() => handleOpenModal(task)}
                        >
                          <Edit2 />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDelete(task.id)}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingTask ? "تعديل مهمة" : "إضافة مهمة جديدة"}
              </h2>
              <button className="close-btn" onClick={handleCloseModal}>
                <X />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-group">
                <label htmlFor="name">اسم المهمة *</label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="أدخل اسم المهمة"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">الوصف *</label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="أدخل وصف المهمة"
                  rows={3}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="date">التاريخ *</label>
                <input
                  type="date"
                  id="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="notes">ملاحظات</label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="أدخل أي ملاحظات إضافية"
                  rows={2}
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="save-btn">
                  <Save className="btn-icon" />
                  <span>{editingTask ? "تحديث" : "حفظ"}</span>
                </button>
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={handleCloseModal}
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
