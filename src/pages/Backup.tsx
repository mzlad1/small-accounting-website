import React, { useState, useEffect } from "react";
import {
  Download,
  Upload,
  Clock,
  Database,
  FileText,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Calendar,
  HardDrive,
  Cloud,
  CloudUpload,
  CloudDownload,
  Trash2,
  Eye,
  RotateCcw,
} from "lucide-react";
import { backupService } from "../utils/backup";
import "./Backup.css";

interface BackupStats {
  [collectionName: string]: number;
}

interface BackupHistory {
  filename: string;
  date: string;
  type: "manual" | "automated";
}

interface CloudBackup {
  id: string;
  name: string;
  size: number;
  uploadDate: string;
  downloadUrl: string;
  metadata: {
    totalDocuments: number;
    version: string;
    description?: string;
  };
}

const Backup: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupStats, setBackupStats] = useState<BackupStats | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistory[]>([]);
  const [cloudBackups, setCloudBackups] = useState<CloudBackup[]>([]);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState("");
  const [activeTab, setActiveTab] = useState<"local" | "cloud">("cloud");
  const [selectedBackup, setSelectedBackup] = useState<CloudBackup | null>(
    null
  );
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(() => {
    return localStorage.getItem("autoBackupEnabled") === "true";
  });
  const [autoBackupFrequency, setAutoBackupFrequency] = useState(() => {
    return localStorage.getItem("autoBackupFrequency") || "daily";
  });
  const [nextAutoBackup, setNextAutoBackup] = useState<string | null>(() => {
    return localStorage.getItem("nextAutoBackup");
  });

  useEffect(() => {
    loadBackupStats();
    loadBackupHistory();
    loadCloudBackups(); // Load cloud backups initially to get accurate count
  }, []);

  // Load cloud backups when switching to cloud tab
  useEffect(() => {
    if (activeTab === "cloud") {
      loadCloudBackups();
    }
  }, [activeTab]);

  // Auto-backup functionality
  useEffect(() => {
    if (autoBackupEnabled) {
      checkAndScheduleAutoBackup();
    }
  }, [autoBackupEnabled, autoBackupFrequency]);

  const checkAndScheduleAutoBackup = () => {
    const now = new Date();
    const lastAutoBackup = localStorage.getItem("lastAutoBackup");

    if (lastAutoBackup) {
      const lastBackupDate = new Date(lastAutoBackup);
      const timeDiff = now.getTime() - lastBackupDate.getTime();
      const daysDiff = timeDiff / (1000 * 3600 * 24);

      // Check if it's time for auto backup
      const shouldBackup =
        (autoBackupFrequency === "daily" && daysDiff >= 1) ||
        (autoBackupFrequency === "weekly" && daysDiff >= 7);

      if (shouldBackup) {
        performAutoBackup();
      }
    } else {
      // First time setup - schedule for next period
      scheduleNextAutoBackup();
    }
  };

  const performAutoBackup = async () => {
    try {
      console.log("🔄 Performing automatic backup...");
      await backupService.saveBackupToCloud();

      // Update last backup time
      const now = new Date().toISOString();
      localStorage.setItem("lastAutoBackup", now);

      // Schedule next backup
      scheduleNextAutoBackup();

      // Reload cloud backups to show the new one
      loadCloudBackups();

      console.log("✅ Automatic backup completed successfully");
    } catch (error) {
      console.error("❌ Automatic backup failed:", error);
    }
  };

  const scheduleNextAutoBackup = () => {
    const now = new Date();
    const next = new Date(now);

    if (autoBackupFrequency === "daily") {
      next.setDate(next.getDate() + 1);
    } else if (autoBackupFrequency === "weekly") {
      next.setDate(next.getDate() + 7);
    }

    const nextBackupTime = next.toISOString();
    localStorage.setItem("nextAutoBackup", nextBackupTime);
    setNextAutoBackup(nextBackupTime);
  };

  // Update last backup date when either local or cloud backups change
  useEffect(() => {
    updateLastBackupDate();
  }, [backupHistory, cloudBackups]);

  const updateLastBackupDate = () => {
    const localDates = backupHistory.map((b) => new Date(b.date));
    const cloudDates = cloudBackups.map((b) => new Date(b.uploadDate));
    const allDates = [...localDates, ...cloudDates];

    if (allDates.length > 0) {
      const mostRecent = new Date(
        Math.max(...allDates.map((d) => d.getTime()))
      );
      setLastBackupDate(mostRecent.toISOString());
    } else {
      setLastBackupDate(null);
    }
  };

  const loadBackupStats = async () => {
    try {
      const stats = await backupService.getBackupStats();
      setBackupStats(stats);
    } catch (error) {
      console.error("Failed to load backup stats:", error);
    }
  };

  const loadBackupHistory = () => {
    const history = JSON.parse(localStorage.getItem("backupHistory") || "[]");
    setBackupHistory(history);
  };

  const handleManualBackup = async () => {
    setIsExporting(true);
    setExportProgress("بدء النسخ الاحتياطي...");

    try {
      setExportProgress("تصدير البيانات من Firebase...");
      await backupService.downloadBackup();

      setExportProgress("تم إنشاء النسخة الاحتياطية بنجاح!");

      // Update history
      loadBackupHistory();

      setTimeout(() => {
        setExportProgress("");
        setIsExporting(false);
      }, 2000);
    } catch (error) {
      console.error("Backup failed:", error);
      setExportProgress("فشل في إنشاء النسخة الاحتياطية");
      setTimeout(() => {
        setExportProgress("");
        setIsExporting(false);
      }, 3000);
    }
  };

  // ========== CLOUD BACKUP FUNCTIONS ==========

  const loadCloudBackups = async () => {
    try {
      const backups = await backupService.listCloudBackups();
      setCloudBackups(backups);
    } catch (error) {
      console.error("Failed to load cloud backups:", error);
    }
  };

  const handleCloudBackup = async () => {
    setIsExporting(true);
    setExportProgress("بدء النسخ الاحتياطي السحابي...");

    try {
      setExportProgress("تصدير البيانات وحفظها في السحابة...");
      await backupService.saveBackupToCloud();

      setExportProgress("تم حفظ النسخة الاحتياطية في السحابة بنجاح!");

      // Reload cloud backups
      await loadCloudBackups();

      setTimeout(() => {
        setExportProgress("");
        setIsExporting(false);
      }, 2000);
    } catch (error) {
      console.error("Cloud backup failed:", error);
      setExportProgress("فشل في حفظ النسخة الاحتياطية السحابية");
      setTimeout(() => {
        setExportProgress("");
        setIsExporting(false);
      }, 3000);
    }
  };

  const handleAutoBackupToggle = (enabled: boolean) => {
    setAutoBackupEnabled(enabled);
    localStorage.setItem("autoBackupEnabled", enabled.toString());

    if (enabled) {
      scheduleNextAutoBackup();
    } else {
      localStorage.removeItem("nextAutoBackup");
      setNextAutoBackup(null);
    }
  };

  const handleFrequencyChange = (frequency: string) => {
    setAutoBackupFrequency(frequency);
    localStorage.setItem("autoBackupFrequency", frequency);

    if (autoBackupEnabled) {
      scheduleNextAutoBackup();
    }
  };

  const handleRestoreBackup = async (backup: CloudBackup) => {
    setSelectedBackup(backup);
    setShowRestoreModal(true);
  };

  const confirmRestore = async (deleteExisting: boolean = false) => {
    if (!selectedBackup) return;

    setIsRestoring(true);
    setShowRestoreModal(false);

    try {
      await backupService.restoreFromCloudBackup(selectedBackup.name, {
        deleteExistingData: deleteExisting,
      });

      alert("تم استعادة البيانات بنجاح!");

      // Reload stats
      await loadBackupStats();
    } catch (error) {
      console.error("Restore failed:", error);
      alert("فشل في استعادة البيانات");
    } finally {
      setIsRestoring(false);
      setSelectedBackup(null);
    }
  };

  const handleDeleteBackup = async (backup: CloudBackup) => {
    if (confirm(`هل أنت متأكد من حذف النسخة الاحتياطية: ${backup.name}؟`)) {
      try {
        await backupService.deleteCloudBackup(backup.name);
        await loadCloudBackups();
        alert("تم حذف النسخة الاحتياطية بنجاح");
      } catch (error) {
        console.error("Delete failed:", error);
        alert("فشل في حذف النسخة الاحتياطية");
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTotalDocuments = () => {
    if (!backupStats) return 0;
    return Object.values(backupStats).reduce((sum, count) => sum + count, 0);
  };

  return (
    <div className="backup-container">
      <div className="backup-header">
        <div className="header-content">
          <div className="header-icon">
            <HardDrive size={32} />
          </div>
          <div>
            <h1>النسخ الاحتياطي</h1>
            <p>إدارة وإنشاء النسخ الاحتياطية لبيانات النظام</p>
          </div>
        </div>
      </div>

      <div className="backup-content">
        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <Database size={24} />
            </div>
            <div className="stat-content">
              <h3>{getTotalDocuments()}</h3>
              <p>إجمالي السجلات</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <FileText size={24} />
            </div>
            <div className="stat-content">
              <h3>{backupStats ? Object.keys(backupStats).length : 0}</h3>
              <p>المجموعات</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <Clock size={24} />
            </div>
            <div className="stat-content">
              <h3>{backupHistory.length + cloudBackups.length}</h3>
              <p>النسخ السابقة</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <Calendar size={24} />
            </div>
            <div className="stat-content">
              <h3>{lastBackupDate ? "مُحدث" : "لا يوجد"}</h3>
              <p>آخر نسخة احتياطية</p>
              {lastBackupDate && <small>{formatDate(lastBackupDate)}</small>}
            </div>
          </div>
        </div>

        {/* Collection Details */}
        {backupStats && (
          <div className="collections-overview">
            <h2>تفاصيل المجموعات</h2>
            <div className="collections-grid">
              {Object.entries(backupStats).map(([collection, count]) => (
                <div key={collection} className="collection-item">
                  <div className="collection-info">
                    <span className="collection-name">
                      {collection === "customers"
                        ? "العملاء"
                        : collection === "suppliers"
                        ? "الموردين"
                        : collection === "orders"
                        ? "الطلبات"
                        : collection === "orderItems"
                        ? "عناصر الطلبات"
                        : collection === "payments"
                        ? "المدفوعات"
                        : collection === "supplierPayments"
                        ? "مدفوعات الموردين"
                        : collection === "customerChecks"
                        ? "شيكات العملاء"
                        : collection === "personalChecks"
                        ? "الشيكات الشخصية"
                        : collection}
                    </span>
                    <span className="collection-count">{count} سجل</span>
                  </div>
                  <div className="collection-progress">
                    <div
                      className="progress-bar"
                      style={{
                        width: `${(count / getTotalDocuments()) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Backup Type Tabs */}
        <div className="backup-tabs">
          <div className="tabs-header">
            <button
              className={`tab-btn ${activeTab === "cloud" ? "active" : ""}`}
              onClick={() => setActiveTab("cloud")}
            >
              <Cloud size={20} />
              النسخ السحابية
            </button>
            <button
              className={`tab-btn ${activeTab === "local" ? "active" : ""}`}
              onClick={() => setActiveTab("local")}
            >
              <HardDrive size={20} />
              النسخ المحلية
            </button>
          </div>

          <div className="tab-content">
            {activeTab === "cloud" ? (
              <div className="cloud-backup-section">
                {/* Cloud Backup Actions */}
                <div className="cloud-actions">
                  <div className="action-card">
                    <div className="action-header">
                      <CloudUpload size={24} />
                      <div>
                        <h3>نسخة احتياطية سحابية</h3>
                        <p>حفظ النسخة الاحتياطية في Firebase Storage</p>
                      </div>
                    </div>

                    {exportProgress && (
                      <div className="export-progress">
                        <div className="progress-indicator">
                          {isExporting ? (
                            <RefreshCw size={16} className="spinning" />
                          ) : (
                            <CheckCircle size={16} className="success" />
                          )}
                        </div>
                        <span>{exportProgress}</span>
                      </div>
                    )}

                    <button
                      className="backup-btn primary"
                      onClick={handleCloudBackup}
                      disabled={isExporting}
                    >
                      {isExporting ? "جاري الحفظ..." : "حفظ في السحابة"}
                    </button>
                  </div>

                  {/* Auto Backup Settings */}
                  <div className="action-card">
                    <div className="action-header">
                      <Clock size={24} />
                      <div>
                        <h3>النسخ الاحتياطي التلقائي</h3>
                        <p>جدولة النسخ الاحتياطية التلقائية</p>
                      </div>
                    </div>

                    <div className="auto-backup-settings">
                      <div className="setting-row">
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={autoBackupEnabled}
                            onChange={(e) =>
                              handleAutoBackupToggle(e.target.checked)
                            }
                          />
                          <span className="slider"></span>
                        </label>
                        <span>تفعيل النسخ الاحتياطي التلقائي</span>
                      </div>

                      {autoBackupEnabled && (
                        <>
                          <div className="setting-row">
                            <label>التكرار:</label>
                            <select
                              value={autoBackupFrequency}
                              onChange={(e) =>
                                handleFrequencyChange(e.target.value)
                              }
                              className="frequency-select"
                            >
                              <option value="daily">يومياً</option>
                              <option value="weekly">أسبوعياً</option>
                            </select>
                          </div>

                          {nextAutoBackup && (
                            <div className="setting-row">
                              <span className="next-backup-info">
                                النسخة التالية: {formatDate(nextAutoBackup)}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cloud Backups List */}
                <div className="cloud-backups-list">
                  <div className="list-header">
                    <h3>النسخ السحابية المحفوظة</h3>
                    <button
                      className="refresh-btn"
                      onClick={loadCloudBackups}
                      disabled={isExporting}
                    >
                      <RefreshCw size={16} />
                      تحديث
                    </button>
                  </div>

                  {cloudBackups.length === 0 ? (
                    <div className="empty-state">
                      <Cloud size={48} />
                      <h4>لا توجد نسخ احتياطية سحابية</h4>
                      <p>ابدأ بإنشاء أول نسخة احتياطية سحابية</p>
                    </div>
                  ) : (
                    <div className="backups-grid">
                      {cloudBackups.map((backup) => (
                        <div key={backup.id} className="backup-card">
                          <div className="backup-header">
                            <div className="backup-icon">
                              <Database size={20} />
                            </div>
                            <div className="backup-info">
                              <h4>{backup.name}</h4>
                              <p>{formatDate(backup.uploadDate)}</p>
                              <span className="backup-size">
                                {formatFileSize(backup.size)}
                              </span>
                            </div>
                          </div>

                          <div className="backup-actions">
                            <button
                              className="action-btn restore"
                              onClick={() => handleRestoreBackup(backup)}
                              disabled={isRestoring}
                              title="استعادة البيانات"
                            >
                              <RotateCcw size={16} />
                              استعادة
                            </button>
                            <button
                              className="action-btn download"
                              onClick={() =>
                                window.open(backup.downloadUrl, "_blank")
                              }
                              title="تحميل"
                            >
                              <Download size={16} />
                              تحميل
                            </button>
                            <button
                              className="action-btn delete"
                              onClick={() => handleDeleteBackup(backup)}
                              title="حذف"
                            >
                              <Trash2 size={16} />
                              حذف
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Local Backup Section */
              <div className="local-backup-section">
                {/* Actions */}
                <div className="backup-actions">
                  <div className="action-card">
                    <div className="action-header">
                      <Download size={24} />
                      <div>
                        <h3>نسخة احتياطية محلية</h3>
                        <p>تحميل النسخة الاحتياطية كملف JSON</p>
                      </div>
                    </div>

                    {exportProgress && activeTab === "local" && (
                      <div className="export-progress">
                        <div className="progress-indicator">
                          {isExporting ? (
                            <RefreshCw size={16} className="spinning" />
                          ) : (
                            <CheckCircle size={16} className="success" />
                          )}
                        </div>
                        <span>{exportProgress}</span>
                      </div>
                    )}

                    <button
                      className="backup-btn primary"
                      onClick={handleManualBackup}
                      disabled={isExporting}
                    >
                      {isExporting ? "جاري التحميل..." : "تحميل النسخة"}
                    </button>
                  </div>
                </div>

                {/* Backup History */}
                {backupHistory.length > 0 && (
                  <div className="backup-history">
                    <h2>تاريخ النسخ المحلية</h2>
                    <div className="history-list">
                      {backupHistory
                        .slice()
                        .reverse()
                        .map((backup, index) => (
                          <div key={index} className="history-item">
                            <div className="history-icon">
                              {backup.type === "automated" ? (
                                <Clock size={16} />
                              ) : (
                                <Download size={16} />
                              )}
                            </div>
                            <div className="history-content">
                              <h4>{backup.filename}</h4>
                              <p>{formatDate(backup.date)}</p>
                              <span className={`backup-type ${backup.type}`}>
                                {backup.type === "automated"
                                  ? "تلقائي"
                                  : "يدوي"}
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Restore Modal */}
        {showRestoreModal && selectedBackup && (
          <div className="modal-overlay">
            <div className="restore-modal">
              <div className="modal-header">
                <h3>استعادة النسخة الاحتياطية</h3>
                <button
                  className="close-btn"
                  onClick={() => setShowRestoreModal(false)}
                >
                  ×
                </button>
              </div>

              <div className="modal-content">
                <div className="backup-info">
                  <h4>{selectedBackup.name}</h4>
                  <p>تاريخ الإنشاء: {formatDate(selectedBackup.uploadDate)}</p>
                </div>

                <div className="warning-message">
                  <AlertCircle size={20} />
                  <p>
                    تحذير: عملية الاستعادة ستقوم بإضافة البيانات إلى البيانات
                    الموجودة. إذا كنت تريد استبدال البيانات الحالية، اختر "حذف
                    البيانات الموجودة".
                  </p>
                </div>

                <div className="modal-actions">
                  <button
                    className="backup-btn secondary"
                    onClick={() => confirmRestore(false)}
                    disabled={isRestoring}
                  >
                    {isRestoring
                      ? "جاري الاستعادة..."
                      : "إضافة للبيانات الموجودة"}
                  </button>
                  <button
                    className="backup-btn danger"
                    onClick={() => confirmRestore(true)}
                    disabled={isRestoring}
                  >
                    {isRestoring
                      ? "جاري الاستعادة..."
                      : "حذف البيانات واستعادة"}
                  </button>
                  <button
                    className="backup-btn cancel"
                    onClick={() => setShowRestoreModal(false)}
                    disabled={isRestoring}
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions - MOVED TO TABS */}
        {false && (
          <div className="backup-actions">
            <div className="action-card">
              <div className="action-header">
                <Download size={24} />
                <div>
                  <h3>نسخة احتياطية يدوية</h3>
                  <p>إنشاء نسخة احتياطية فورية لجميع البيانات</p>
                </div>
              </div>

              {exportProgress && (
                <div className="export-progress">
                  <div className="progress-indicator">
                    {isExporting ? (
                      <RefreshCw size={16} className="spinning" />
                    ) : (
                      <CheckCircle size={16} className="success" />
                    )}
                  </div>
                  <span>{exportProgress}</span>
                </div>
              )}

              <button
                className="backup-btn primary"
                onClick={handleManualBackup}
                disabled={isExporting}
              >
                {isExporting ? "جاري الإنشاء..." : "إنشاء نسخة احتياطية"}
              </button>
            </div>

            <div className="action-card">
              <div className="action-header">
                <Upload size={24} />
                <div>
                  <h3>استعادة البيانات</h3>
                  <p>استعادة البيانات من نسخة احتياطية سابقة</p>
                </div>
              </div>

              <button
                className="backup-btn secondary"
                disabled
                title="ستتوفر قريباً"
              >
                استعادة البيانات (قريباً)
              </button>
            </div>
          </div>
        )}

        {/* Tips */}
        <div className="backup-tips">
          <div className="tip-item">
            <AlertCircle size={16} />
            <span>يُنصح بإنشاء نسخة احتياطية يومياً للحفاظ على البيانات</span>
          </div>
          <div className="tip-item">
            <CheckCircle size={16} />
            <span>
              النسخ الاحتياطية تشمل جميع البيانات: العملاء، الموردين، الطلبات،
              والمدفوعات
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Backup;
