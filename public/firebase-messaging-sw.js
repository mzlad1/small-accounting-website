/* eslint-disable no-undef */
// Firebase Cloud Messaging Service Worker
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js"
);

// Firebase configuration (same as your app config - these are public values)
firebase.initializeApp({
  apiKey: "AIzaSyBC1GirsXX2qywlNukL9bI42OSlEe71M7o",
  authDomain: "howwebuildtest.firebaseapp.com",
  projectId: "howwebuildtest",
  storageBucket: "howwebuildtest.firebasestorage.app",
  messagingSenderId: "241247852651",
  appId: "1:241247852651:web:27e974ca0276697551b92e",
});

const messaging = firebase.messaging();

// Handle background messages (when app is not in focus)
messaging.onBackgroundMessage((payload) => {
  console.log("Received background message:", payload);

  const title = payload.notification?.title || "إشعار جديد";
  const options = {
    body: payload.notification?.body || "",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    dir: "rtl",
    lang: "ar",
    tag: payload.data?.type || "default",
    data: payload.data,
  };

  self.registration.showNotification(title, options);
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const type = event.notification.data?.type;
  const url = type === "calendar_reminder" ? "/calendar" : "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if available
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return clients.openWindow(url);
    })
  );
});
