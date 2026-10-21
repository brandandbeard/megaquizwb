/* ═══ Mega QUIZ — Offline Service Worker (safe version) ═══
   EKTA-I service worker puro site manage kore (notesviewer + mindmap + baki sob page).
   Alada "mindmap-sw.js" LAGBE NA — ekta origin e same scope e duita SW chole na.
   Ei file repo root e SAME NAME (sw.js) e replace hobe — eta "notun arekta SW add" na,
   purano tar UPGRADE. Browser nije notun version install kore purano ta soriye dey.

   Tomar ager sw.js er SOB feature ekdom age-r moto ache:
   - notesviewer.html + tailwind + lucide + chart.js pre-cache
   - docs.google.com (Sheet TSV) — always network fresh
   - Fonts cache-first, page navigate network-first + offline cache fallback
   Sathe 3 ta notun:
   1) script.google.com + script.googleusercontent.com BYPASS — sync bug er ASOL fix.
      (v1 e ei host gulo'r response cache hoye jeto → tarpor sync korleo browser
       purano cached data-i dekhato — "sync koreo notun data load hoy na" bug.)
   2) mindmap.html pre-cache — mindmap ekhon internet chara-o khule.
   3) Offline navigate fallback page-aware — /mindmap offline e gele mindmap-i khulbe
      (notesviewer na), ar baki page offline e notesviewer fallback. */
const APP_CACHE='megaquiz-app-v3';

self.addEventListener('install',e=>{
    e.waitUntil(
        caches.open(APP_CACHE).then(c=>Promise.all([
            c.add('/notesviewer.html').catch(()=>{}),
            c.add('/mindmap.html').catch(()=>{}),
            c.add('/mindmap').catch(()=>{}),
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

    /* Google Sheet + Apps Script data: cache KORBO NA — sompurno network theke fresh asbe.
       (v1 te script.google.com er response cache hoto — sync bug er karon chilo)
       Offline-er jonno page nijei localStorage backup use kore. */
    if(host==='docs.google.com'||host==='script.google.com'||host==='script.googleusercontent.com'||host==='googleusercontent.com'){
        return;
    }

    /* Fonts: cache থেকে দাও */
    if(host==='fonts.googleapis.com'||host==='fonts.gstatic.com'){
        e.respondWith(caches.match(req).then(c=>c||fetch(req).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(APP_CACHE).then(cc=>cc.put(req,cp)).catch(()=>{});}return res;})));
        return;
    }

    /* HTML page: online হলে fresh নাও, offline হলে cache থেকে দাও
       Fallback page-aware: mindmap offline → mindmap copy, baki → notesviewer */
    if(req.mode==='navigate'){
        e.respondWith(
            fetch(req).then(res=>{
                if(res&&res.ok){const cp=res.clone();caches.open(APP_CACHE).then(c=>c.put(new Request(url.pathname),cp)).catch(()=>{});}
                return res;
            }).catch(()=>{
                return caches.match(new Request(url.pathname)).then(c=>{
                    if(c)return c;
                    if(url.pathname.indexOf('mindmap')>-1){
                        return caches.match('/mindmap.html')
                            .then(m=>m||caches.match('/mindmap'))
                            .then(m=>m||caches.match('/notesviewer.html'));
                    }
                    return caches.match('/notesviewer.html');
                });
            })
        );
        return;
    }

    /* বাকি সব (CDN script): আগে cache, নাহলে network */
    e.respondWith(caches.match(req).then(c=>{if(c)return c;return fetch(req).then(res=>{if(res&&res.ok){const cp=res.clone();caches.open(APP_CACHE).then(cc=>cc.put(req,cp)).catch(()=>{});}return res;});}).catch(()=>caches.match(req)));
});
