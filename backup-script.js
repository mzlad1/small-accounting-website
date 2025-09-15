/**
 * Simple Node.js script to backup Firestore data
 * Usage: node backup-script.js
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

// Create require function for JSON imports
const require = createRequire(import.meta.url);

// Initialize Firebase Admin
const serviceAccount = require("./appConfig.json");

const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);

const COLLECTIONS = [
  "customers",
  "suppliers",
  "orders",
  "orderItems",
  "payments",
  "customerChecks",
  "personalChecks",
];

async function exportCollection(collectionName) {
  console.log(`📄 Exporting collection: ${collectionName}`);

  try {
    const snapshot = await db.collection(collectionName).get();
    const documents = [];

    snapshot.forEach((doc) => {
      documents.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    console.log(
      `✅ Exported ${documents.length} documents from ${collectionName}`
    );
    return documents;
  } catch (error) {
    console.error(`❌ Error exporting ${collectionName}:`, error);
    return [];
  }
}

async function exportFirestore() {
  console.log("🏋️ Starting Firestore export...");

  const backupData = {
    collections: {},
    metadata: {
      exportDate: new Date().toISOString(),
      version: "1.0.0",
      totalDocuments: 0,
    },
  };

  let totalDocs = 0;

  try {
    for (const collectionName of COLLECTIONS) {
      const documents = await exportCollection(collectionName);
      backupData.collections[collectionName] = documents;
      totalDocs += documents.length;
    }

    backupData.metadata.totalDocuments = totalDocs;

    // Create filename with timestamp
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `firestore-backup-${timestamp}.json`;

    // Write to file
    fs.writeFileSync(filename, JSON.stringify(backupData, null, 2));

    console.log(`🎉 Export completed successfully!`);
    console.log(`📁 Backup saved as: ${filename}`);
    console.log(`📊 Total documents exported: ${totalDocs}`);

    // Print summary
    console.log("\n📋 Summary:");
    Object.entries(backupData.collections).forEach(([collection, docs]) => {
      console.log(`   ${collection}: ${docs.length} documents`);
    });
  } catch (error) {
    console.error("❌ Export failed:", error);
    process.exit(1);
  }
}

// Run the export
exportFirestore()
  .then(() => {
    console.log("\n✨ Backup process completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Backup process failed:", error);
    process.exit(1);
  });
