// Terranila Book — Service Worker
// Strategi sengaja dibuat konservatif:
// - Halaman HTML: NETWORK FIRST (supaya update deploy langsung terlihat,
//   tidak terjebak versi lama di cache).
// - Aset statis (ikon, CSS/JS CDN): cache sebagai cadangan offline.
// - Permintaan ke Supabase: TIDAK PERNAH di-cache.

const CACHE_NAME = 'terranila-v6';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './laporan.js',
  './pengingat.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .catch(err => console.warn('Precache dilewati:', err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Hanya tangani GET.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Jangan sentuh trafik Supabase (auth, database, storage) sama sekali.
  if (url.hostname.endsWith('supabase.co')) return;

  // Halaman/navigasi: coba jaringan dulu, cache hanya sebagai cadangan.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          // Simpan per-halaman. Dulu semua halaman disimpan di kunci index.html,
          // sehingga membuka Kebijakan Privasi akan menimpa cache halaman utama.
          if (res.ok) caches.open(CACHE_NAME).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(h => h || caches.match('./index.html')).then(
          hit => hit || new Response(
            '<h1>Offline</h1><p>Terranila butuh koneksi internet untuk memuat data dari server.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          )
        ))
    );
    return;
  }

  // Aset lain: pakai cache kalau ada, sambil tetap mengambil versi baru.
  event.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
