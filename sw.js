// بيخزن ملفات الأبلكيشن عشان يفتح بسرعة. البيانات نفسها دايماً من السيرفر (ما بتتخزنش هنا).
const CACHE = 'test-nabdify-doctor-v9';
const FILES = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon.svg', 'logo-white.svg', 'logo-dark-text.svg',
  'fonts/cairo-arabic-400-normal.woff2', 'fonts/cairo-arabic-600-normal.woff2', 'fonts/cairo-arabic-700-normal.woff2',
  'fonts/cairo-latin-400-normal.woff2', 'fonts/cairo-latin-700-normal.woff2'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
// الملفات: من الشبكة الأول (عشان التحديثات توصل)، ولو مفيش نت من الكاش
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});

// ---------- الإشعارات ----------
self.addEventListener('push', (e) => {
  // لو الأبلكيشن مفتوح، نقوله يحدّث الجرس
  self.clients.matchAll({ type: 'window' }).then((l) => l.forEach((c) => c.postMessage('push')));
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'Nabdify', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Nabdify', {
    body: d.body || '', tag: d.tag || undefined, icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'ar' }));
});
// الضغط على الإشعار بيفتح الأبلكيشن (أو يرجعله لو مفتوح)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.includes(self.registration.scope));
    return open ? open.focus() : self.clients.openWindow('./');
  }));
});
