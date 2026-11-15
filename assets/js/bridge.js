/*!
 * bridge.js — پل سایت ↔ اپ (Capacitor)
 * اسکلت web-to-app-skeleton — قدم ۶
 *
 * کارها:
 *   ۱) آپدیت خودکار بر پایه content-hash (بدون تغییر دستی نسخه)
 *   ۲) دکمه بازگشت اندروید
 *   ۳) overlay آفلاین + تلاش دوباره
 *
 * استفاده در سایت:
 *   <script>window.W2A_CONFIG = { rootUrl: '/', authPages: ['login'] };</script>
 *   <script src="assets/js/bridge.js" defer></script>
 */
(function () {
    'use strict';
    if (window.__W2A_BRIDGE__) return;
    window.__W2A_BRIDGE__ = true;
    if (window.top !== window.self) return; // داخل iframe اجرا نشو

    /* ================= ۱) تنظیمات ================= */
    const userCfg = window.W2A_CONFIG || {};
    const cfg = {
        rootUrl: userCfg.rootUrl || './',
        authPages: Array.isArray(userCfg.authPages)
            ? userCfg.authPages
            : ['login', 'register', 'signup', 'verify'],
        autoUpdate: userCfg.autoUpdate !== false,
        offlineOverlay: userCfg.offlineOverlay !== false,
        killServiceWorker: userCfg.killServiceWorker !== false,
        accentColor: userCfg.accentColor || '#3b82f6',
        texts: Object.assign({
            title: 'اتصال اینترنت برقرار نیست',
            hint: 'اتصال خود را بررسی کنید و دوباره تلاش کنید',
            retry: 'تلاش دوباره',
            checking: 'در حال بررسی...',
            still: 'هنوز آفلاین هستید'
        }, userCfg.texts || {})
    };

    const Cap = window.Capacitor;
    const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
    const AppPlugin = (Cap && Cap.Plugins && Cap.Plugins.App) || null;
    const NetworkPlugin = (Cap && Cap.Plugins && Cap.Plugins.Network) || null;

    const HASH_KEY = '__w2a_hash';

    /* ================= ۲) آپدیت خودکار ================= */
    // FNV-1a 32bit — سریع، بدون نیاز به crypto
    function hashText(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0).toString(36);
    }

    function isAuthPage() {
        const path = location.pathname.toLowerCase();
        return cfg.authPages.some(p => path.includes(String(p).toLowerCase()));
    }

    function checkForUpdate() {
        if (!cfg.autoUpdate) return;
        if (isAuthPage()) return;                            // در صفحه لاگین دست نزن
        if (location.search.includes('_w2a=')) return;        // همین الان ریلود شدیم (ضد حلقه)

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);

        fetch(cfg.rootUrl, {
            cache: 'no-store',       // کش مرورگر/هاست را دور بزن
            credentials: 'include',  // برای سایت‌های لاگین‌دار (کوکی session)
            signal: ctrl.signal
        })
            .then(res => {
                if (!res.ok) {
                    console.warn('[W2A] update check: HTTP ' + res.status);
                    return null;
                }
                return res.text();
            })
            .then(html => {
                if (!html) return;
                const h = hashText(html);
                const stored = localStorage.getItem(HASH_KEY);

                if (!stored) { localStorage.setItem(HASH_KEY, h); return; } // اولین اجرا: فقط ثبت
                if (stored === h) return;                                    // تغییری نیست

                localStorage.setItem(HASH_KEY, h);  // قبل از ریلود ذخیره کن (ضد حلقه)
                const url = new URL(location.href);
                url.searchParams.set('_w2a', h);
                location.replace(url.toString());   // ریلود با آدرس تازه → دور زدن کش
            })
            .catch(() => { /* آفلاین/خطا — overlay مدیریت می‌کند */ })
            .finally(() => clearTimeout(timer));
    }

    /* ================= ۳) دکمه بازگشت ================= */
    function initBackButton() {
        if (!isNative || !AppPlugin || !AppPlugin.addListener) return;
        AppPlugin.addListener('backButton', info => {
            const canGoBack = info && typeof info.canGoBack === 'boolean'
                ? info.canGoBack
                : window.history.length > 1;
            if (canGoBack) window.history.back();
            else AppPlugin.exitApp();
        });
    }

    /* ================= ۴) شبکه + overlay ================= */
    let overlay = null;
    let overlayShown = false;

    function ensureOverlay() {
        if (overlay) return overlay;
        if (!document.body) return null;

        const style = document.createElement('style');
        style.textContent = `
#__w2a_offline{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;background:rgba(9,9,11,.96);direction:rtl;padding:24px;box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Vazirmatn,Tahoma,sans-serif}
#__w2a_offline.__w2a_show{display:flex}
#__w2a_offline .__w2a_box{max-width:320px;text-align:center;color:#f4f4f5}
#__w2a_offline .__w2a_icon{width:76px;height:76px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--__w2a_accent)}
#__w2a_offline h2{font-size:18px;font-weight:700;margin:0 0 8px}
#__w2a_offline p{font-size:13px;line-height:1.9;color:#a1a1aa;margin:0 0 22px}
#__w2a_offline button{appearance:none;border:0;border-radius:12px;padding:12px 34px;font-size:14px;font-weight:700;font-family:inherit;color:#111;background:var(--__w2a_accent);cursor:pointer}
#__w2a_offline button:disabled{opacity:.55;cursor:default}`;
        document.head.appendChild(style);

        overlay = document.createElement('div');
        overlay.id = '__w2a_offline';
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.setProperty('--__w2a_accent', cfg.accentColor);
        overlay.innerHTML = `
<div class="__w2a_box">
  <div class="__w2a_icon">
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"></line>
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
      <line x1="12" y1="20" x2="12.01" y2="20"></line>
    </svg>
  </div>
  <h2>${cfg.texts.title}</h2>
  <p class="__w2a_hint">${cfg.texts.hint}</p>
  <button type="button" id="__w2a_retry">${cfg.texts.retry}</button>
</div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#__w2a_retry').addEventListener('click', onRetry);
        return overlay;
    }

    function probeConnection() {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        return fetch(cfg.rootUrl, {
            method: 'HEAD',
            cache: 'no-store',
            credentials: 'include',
            signal: ctrl.signal
        })
            .then(() => true)      // هر پاسخی = شبکه وصل است
            .catch(() => false)
            .finally(() => clearTimeout(timer));
    }

    function onRetry() {
        const btn = overlay.querySelector('#__w2a_retry');
        const hint = overlay.querySelector('.__w2a_hint');
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = cfg.texts.checking;
        probeConnection().then(ok => {
            if (ok) { location.reload(); return; }
            btn.disabled = false;
            btn.textContent = cfg.texts.retry;
            hint.textContent = cfg.texts.still;
            setTimeout(() => { hint.textContent = cfg.texts.hint; }, 3000);
        });
    }

    function showOverlay() {
        if (!cfg.offlineOverlay || overlayShown) return;
        const el = ensureOverlay();
        if (!el) return;
        overlayShown = true;
        el.classList.add('__w2a_show');
    }

    function hideOverlay() {
        if (!overlayShown) return;
        overlayShown = false;
        if (overlay) overlay.classList.remove('__w2a_show');
    }

    function initNetwork() {
        if (!cfg.offlineOverlay) return;
        if (isNative && NetworkPlugin) {
            NetworkPlugin.getStatus()
                .then(st => { if (!st.connected) showOverlay(); })
                .catch(() => {});
            NetworkPlugin.addListener('networkStatusChange', st => {
                if (st.connected) hideOverlay(); else showOverlay();
            });
            return;
        }
        // فقط برای دیباگ در مرورگر دسکتاپ
        window.addEventListener('online', hideOverlay);
        window.addEventListener('offline', showOverlay);
        if (!navigator.onLine) showOverlay();
    }

    /* ================= ۵) راه‌اندازی ================= */
    function init() {
        if (cfg.killServiceWorker && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations()
                .then(list => list.forEach(r => r.unregister()))
                .catch(() => {});
        }
        initBackButton();
        checkForUpdate();
        initNetwork();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();