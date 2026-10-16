/**
 * Roster service worker — Web Push receiver (spec §2).
 * Registered by the dashboard once the buyer grants notification permission.
 */

// Take over immediately on update. Without these an edited worker sits in
// "waiting" until every Roster tab is closed, so a fixed bug would appear
// not to be fixed.
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  if (!event.data) return;

  var payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'Roster', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Roster', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      // Only collapse when the sender asks for it. A constant tag would let
      // each new alert silently replace the last one the operator missed.
      tag: payload.tag || undefined,
      renotify: payload.tag ? true : undefined,
      timestamp: payload.timestamp || undefined,
      data: { url: payload.url || '/dashboard' },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      // Focus an existing tab if one is already open rather than piling up windows.
      for (var i = 0; i < list.length; i++) {
        var client = list[i];
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          // Focus first: if navigate() rejects (it can, mid-load) the tab is
          // still brought forward rather than the click doing nothing.
          return client.focus().then(function (focused) {
            var c = focused || client;
            return c.navigate ? c.navigate(target).catch(function () {}) : undefined;
          });
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
