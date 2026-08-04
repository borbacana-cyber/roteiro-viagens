const CACHE = "roteiro-1785807781309";
const ESSENCIAL = ["./", "./index.html", "./manifest.json"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCIAL).catch(() => {})));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  if (r.mode === "navigate" || (r.headers.get("accept") || "").indexOf("text/html") >= 0) {
    e.respondWith((async () => {
      try {
        const resp = await fetch(r);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", resp.clone());
        return resp;
      } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match("./index.html")) || new Response("", { status: 503 });
      }
    })());
    return;
  }
  const fora = ["firestore.googleapis.com", "open-meteo.com", "nominatim.openstreetmap.org", "api.cloudinary.com", "googleapis.com/identitytoolkit"];
  for (let i = 0; i < fora.length; i++) { if (r.url.indexOf(fora[i]) >= 0) return; }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const salvo = await cache.match(r);
    const rede = fetch(r).then(resp => {
      if (resp && resp.status === 200 && (resp.type === "basic" || resp.type === "cors")) cache.put(r, resp.clone());
      return resp;
    }).catch(() => null);
    if (salvo) { rede; return salvo; }
    const resp = await rede;
    if (resp) return resp;
    if (r.mode === "navigate") { const idx = await cache.match("./index.html"); if (idx) return idx; }
    return new Response("", { status: 503 });
  })());
});
