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
  Trash2,
  RotateCcw,
  Zap,
  Settings,
} from "lucide-react";
import {
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../config/firebase";
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

interface BackupSettings {
  autoBackupEnabled: boolean;
  frequency: string;
  lastAutoBackup?: string;
  lastBackupDocuments?: number;
}

const Backup: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [backupStats, setBackupStats] = useState<BackupStats | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistory[]>([]);
  const [cloudBackups, setCloudBackups] = useState<CloudBackup[]>([]);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState("");
  const [activeTab, setActiveTab] = useState<"local" | "cloud">("cloud");
  const [selectedBackup, setSelectedBackup] = useState<CloudBackup | null>(null);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6);

  // Cloud Functions auto backup settings
  const [backupSettings, setBackupSettings] = useState<BackupSettings>({
    autoBackupEnabled: false,
    frequency: "daily",
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [cloudBackupLoading, setCloudBackupLoading] = useState(false);

  useEffect(() => {
    loadBackupStats();
    loadBackupHistory();
    loadCloudBackups();
    loadBackupSettings();
  }, []);

  useEffect(() => {
    if (activeTab === "cloud") {
      loadCloudBackups();
    }
  }, [activeTab]);

  useEffect(() => {
    updateLastBackupDate();
  }, [backupHistory, cloudBackups]);

  // ========== LOAD SETTINGS FROM FIRESTORE ==========

  const loadBackupSettings = async () => {
    try {
      const settingsDoc = await getDoc(doc(db, "settings", "backup"));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data() as BackupSettings;
        setBackupSettings({
          autoBackupEnabled: data.autoBackupEnabled ?? false,
          frequency: data.frequency || "daily",
          lastAutoBackup: data.lastAutoBackup,
          lastBackupDocuments: data.lastBackupDocuments,
        });
      }
    } catch (error) {
      console.error("Failed to load backup settings:", error);
    }
  };

  const handleAutoBackupToggle = async (enabled: boolean) => {
    setSettingsLoading(true);
    try {
      const updateSettings = httpsCallable(functions, "updateBackupSettings");
      await updateSettings({
        autoBackupEnabled: enabled,
        frequency: backupSettings.frequency,
      });

      setBackupSettings((prev) => ({ ...prev, autoBackupEnabled: enabled }));
      alert(
        enabled
          ? "تم تفعيل النسخ الاحتياطي التلقائي عبر Cloud Functions"
          : "تم إيقاف النسخ الاحتياطي التلقائي"
      );
    } catch (error: any) {
      console.error("Failed to update auto backup:", error);
      alert(error.message || "فشل في تحديث إعدادات النسخ الاحتياطي التلقائي");
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleFrequencyChange = async (frequency: string) => {
    setSettingsLoading(true);
    try {
      const updateSettings = httpsCallable(functions, "updateBackupSettings");
      await updateSettings({
        autoBackupEnabled: backupSettings.autoBackupEnabled,
        frequency,
      });

      setBackupSettings((prev) => ({ ...prev, frequency }));
    } catch (error: any) {
      console.error("Failed to update frequency:", error);
      alert(error.message || "فشل في تحديث التكرار");
    } finally {
      setSettingsLoading(false);
    }
  };

  // ========== CLOUD FUNCTION BACKUP ==========

  const handleCloudFunctionBackup = async () => {
    setCloudBackupLoading(true);
    setExportProgress("جاري إنشاء نسخة احتياطية عبر Cloud Functions...");

    try {
      const triggerBackup = httpsCallable(functions, "triggerCloudBackup");
      const result = await triggerBackup();
      const data = result.data as any;

      setExportProgress(
        `تم إنشاء النسخة الاحتياطية بنجاح! (${data.totalDocuments} سجل)`
      );

      // Reload cloud backups
      await loadCloudBackups();
      await loadBackupSettings();

      setTimeout(() => {
        setExportProgress("");
        setCloudBackupLoading(false);
      }, 2000);
    } catch (error: any) {
      console.error("Cloud function backup failed:", error);
      setExportProgress("فشل في إنشاء النسخة الاحتياطية");
      setTimeout(() => {
        setExportProgress("");
        setCloudBackupLoading(false);
      }, 3000);
    }
  };

  // ========== EXISTING BACKUP FUNCTIONS ==========

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

  const loadCloudBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const backups = await backupService.listCloudBackups();
      setCloudBackups(backups);
    } catch (error) {
      console.error("Failed to load cloud backups:", error);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleCloudBackup = async () => {
    setIsExporting(true);
    setExportProgress("بدء النسخ الاحتياطي السحابي...");

    try {
      setExportProgress("تصدير البيانات وحفظها في السحابة...");
      await backupService.saveBackupToCloud();
      setExportProgress("تم حفظ النسخة الاحتياطية في السحابة بنجاح!");
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

  // Pagination
  const totalPages = Math.ceil(cloudBackups.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentBackups = cloudBackups.slice(indexOfFirstItem, indexOfLastItem);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
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
                        : collection === "apartments"
                        ? "الشقق"
                        : collection === "lands"
                        ? "الأراضي"
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
                  {/* Cloud Functions Backup */}
                  <div className="action-card functions-card">
                    <div className="action-header">
                      <Zap size={24} />
                      <div>
                        <h3>نسخة احتياطية عبر Cloud Functions</h3>
                        <p>
                          إنشاء نسخة احتياطية باستخدام Firebase Cloud Functions
                          (أسرع وأكثر موثوقية)
                        </p>
                      </div>
                    </div>

                    {exportProgress && cloudBackupLoading && (
                      <div className="export-progress">
                        <div className="progress-indicator">
                          <RefreshCw size={16} className="spinning" />
                        </div>
                        <span>{exportProgress}</span>
                      </div>
                    )}

                    <button
                      className="backup-btn primary functions-btn"
                      onClick={handleCloudFunctionBackup}
                      disabled={cloudBackupLoading || isExporting}
                    >
                      <Zap size={18} />
                      {cloudBackupLoading
                        ? "جاري الإنشاء..."
                        : "نسخ احتياطي عبر Functions"}
                    </button>
                  </div>

                  {/* Regular Cloud Backup */}
                  <div className="action-card">
                    <div className="action-header">
                      <CloudUpload size={24} />
                      <div>
                        <h3>نسخة احتياطية سحابية</h3>
                        <p>حفظ النسخة الاحتياطية في Firebase Storage</p>
                      </div>
                    </div>

                    {exportProgress && !cloudBackupLoading && (
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
                      disabled={isExporting || cloudBackupLoading}
                    >
                      {isExporting ? "جاري الحفظ..." : "حفظ في السحابة"}
                    </button>
                  </div>

                  {/* Auto Backup Settings via Cloud Functions */}
                  <div className="action-card settings-card">
                    <div className="action-header">
                      <Settings size={24} />
                      <div>
                        <h3>النسخ الاحتياطي التلقائي</h3>
                        <p>
                          جدولة تلقائية عبر Firebase Cloud Functions (يعمل في
                          الخلفية حتى بدون فتح التطبيق)
                        </p>
                      </div>
                    </div>

                    <div className="auto-backup-settings">
                      <div className="setting-row">
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={backupSettings.autoBackupEnabled}
                            onChange={(e) =>
                              handleAutoBackupToggle(e.target.checked)
                            }
                            disabled={settingsLoading}
                          />
                          <span className="slider"></span>
                        </label>
                        <span>تفعيل النسخ الاحتياطي التلقائي</span>
                        {settingsLoading && (
                          <RefreshCw size={14} className="spinning" />
                        )}
                      </div>

                      {backupSettings.autoBackupEnabled && (
                        <>
                          <div className="setting-row">
                            <label>التكرار:</label>
                            <select
                              value={backupSettings.frequency}
                              onChange={(e) =>
                                handleFrequencyChange(e.target.value)
                              }
                              className="frequency-select"
                              disabled={settingsLoading}
                            >
                              <option value="daily">يومياً</option>
                              <option value="weekly">أسبوعياً</option>
                            </select>
                          </div>

                          {backupSettings.lastAutoBackup && (
                            <div className="setting-row last-backup-info">
                              <CheckCircle size={14} className="success-icon" />
                              <span>
                                آخر نسخة تلقائية:{" "}
                                {formatDate(backupSettings.lastAutoBackup)}
                              </span>
                              {backupSettings.lastBackupDocuments && (
                                <span className="doc-count">
                                  ({backupSettings.lastBackupDocuments} سجل)
                                </span>
                              )}
                            </div>
                          )}

                          <div className="functions-info">
                            <AlertCircle size={14} />
                            <span>
                              يتم تنفيذ النسخ الاحتياطي عبر Cloud Functions -
                              يعمل تلقائياً في السيرفر
                            </span>
                          </div>
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
                      disabled={isExporting || isLoadingBackups}
                    >
                      <RefreshCw
                        size={16}
                        className={isLoadingBackups ? "spinning" : ""}
                      />
                      {isLoadingBackups ? "جاري التحميل..." : "تحديث"}
                    </button>
                  </div>

                  {isLoadingBackups ? (
                    <div className="loading-state">
                      <RefreshCw size={48} className="spinning" />
                      <h4>جاري تحميل النسخ الاحتياطية...</h4>
                      <p>الرجاء الانتظار</p>
                    </div>
                  ) : cloudBackups.length === 0 ? (
                    <div className="empty-state">
                      <Cloud size={48} />
                      <h4>لا توجد نسخ احتياطية سحابية</h4>
                      <p>ابدأ بإنشاء أول نسخة احتياطية سحابية</p>
                    </div>
                  ) : (
                    <>
                      <div className="backups-grid">
                        {currentBackups.map((backup) => (
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

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="backup-pagination">
                          <button
                            className="pagination-btn"
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                          >
                            السابق
                          </button>

                          <div className="pagination-numbers">
                            {Array.from(
                              { length: totalPages },
                              (_, i) => i + 1
                            ).map((pageNumber) => (
                              <button
                                key={pageNumber}
                                className={`pagination-number ${
                                  currentPage === pageNumber ? "active" : ""
                                }`}
                                onClick={() => handlePageChange(pageNumber)}
                              >
                                {pageNumber}
                              </button>
                            ))}
                          </div>

                          <button
                            className="pagination-btn"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                          >
                            التالي
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              /* Local Backup Section */
              <div className="local-backup-section">
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

        {/* Tips */}
        <div className="backup-tips">
          <div className="tip-item">
            <Zap size={16} />
            <span>
              النسخ التلقائي عبر Cloud Functions يعمل في السيرفر ولا يحتاج لفتح
              التطبيق
            </span>
          </div>
          <div className="tip-item">
            <AlertCircle size={16} />
            <span>يُنصح بإنشاء نسخة احتياطية يومياً للحفاظ على البيانات</span>
          </div>
          <div className="tip-item success">
            <CheckCircle size={16} />
            <span>
              النسخ الاحتياطية تشمل جميع البيانات: العملاء، الموردين، الطلبات،
              المدفوعات، الشقق، والأراضي
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Backup;
