/* わが家の家計簿 ─ オフライン対応と「共有」からの写真受け取り */
const VERSION = "kk-1.0.1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "maskable-512.png", "Code.gs.txt"];
const OCR_CACHE = "kk-ocr-1"; // 文字認識の部品（大きいので版が変わらない限り使い回す）
const FONT_CACHE = "kk-fonts";
const SHARE_CACHE = "kk-share";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keep = [VERSION, OCR_CACHE, FONT_CACHE, SHARE_CACHE];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);

  // Androidの「共有」から届いた写真
  if (req.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/share-target")) {
    e.respondWith((async () => {
      let found = false;
      try {
        const form = await req.formData();
        const files = form.getAll("image").filter(f => f && typeof f === "object" && /^image\//.test(f.type || ""));
        if (files.length) {
          const c = await caches.open(SHARE_CACHE);
          await c.put("shared-image", new Response(files[0], { headers: { "Content-Type": files[0].type || "image/jpeg" } }));
          found = true;
        }
      } catch (err) {}
      return Response.redirect("./?shared=" + (found ? "1" : "none"), 303);
    })());
    return;
  }

  if (req.method !== "GET") return;

  // Googleフォント：手元にあればすぐ使い、裏で新しくする
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }
  if (url.origin !== location.origin) return; // 同期（script.google.com）などは素通し

  // 文字認識の部品：一度読み込んだら端末に保存
  if (/\/(tesseract[^/]*|worker\.min|jpn-data|wasm-check)\.js$/.test(url.pathname)) {
    e.respondWith(cacheFirst(req, OCR_CACHE));
    return;
  }
  // 画面：ネットにつながっていれば最新を、だめなら保存してある画面を
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(VERSION); c.put("index.html", res.clone());
        return res;
      } catch (err) {
        return (await caches.match("index.html")) || (await caches.match("./")) || Response.error();
      }
    })());
    return;
  }
  e.respondWith(staleWhileRevalidate(req, VERSION));
});

async function cacheFirst(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}
async function staleWhileRevalidate(req, name) {
  const c = await caches.open(name);
  const hit = await c.match(req, { ignoreSearch: true });
  const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
