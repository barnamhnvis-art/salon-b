/* ============================================
   Service Worker - نسخه 1.0.0
   سالن زیبایی لوکس
   ============================================
   این Service Worker عمداً هیچ کشی نمی‌کند.
   هدف فقط برآورده کردن شرط نصب‌پذیری PWA در Chrome است.
   هر درخواست مستقیماً به شبکه می‌رود تا کاربر همیشه
   جدیدترین نسخه سایت را ببیند.
   ============================================ */

console.log("[SW] Service Worker بارگذاری شد (بدون کش)");

/* ============================================
   رویداد نصب (Install)
   فقط یک لاگ ساده، بدون کش کردن
   ============================================ */
self.addEventListener("install", (event) => {
    console.log("[SW] رویداد install اجرا شد");

    /* اجبار به فعال‌سازی فوری بدون انتظار */
    self.skipWaiting();
});

/* ============================================
   رویداد فعال‌سازی (Activate)
   کش‌های احتمالی قدیمی را پاک می‌کند
   ============================================ */
self.addEventListener("activate", (event) => {
    console.log("[SW] رویداد activate اجرا شد");

    event.waitUntil(
        /* همه کش‌های قدیمی را پاک کن (اگر از قبل وجود دارند) */
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    console.log("[SW] کش قدیمی پاک شد:", cacheName);
                    return caches.delete(cacheName);
                })
            );
        })
    );

    /* کنترل فوری همه تب‌ها */
    self.clients.claim();
});

/* ============================================
   رویداد واکشی (Fetch)
   این event برای نصب‌پذیری PWA الزامی است.
   اما ما هیچ کشی نمی‌کنیم — هر درخواست مستقیم
   به شبکه می‌رود.
   ============================================ */
self.addEventListener("fetch", (event) => {
    /* فقط درخواست‌های GET را مدیریت کن */
    if (event.request.method !== "GET") {
        return;
    }

    /* درخواست را مستقیماً به شبکه بفرست (بدون کش) */
    event.respondWith(
        fetch(event.request).catch((error) => {
            /* اگر شبکه در دسترس نبود، خطا را لاگ کن */
            console.warn("[SW] خطا در واکشی:", event.request.url, error);
            throw error;
        })
    );
});