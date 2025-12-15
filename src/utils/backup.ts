import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  writeBatch,
  deleteDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  listAll,
  deleteObject,
  getBytes,
  getMetadata,
} from "firebase/storage";
import { db, storage } from "../config/firebase";

interface BackupData {
  collections: Record<string, any[]>;
  metadata: {
    exportDate: string;
    version: string;
    totalDocuments: number;
    backupId: string;
    description?: string;
  };
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

const COLLECTIONS = [
  "customers",
  "suppliers",
  "orders",
  "orderItems",
  "payments",
  "supplierPayments",
  "customerChecks",
  "personalChecks",
  "apartments",
  "lands",
];

export class FirebaseBackupService {
  /**
   * Export all Firestore collections to a single JSON object
   */
  async exportFirestoreData(description?: string): Promise<BackupData> {
    console.log("🏋️ Starting Firestore export...");

    const backupId = `backup_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const backupData: BackupData = {
      collections: {},
      metadata: {
        exportDate: new Date().toISOString(),
        version: "1.0.0",
        totalDocuments: 0,
        backupId,
        description,
      },
    };

    let totalDocs = 0;

    try {
      for (const collectionName of COLLECTIONS) {
        console.log(`📄 Exporting collection: ${collectionName}`);

        const collectionRef = collection(db, collectionName);
        const q = query(collectionRef, orderBy("__name__"));
        const querySnapshot = await getDocs(q);

        const documents: any[] = [];
        querySnapshot.forEach((doc) => {
          documents.push({
            id: doc.id,
            ...doc.data(),
          });
        });

        backupData.collections[collectionName] = documents;
        totalDocs += documents.length;

        console.log(
          `✅ Exported ${documents.length} documents from ${collectionName}`
        );
      }

      backupData.metadata.totalDocuments = totalDocs;
      console.log(`🎉 Export completed! Total documents: ${totalDocs}`);

      return backupData;
    } catch (error) {
      console.error("❌ Export failed:", error);
      throw error;
    }
  }

  /**
   * Download backup data as JSON file
   */
  async downloadBackup(filename?: string): Promise<void> {
    try {
      const backupData = await this.exportFirestoreData();

      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        filename ||
        `firestore-backup-${new Date().toISOString().split("T")[0]}.json`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);

      console.log("💾 Backup file downloaded successfully!");
    } catch (error) {
      console.error("❌ Download failed:", error);
      throw error;
    }
  }

  /**
   * Get backup statistics
   */
  async getBackupStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};

    try {
      for (const collectionName of COLLECTIONS) {
        const collectionRef = collection(db, collectionName);
        const querySnapshot = await getDocs(collectionRef);
        stats[collectionName] = querySnapshot.size;
      }

      return stats;
    } catch (error) {
      console.error("❌ Failed to get backup stats:", error);
      throw error;
    }
  }

  /**
   * Validate backup data integrity
   */
  validateBackupData(backupData: BackupData): boolean {
    try {
      // Check if all required collections exist
      for (const collectionName of COLLECTIONS) {
        if (!backupData.collections[collectionName]) {
          console.warn(`⚠️ Missing collection: ${collectionName}`);
          return false;
        }
      }

      // Check metadata
      if (!backupData.metadata || !backupData.metadata.exportDate) {
        console.warn("⚠️ Invalid metadata");
        return false;
      }

      // Verify document count matches metadata
      const actualTotal = Object.values(backupData.collections).reduce(
        (sum, docs) => sum + docs.length,
        0
      );

      if (actualTotal !== backupData.metadata.totalDocuments) {
        console.warn("⚠️ Document count mismatch");
        return false;
      }

      console.log("✅ Backup data validation passed");
      return true;
    } catch (error) {
      console.error("❌ Backup validation failed:", error);
      return false;
    }
  }

  /**
   * Create automated backup (can be called from scheduled tasks)
   */
  async createAutomatedBackup(): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `auto-backup-${timestamp}.json`;

      await this.downloadBackup(filename);

      // Store backup info in localStorage for tracking
      const backupHistory = JSON.parse(
        localStorage.getItem("backupHistory") || "[]"
      );
      backupHistory.push({
        filename,
        date: new Date().toISOString(),
        type: "automated",
      });

      // Keep only last 10 backup records
      if (backupHistory.length > 10) {
        backupHistory.splice(0, backupHistory.length - 10);
      }

      localStorage.setItem("backupHistory", JSON.stringify(backupHistory));

      return filename;
    } catch (error) {
      console.error("❌ Automated backup failed:", error);
      throw error;
    }
  }

  // ========== CLOUD BACKUP FUNCTIONALITY ==========

  /**
   * Save backup to Firebase Storage
   */
  async saveBackupToCloud(description?: string): Promise<CloudBackup> {
    console.log("☁️ Starting cloud backup...");

    try {
      // Export data
      const backupData = await this.exportFirestoreData(description);

      // Create filename
      const timestamp = new Date().toISOString().split("T")[0];
      const filename = `backup-${timestamp}-${backupData.metadata.backupId}.json`;

      // Convert to blob
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });

      // Upload to Firebase Storage
      const storageRef = ref(storage, `backups/${filename}`);
      const snapshot = await uploadBytes(storageRef, blob);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      const cloudBackup: CloudBackup = {
        id: backupData.metadata.backupId,
        name: filename,
        size: blob.size,
        uploadDate: backupData.metadata.exportDate,
        downloadUrl,
        metadata: {
          totalDocuments: backupData.metadata.totalDocuments,
          version: backupData.metadata.version,
          description: description,
        },
      };

      console.log(`☁️ Backup uploaded successfully: ${filename}`);
      console.log(`📊 Size: ${(blob.size / 1024).toFixed(2)} KB`);

      return cloudBackup;
    } catch (error) {
      console.error("❌ Cloud backup failed:", error);
      throw error;
    }
  }

  /**
   * List all cloud backups
   */
  async listCloudBackups(): Promise<CloudBackup[]> {
    console.log("📋 Fetching cloud backups...");

    try {
      const backupsRef = ref(storage, "backups/");
      const result = await listAll(backupsRef);

      const backups: CloudBackup[] = [];

      for (const itemRef of result.items) {
        try {
          const downloadUrl = await getDownloadURL(itemRef);

          // Extract metadata from filename or download a small portion
          // For now, we'll use filename parsing
          const nameParts = itemRef.name.match(
            /backup-(\d{4}-\d{2}-\d{2})-(.+)\.json/
          );

          if (nameParts) {
            const [, date, backupId] = nameParts;

            // Get file metadata
            const metadata = await getMetadata(itemRef);

            backups.push({
              id: backupId,
              name: itemRef.name,
              size: metadata.size || 0,
              uploadDate: metadata.timeCreated || date,
              downloadUrl,
              metadata: {
                totalDocuments: 0, // We'll need to download to get this
                version: "1.0.0",
                description: "Cloud backup",
              },
            });
          }
        } catch (error) {
          console.warn(`⚠️ Failed to process backup: ${itemRef.name}`, error);
        }
      }

      // Sort by upload date (newest first)
      backups.sort(
        (a, b) =>
          new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
      );

      console.log(`📋 Found ${backups.length} cloud backups`);
      return backups;
    } catch (error) {
      console.error("❌ Failed to list cloud backups:", error);
      throw error;
    }
  }

  /**
   * Delete a cloud backup
   */
  async deleteCloudBackup(backupName: string): Promise<void> {
    console.log(`🗑️ Deleting cloud backup: ${backupName}`);

    try {
      const backupRef = ref(storage, `backups/${backupName}`);
      await deleteObject(backupRef);

      console.log(`✅ Backup deleted successfully: ${backupName}`);
    } catch (error) {
      console.error("❌ Failed to delete backup:", error);
      throw error;
    }
  }

  /**
   * Download and parse cloud backup
   */
  async downloadCloudBackup(backupName: string): Promise<BackupData> {
    console.log(`⬇️ Downloading cloud backup: ${backupName}`);

    try {
      const backupRef = ref(storage, `backups/${backupName}`);
      const bytes = await getBytes(backupRef);
      const jsonString = new TextDecoder().decode(bytes);
      const backupData: BackupData = JSON.parse(jsonString);

      console.log(`✅ Backup downloaded successfully`);
      console.log(`📊 Total documents: ${backupData.metadata.totalDocuments}`);

      return backupData;
    } catch (error) {
      console.error("❌ Failed to download backup:", error);
      throw error;
    }
  }

  /**
   * Restore data from cloud backup
   */
  async restoreFromCloudBackup(
    backupName: string,
    options: {
      deleteExistingData?: boolean;
      collectionsToRestore?: string[];
    } = {}
  ): Promise<void> {
    console.log(`🔄 Starting restore from backup: ${backupName}`);

    const { deleteExistingData = false, collectionsToRestore = COLLECTIONS } =
      options;

    try {
      // Download backup data
      const backupData = await this.downloadCloudBackup(backupName);

      // Validate backup
      if (!this.validateBackupData(backupData)) {
        throw new Error("Backup data validation failed");
      }

      // Create a batch for efficient writes
      const batch = writeBatch(db);
      let batchCount = 0;
      const maxBatchSize = 500;

      for (const collectionName of collectionsToRestore) {
        if (!backupData.collections[collectionName]) {
          console.warn(`⚠️ Collection ${collectionName} not found in backup`);
          continue;
        }

        console.log(`🔄 Restoring collection: ${collectionName}`);

        // Delete existing data if requested
        if (deleteExistingData) {
          console.log(`🗑️ Deleting existing data in ${collectionName}`);
          const existingDocs = await getDocs(collection(db, collectionName));

          for (const docSnapshot of existingDocs.docs) {
            await deleteDoc(doc(db, collectionName, docSnapshot.id));
          }
        }

        // Restore documents
        const documents = backupData.collections[collectionName];

        for (const document of documents) {
          const { id, ...data } = document;
          const docRef = doc(db, collectionName, id);
          batch.set(docRef, data);
          batchCount++;

          // Commit batch if it reaches max size
          if (batchCount >= maxBatchSize) {
            await batch.commit();
            console.log(`📝 Committed batch of ${batchCount} documents`);
            batchCount = 0;
          }
        }

        console.log(
          `✅ Restored ${documents.length} documents to ${collectionName}`
        );
      }

      // Commit remaining documents
      if (batchCount > 0) {
        await batch.commit();
        console.log(`📝 Committed final batch of ${batchCount} documents`);
      }

      console.log(`🎉 Restore completed successfully!`);
      console.log(
        `📊 Total documents restored: ${backupData.metadata.totalDocuments}`
      );
    } catch (error) {
      console.error("❌ Restore failed:", error);
      throw error;
    }
  }

  /**
   * Get detailed backup information
   */
  async getBackupDetails(backupName: string): Promise<{
    backup: CloudBackup;
    collections: Record<string, number>;
  }> {
    try {
      const backupData = await this.downloadCloudBackup(backupName);
      const backups = await this.listCloudBackups();
      const backup = backups.find((b) => b.name === backupName);

      if (!backup) {
        throw new Error("Backup not found");
      }

      const collections: Record<string, number> = {};
      Object.entries(backupData.collections).forEach(([name, docs]) => {
        collections[name] = docs.length;
      });

      // Update backup metadata with actual data
      backup.metadata.totalDocuments = backupData.metadata.totalDocuments;
      backup.metadata.description = backupData.metadata.description;

      return { backup, collections };
    } catch (error) {
      console.error("❌ Failed to get backup details:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const backupService = new FirebaseBackupService();
