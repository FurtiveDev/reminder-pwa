importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBdpgUAtBiGyJ2t5YGEPfTtaiZPkawwA8M",
  authDomain: "pwa-notif-25eea.firebaseapp.com",
  projectId: "pwa-notif-25eea",
  storageBucket: "pwa-notif-25eea.firebasestorage.app",
  messagingSenderId: "623374900657",
  appId: "1:623374900657:web:647e9a59e6062a01aef190"
});

const messaging = firebase.messaging();

const CACHE_NAME = 'reminder-pwa-v4';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([
        './',
        './index.html',
        './style.css',
        './app.js',
        './manifest.json',
        './icons/icon-180.png',
        './icons/icon-192.png',
        './icons/icon-512.png'
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

messaging.onBackgroundMessage(function(payload) {
  const title = payload.notification?.title || 'Напоминалка';
  const body = payload.notification?.body || '';
  const tag = payload.data?.tag || 'reminder';

  return self.registration.showNotification(title, {
    body: body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: tag,
    requireInteraction: true,
    data: payload.data
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const c of list) {
          if ('focus' in c) return c.focus();
        }
        return clients.openWindow('./');
      })
  );
});
