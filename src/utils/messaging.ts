import { getMessaging, getToken, onMessage } from "firebase/messaging";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
} from "firebase/firestore";
import app, { db } from "../config/firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "";

/**
 * Initialize Firebase Cloud Messaging and request notification permission
 */
export async function requestNotificationPermission(
  userEmail: string,
): Promise<string | null> {
  try {
    // Check if browser supports notifications
    if (!("Notification" in window)) {
      console.warn("This browser does not support notifications");
      return null;
    }

    // Request permission
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      console.warn("Notification permission denied");
      return null;
    }

    // Register service worker and wait until it is fully active
    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const registration = await navigator.serviceWorker.ready;

    // Get FCM token
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      // Save token to Firestore
      await saveTokenToFirestore(token, userEmail);
      console.log("FCM token obtained and saved");
      return token;
    }

    console.warn("getToken returned empty — VAPID key or SW scope issue");
    return null;
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    throw error;
  }
}

/**
 * Save FCM token to Firestore
 * Supports multiple tokens per user (multiple devices/browsers)
 * Only adds the token if it doesn't already exist
 */
async function saveTokenToFirestore(
  token: string,
  userEmail: string,
): Promise<void> {
  try {
    // Check if this exact token already exists
    const tokensQuery = query(
      collection(db, "fcmTokens"),
      where("token", "==", token),
    );

    const existingTokens = await getDocs(tokensQuery);

    if (existingTokens.empty) {
      // Token doesn't exist yet — add it (keep all existing tokens for other devices)
      await addDoc(collection(db, "fcmTokens"), {
        token,
        userEmail,
        createdAt: new Date().toISOString(),
        platform: "web",
        userAgent: navigator.userAgent,
      });
      console.log("New FCM token saved for user:", userEmail);
    } else {
      // Token exists — update the userEmail in case the user changed
      const existingDoc = existingTokens.docs[0];
      const existingData = existingDoc.data();
      if (existingData.userEmail !== userEmail) {
        await updateDoc(doc(db, "fcmTokens", existingDoc.id), {
          userEmail,
          updatedAt: new Date().toISOString(),
        });
      }
      console.log("FCM token already exists for this device");
    }
  } catch (error) {
    console.error("Error saving FCM token:", error);
  }
}

/**
 * Listen for foreground messages
 */
export function onForegroundMessage(
  callback: (payload: any) => void,
): () => void {
  const messaging = getMessaging(app);

  const unsubscribe = onMessage(messaging, (payload) => {
    console.log("Foreground message received:", payload);
    callback(payload);
  });

  return unsubscribe;
}

/**
 * Check if notification permission is granted
 */
export function getNotificationPermissionStatus(): string {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Auto-register FCM token on login
 * Call this when a user logs in — only adds the token if it doesn't exist yet
 */
export async function registerFCMTokenOnLogin(
  userEmail: string,
): Promise<void> {
  try {
    // Only proceed if notifications are already granted (don't prompt)
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
    );

    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      await saveTokenToFirestore(token, userEmail);
    }
  } catch (error) {
    console.error("Error auto-registering FCM token:", error);
  }
}

/**
 * Remove FCM token (when user disables notifications)
 */
export async function removeNotificationToken(
  userEmail: string,
): Promise<void> {
  try {
    const tokensQuery = query(
      collection(db, "fcmTokens"),
      where("userEmail", "==", userEmail),
    );

    const tokens = await getDocs(tokensQuery);

    for (const tokenDoc of tokens.docs) {
      await deleteDoc(doc(db, "fcmTokens", tokenDoc.id));
    }

    console.log("FCM tokens removed for user:", userEmail);
  } catch (error) {
    console.error("Error removing FCM tokens:", error);
  }
}
