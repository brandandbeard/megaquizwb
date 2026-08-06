/* ═══ Mega QUIZ — Offline Service Worker (safe version) ═══ */
const APP_CACHE='megaquiz-app-v1';

self.addEventListener('install',e=>{
    e.waitUntil(
        caches.open(APP_CACHE).then(c=>Promise.all([
            c.add('/notesviewer.html').catch(()=>{}),
            c.add('https://cdn.tailwindcss.com').catch(()=>{}),
            c.add('https://unpkg.com/lucide@latest/dist/umd/lucide.js').catch(()=>{}),
            c.add('https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js').catch(()=>{})
        ]))
    );
    self.skipWaiting();
});

self.addEventListener('activate',e=>{
    e.waitUntil(
        caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==APP_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
    );
});

self.addEventListener('fetch',e=>{
    const req=e.request;
    if(req.method!=='GET')return;
    const url=new URL(req.url);
    const host=url.hostname;

    /* Google Sheet data: cache করবো না — সবসময় network থেকে fresh আসবে।
       Offline-এর জন্য page নিজে localStorage ব্যবহার করবে। */
    if(host==='docs.google.com'){
        return;
    }

    /* Fonts: cache থেকে দাও */
    if(host==='fonts.googleapis.com'||host==='fonts.gstatic.com'){
        e.respondWith(caches.match(req).then(c=>c||fetch(req).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(APP_CACHE).then(cc=>cc.put(req,cp)).catch(()=>{});}return res;})));
        return;
    }

    /* HTML page: online হলে fresh নাও, offline হলে cache থেকে দাও */
    if(req.mode==='navigate'){
        e.respondWith(fetch(req).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(APP_CACHE).then(c=>c.put(new Request(url.pathname),cp)).catch(()=>{});}return res;}).catch(()=>caches.match(new Request(url.pathname)).then(c=>c||caches.match('/notesviewer.html'))));
        return;
    }

    /* বাকি সব (CDN script): আগে cache, নাহলে network */
    e.respondWith(caches.match(req).then(c=>{if(c)return c;return fetch(req).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(APP_CACHE).then(cc=>cc.put(req,cp)).catch(()=>{});}return res;});}).catch(()=>caches.match(req)));
});
