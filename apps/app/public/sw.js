// Service worker (ADR-0008, section 9): plain JavaScript, served from the root with scope `/`.
// No `fetch` handler: offline cache is F8-5, and an empty one only delays every request.
/* global self, URL */

// Shown only when a payload cannot be read. Repeats the provisional name of manifest.webmanifest.
const appName = 'Azkaban';

// Same rule as `internalPathSchema` in the contracts, and then the same origin once resolved: the URL
// parser drops tab and line breaks, so a rule on the text alone is not enough (ADR-0008, section 17).
function internalPath(path) {
  if (
    typeof path !== 'string' ||
    path.length > 200 ||
    !/^\/[^/\\\p{Cc}][^\\\p{Cc}]*$/u.test(path)
  ) {
    return '/';
  }
  const url = new URL(path, self.location.origin);
  return url.origin === self.location.origin ? url.pathname + url.search + url.hash : '/';
}

function read(data) {
  try {
    const payload = data.json();
    if (payload && payload.v === 1 && typeof payload.title === 'string' && payload.title) {
      return payload;
    }
  } catch {
    // falls through to the generic notification
  }
  return undefined;
}

// A fix here must reach everyone at once, not after every tab of the app is closed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  // Always show something: iOS revokes a subscription that receives a push and shows nothing, and
  // Chrome subscribes with `userVisibleOnly`. A payload that fails here is a server bug.
  const payload = event.data ? read(event.data) : undefined;
  const title = payload ? payload.title : appName;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload && typeof payload.body === 'string' ? payload.body : '',
      tag: payload && typeof payload.tag === 'string' ? payload.tag : undefined,
      icon: '/icon-192.png',
      data: { url: internalPath(payload && payload.url) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(
    internalPath(event.notification.data && event.notification.data.url),
    self.location.origin,
  ).href;
  event.waitUntil(open(url));
});

async function open(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const client = windows.find((each) => new URL(each.url).origin === self.location.origin);
  if (client) {
    try {
      await client.focus();
      await client.navigate(url);
      return;
    } catch {
      // A window this worker does not control cannot be navigated: open a new one.
    }
  }
  await self.clients.openWindow(url);
}
