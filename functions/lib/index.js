"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBackupSettings = exports.triggerCloudBackup = exports.scheduledBackup = exports.sendTestNotification = exports.checkCalendarReminders = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();
// Collections to backup
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
// ==========================================
// CALENDAR REMINDERS - FCM Push Notifications
// ==========================================
/**
 * Scheduled function: Check calendar reminders every 5 minutes
 * Sends FCM push notifications for upcoming events
 */
exports.checkCalendarReminders = (0, scheduler_1.onSchedule)({
    schedule: "every 5 minutes",
    timeZone: "Asia/Jerusalem",
}, async () => {
    const now = new Date();
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);
    const dateStr = now.toISOString().split("T")[0];
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
    const futureTime = `${fiveMinutesLater
        .getHours()
        .toString()
        .padStart(2, "0")}:${fiveMinutesLater
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
    console.log(`Checking reminders for ${dateStr} between ${currentTime} and ${futureTime}`);
    try {
        // Get today's events that haven't been reminded yet
        const eventsSnapshot = await db
            .collection("calendarEvents")
            .where("date", "==", dateStr)
            .where("reminderSent", "==", false)
            .get();
        if (eventsSnapshot.empty) {
            console.log("No events to remind");
            return;
        }
        const batch = db.batch();
        const notificationPromises = [];
        for (const eventDoc of eventsSnapshot.docs) {
            const event = eventDoc.data();
            const eventTime = event.time;
            // Check if event is within the next 5 minutes
            if (eventTime >= currentTime && eventTime <= futureTime) {
                console.log(`Sending reminder for: ${event.title}`);
                // Get ALL FCM tokens for this user (multiple devices)
                const tokensSnapshot = await db
                    .collection("fcmTokens")
                    .where("userEmail", "==", event.userEmail)
                    .get();
                for (const tokenDoc of tokensSnapshot.docs) {
                    const token = tokenDoc.data().token;
                    const message = {
                        token,
                        notification: {
                            title: `تذكير: ${event.title}`,
                            body: `موعدك في الساعة ${event.time} - ${event.note}`,
                        },
                        data: {
                            eventId: eventDoc.id,
                            type: "calendar_reminder",
                            eventDate: event.date,
                            eventTime: event.time,
                        },
                        webpush: {
                            notification: {
                                icon: "/vite.svg",
                                badge: "/vite.svg",
                                dir: "rtl",
                                lang: "ar",
                            },
                            fcmOptions: {
                                link: "/calendar",
                            },
                        },
                    };
                    notificationPromises.push(messaging.send(message).catch((err) => {
                        console.error(`Failed to send to token: ${err.message}`);
                        // Remove invalid tokens
                        if (err.code === "messaging/invalid-registration-token" ||
                            err.code === "messaging/registration-token-not-registered") {
                            return tokenDoc.ref.delete();
                        }
                    }));
                }
                // Mark reminder as sent
                batch.update(eventDoc.ref, { reminderSent: true });
            }
        }
        await Promise.all(notificationPromises);
        await batch.commit();
        console.log("Reminder check completed successfully");
    }
    catch (error) {
        console.error("Error checking reminders:", error);
    }
});
/**
 * Callable function: Send a test notification to verify FCM setup
 */
exports.sendTestNotification = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
    }
    const userEmail = request.auth.token.email;
    try {
        // Get ALL tokens for this user (all devices)
        const tokensSnapshot = await db
            .collection("fcmTokens")
            .where("userEmail", "==", userEmail)
            .get();
        if (tokensSnapshot.empty) {
            throw new https_1.HttpsError("not-found", "لم يتم العثور على أجهزة مسجلة للإشعارات");
        }
        const promises = tokensSnapshot.docs.map((tokenDoc) => {
            return messaging
                .send({
                token: tokenDoc.data().token,
                notification: {
                    title: "اختبار الإشعارات",
                    body: "تم إعداد الإشعارات بنجاح! ستصلك تذكيرات المواعيد تلقائياً",
                },
                webpush: {
                    notification: {
                        icon: "/vite.svg",
                        dir: "rtl",
                        lang: "ar",
                    },
                },
            })
                .catch((err) => {
                console.error(`Failed to send to token: ${err.message}`);
                // Remove invalid token
                if (err.code === "messaging/invalid-registration-token" ||
                    err.code === "messaging/registration-token-not-registered") {
                    return tokenDoc.ref.delete();
                }
            });
        });
        await Promise.all(promises);
        return {
            success: true,
            message: "تم إرسال الإشعار التجريبي بنجاح",
            devicesCount: tokensSnapshot.size,
        };
    }
    catch (error) {
        console.error("Test notification failed:", error);
        if (error instanceof https_1.HttpsError)
            throw error;
        throw new https_1.HttpsError("internal", error.message || "فشل في إرسال الإشعار");
    }
});
// ==========================================
// AUTO BACKUP - Cloud Functions
// ==========================================
/**
 * Scheduled function: Automatic daily backup
 * Exports all Firestore data to Cloud Storage
 */
exports.scheduledBackup = (0, scheduler_1.onSchedule)({
    schedule: "every 24 hours",
    timeZone: "Asia/Jerusalem",
}, async () => {
    console.log("Starting scheduled backup...");
    try {
        // Check if auto backup is enabled
        const settingsDoc = await db.collection("settings").doc("backup").get();
        const settings = settingsDoc.data();
        if (!(settings === null || settings === void 0 ? void 0 : settings.autoBackupEnabled)) {
            console.log("Auto backup is disabled, skipping");
            return;
        }
        // Check frequency
        const frequency = settings.frequency || "daily";
        const lastAutoBackup = settings.lastAutoBackup;
        if (lastAutoBackup && frequency === "weekly") {
            const lastDate = new Date(lastAutoBackup);
            const daysSince = (Date.now() - lastDate.getTime()) / (1000 * 3600 * 24);
            if (daysSince < 7) {
                console.log("Weekly backup not due yet, skipping");
                return;
            }
        }
        const backupResult = await performBackup("automatic");
        // Update last backup time in settings
        await db
            .collection("settings")
            .doc("backup")
            .set({
            lastAutoBackup: new Date().toISOString(),
            lastBackupDocuments: backupResult.totalDocuments,
        }, { merge: true });
        // Send notification to ALL registered devices
        const tokensSnapshot = await db.collection("fcmTokens").get();
        const notifications = tokensSnapshot.docs.map((tokenDoc) => {
            return messaging
                .send({
                token: tokenDoc.data().token,
                notification: {
                    title: "نسخة احتياطية تلقائية",
                    body: `تم إنشاء نسخة احتياطية تلقائية بنجاح (${backupResult.totalDocuments} سجل)`,
                },
                webpush: {
                    notification: {
                        icon: "/vite.svg",
                        dir: "rtl",
                        lang: "ar",
                    },
                },
            })
                .catch((err) => {
                console.error("Failed to send backup notification:", err.message);
            });
        });
        await Promise.all(notifications);
        console.log(`Scheduled backup completed: ${backupResult.totalDocuments} documents`);
    }
    catch (error) {
        console.error("Scheduled backup failed:", error);
    }
});
/**
 * Callable function: Trigger backup manually from client
 */
exports.triggerCloudBackup = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
    }
    try {
        const result = await performBackup("manual", request.auth.token.email || undefined);
        return {
            success: true,
            filename: result.filename,
            totalDocuments: result.totalDocuments,
        };
    }
    catch (error) {
        console.error("Manual backup failed:", error);
        throw new https_1.HttpsError("internal", error.message || "فشل في إنشاء النسخة الاحتياطية");
    }
});
/**
 * Callable function: Update auto backup settings
 */
exports.updateBackupSettings = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
    }
    const { autoBackupEnabled, frequency } = request.data;
    try {
        await db
            .collection("settings")
            .doc("backup")
            .set({
            autoBackupEnabled: autoBackupEnabled !== null && autoBackupEnabled !== void 0 ? autoBackupEnabled : false,
            frequency: frequency || "daily",
            updatedAt: new Date().toISOString(),
            updatedBy: request.auth.token.email,
        }, { merge: true });
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError("internal", error.message || "فشل في تحديث الإعدادات");
    }
});
// ==========================================
// HELPER FUNCTIONS
// ==========================================
async function performBackup(type, triggeredBy) {
    const backupId = `${type}_${Date.now()}`;
    const backupData = {
        collections: {},
        metadata: {
            exportDate: new Date().toISOString(),
            version: "1.0.0",
            totalDocuments: 0,
            backupId,
            type,
            triggeredBy,
        },
    };
    let totalDocs = 0;
    for (const collectionName of COLLECTIONS) {
        const snapshot = await db.collection(collectionName).get();
        const documents = [];
        snapshot.forEach((doc) => {
            documents.push(Object.assign({ id: doc.id }, doc.data()));
        });
        backupData.collections[collectionName] = documents;
        totalDocs += documents.length;
    }
    backupData.metadata.totalDocuments = totalDocs;
    // Save to Cloud Storage
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `backups/backup-${timestamp}-${backupId}.json`;
    const bucket = admin.storage().bucket();
    const file = bucket.file(filename);
    await file.save(JSON.stringify(backupData, null, 2), {
        contentType: "application/json",
        metadata: {
            metadata: {
                totalDocuments: totalDocs.toString(),
                type,
                backupId,
            },
        },
    });
    // Record backup in Firestore
    await db.collection("backupHistory").add({
        filename,
        date: new Date().toISOString(),
        type,
        totalDocuments: totalDocs,
        size: JSON.stringify(backupData).length,
        triggeredBy,
    });
    return { filename, totalDocuments: totalDocs };
}
//# sourceMappingURL=index.js.map