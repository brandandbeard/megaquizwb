// ক্যাশের নাম
const CACHE_NAME = 'mega-quiz-v2';
const urlsToCache = [
  'manifest.json',
  'class5.html',
  'class6.html',
  'class7.html',
  'class8.html',
  'class9.html',
  'class10.html',
  'competitive.html'
  // index.html আমরা নেটওয়ার্ক থেকে আনব, তাই ক্যাশে রাখছি না
];

// install: static ফাইল ক্যাশে রাখো
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// activate: পুরনো ক্যাশ ডিলিট
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
});

// ব্যাক বাটনের HTML+CSS+JS (একই আগের মত)
const BACK_BUTTON_HTML = `
<style>
    .desktop-back-btn {
        position: fixed; top: 20px; left: 20px; width: 48px; height: 48px;
        background: #4a5568; color: white; border: none; border-radius: 50%;
        font-size: 24px; font-weight: bold; cursor: pointer; z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        transition: background 0.2s;
    }
    .desktop-back-btn:hover { background: #2d3748; }
    .hide-on-mobile { display: none !important; }
</style>
<button id="pwaBackBtn" class="desktop-back-btn hide-on-mobile">←</button>
<script>
(function(){
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          window.matchMedia('(display-mode: minimal-ui)').matches ||
                          window.navigator.standalone === true;
    const btn = document.getElementById('pwaBackBtn');
    if(btn && !isMobile && isStandalone) {
        btn.classList.remove('hide-on-mobile');
        btn.onclick = () => history.length > 1 ? history.back() : null;
    }
})();
</script>
`;

// fetch: HTML-এর জন্য নেটওয়ার্ক-ফার্স্ট, বাকিদের জন্য ক্যাশ-ফার্স্ট
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // যদি রিকোয়েস্ট HTML পেজের হয় (যেমন index.html, class7.html)
  if (event.request.mode === 'navigate' || 
      (event.request.method === 'GET' && url.pathname.endsWith('.html'))) {
    event.respondWith(
      fetch(event.request).then(async response => {
        // HTML পেয়ে তাতে ব্যাক বাটন যোগ করো
        const html = await response.text();
        const modified = html.replace('</body>', BACK_BUTTON_HTML + '</body>');
        return new Response(modified, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }).catch(() => {
        // নেটওয়ার্ক না থাকলে ক্যাশ থেকে দাও (অফলাইন সাপোর্ট)
        return caches.match(event.request);
      })
    );
  } else {
    // বাকি ফাইল (manifest, css, js) ক্যাশ থেকে, নাহলে নেটওয়ার্ক
    event.respondWith(
      caches.match(event.request).then(res => res || fetch(event.request))
    );
  }
});
