/*!
 * bridge.js — پل سایت ↔ اپ (Capacitor)
 * web-to-app-skeleton — v3 (always-fresh + spinner)
 *
 * ۴ کار:
 *   ۱) Cold-start cache-bust  → اولین صفحه‌ی هر اجرا تازه
 *   ۲) Per-nav cache-bust     → هر کلیک روی لینک تازه + spinner
 *   ۳) Back Button اندروید
 *   ۴) Overlay آفلاین + تلاش دوباره
 *
 * چرا always-fresh؟
 *   تشخیص "تغییر کرده یا نه" روی CDN گیت‌هاب غیرقابل‌اعتماد بود
 *   (max-age=600 + عدم پاسخ به cache-control).
 *   راه قطعی: هر ناوبری یک URL یکتا (__v) → CDN cache miss اجباری.
 */
(function () {
    'use strict';
    if (window.__W2A_BRIDGE__) return;
    window.__W2A_BRIDGE__ = true;
    if (window.top !== window.self) return;

    /* ================= تنظیمات ================= */
    const u = window.W2A_CONFIG || {};
    const ACCENT = u.accentColor || '#3b82f6';
    const cfg = {
        autoUpdate: u.autoUpdate !== false,
        offlineOverlay: u.offlineOverlay !== false,
        navSpinner: u.navSpinner !== false,
        killServiceWorker: u.killServiceWorker !== false,
        texts: Object.assign({
            loading: 'در حال بارگذاری…',
            title: 'اتصال اینترنت برقرار نیست',
            hint: 'اتصال خود را بررسی کنید و دوباره تلاش کنید',
            retry: 'تلاش دوباره',
            checking: 'در حال بررسی...',
            still: 'هنوز آفلاین هستید'
        }, u.texts || {})
    };

    const Cap = window.Capacitor;
    const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
    const AppPlugin = (Cap && Cap.Plugins && Cap.Plugins.App) || null;
    const NetworkPlugin = (Cap && Cap.Plugins && Cap.Plugins.Network) || null;

    /* ================= ابزارها ================= */
    function genV() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    function bust(url) {
        const t = new URL(url, document.baseURI);
        t.searchParams.set('__v', genV());
        return t.toString();
    }
    function isAuthPage() {
        const p = location.pathname.toLowerCase();
        return ['login', 'register', 'signup', 'verify'].some(x => p.includes(x));
    }
    function once(fn) {
        let called = false;
        return function () {
            if (called) return;
            called = true;
            return fn.apply(this, arguments);
        };
    }
    // اجرای fn بعد از یک فریم paint + fallback ایمن
    function afterPaint(fn) {
        const wrapped = once(fn);
        requestAnimationFrame(() => requestAnimationFrame(wrapped));
        setTimeout(wrapped, 250);
    }

    /* ================= Spinner overlay ================= */
    let splash = null;
    function showSplash(text) {
        if (!splash) {
            splash = document.createElement('div');
            splash.id = '__w2a_splash';
            splash.style.cssText =
                'position:fixed;inset:0;z-index:2147483647;display:none;' +
                'flex-direction:column;align-items:center;justify-content:center;gap:16px;' +
                'background:#111111;direction:rtl;' +
                'font-family:system-ui,-apple-system,"Segoe UI",Vazirmatn,Tahoma,sans-serif;' +
                'color:#a1a1aa;font-size:13px';
            splash.innerHTML =
                '<style>@keyframes __w2a_spin{to{transform:rotate(360deg)}}</style>' +
                '<div style="width:40px;height:40px;' +
                'border:3px solid rgba(255,255,255,.12);' +
                'border-top-color:' + ACCENT + ';border-radius:50%;' +
                'animation:__w2a_spin .8s linear infinite"></div>' +
                '<div class="__w2a_text"></div>';
        }
        const host = document.body || document.documentElement;
        if (host && splash.parentNode !== host) host.appendChild(splash);
        splash.querySelector('.__w2a_text').textContent = text || cfg.texts.loading;
        splash.style.display = 'flex';
        void splash.offsetHeight; // force layout
    }
    function hideSplash() {
        if (splash) splash.style.display = 'none';
    }

    /* ================= ۱) Cold-start cache-bust ================= */
    function coldStart() {
        if (!cfg.autoUpdate) return false;

        let booted = false;
        try { booted = !!sessionStorage.getItem('__w2a_boot'); } catch (e) {}
        if (booted) return false;                         // ناوبری درون‌اپ، نه اجرای سرد

        try { sessionStorage.setItem('__w2a_boot', '1'); } catch (e) { return false; }

        if (nav_offline()) return false;                  // آفلاین: بگذار errorPath کار کند
        if (isAuthPage()) return false;                   // وسط لاگین دست نزن

        showSplash(cfg.texts.loading);
        const fresh = bust(location.href);
        afterPaint(() => location.replace(fresh));
        return true;
    }
    function nav_offline() { return navigator.onLine === false; }

    /* ================= ۲) Per-nav cache-bust + spinner ================= */
    function initNavBust() {
        if (!cfg.autoUpdate) return;

        // کلیک روی لینک‌ها
        document.addEventListener('click', function (e) {
            if (e.defaultPrevented || e.button !== 0) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

            let a;
            try { a = e.target.closest && e.target.closest('a[href]'); } catch (ex) { return; }
            if (!a) return;
            if (a.target === '_blank' || a.hasAttribute('download')) return;

            const href = a.getAttribute('href');
            if (!href) return;
            if (href.charAt(0) === '#') return;
            if (/^javascript:/i.test(href)) return;
            if (/^(mailto|tel|sms|whatsapp|intent):/i.test(href)) return;

            let target;
            try { target = new URL(href, document.baseURI); } catch (ex) { return; }
            if (target.origin !== location.origin) return;

            e.preventDefault();
            if (cfg.navSpinner) showSplash(cfg.texts.loading);
            const dest = bust(target.href);
            afterPaint(() => { location.href = dest; });
        }, false);

        // ارسال فرم‌های GET
        document.addEventListener('submit', function (e) {
            if (e.defaultPrevented) return;
            const form = e.target;
            if (!form || form.tagName !== 'FORM') return;
            const method = (form.getAttribute('method') || 'GET').toUpperCase();
            if (method !== 'GET') return;
            const action = form.getAttribute('action') || location.href;

            let target;
            try { target = new URL(action, document.baseURI); } catch (ex) { return; }
            if (target.origin !== location.origin) return;

            e.preventDefault();
            const params = new URLSearchParams(new FormData(form));
            params.set('__v', genV());
            target.search = params.toString();

            if (cfg.navSpinner) showSplash(cfg.texts.loading);
            afterPaint(() => { location.href = target.toString(); });
        }, false);
    }

    /* ================= ۳) Back Button ================= */
    function initBack() {
        if (!isNative || !AppPlugin || !AppPlugin.addListener) return;
        AppPlugin.addListener('backButton', info => {
            const can = info && typeof info.canGoBack === 'boolean'
                ? info.canGoBack : window.history.length > 1;
            if (can) window.history.back();
            else AppPlugin.exitApp();
        });
    }

    /* ================= ۴) Network + offline overlay ================= */
    let offlineEl = null;
    let offlineShown = false;

    function ensureOffline() {
        if (offlineEl) return offlineEl;
        if (!document.body) return null;

        const style = document.createElement('style');
        style.textContent = `
#__w2a_offline{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;background:rgba(9,9,11,.96);direction:rtl;padding:24px;box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Vazirmatn,Tahoma,sans-serif}
#__w2a_offline.__w2a_show{display:flex}
#__w2a_offline .__w2a_box{max-width:320px;text-align:center;color:#f4f4f5}
#__w2a_offline .__w2a_icon{width:76px;height:76px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--__w2a_accent)}
#__w2a_offline h2{font-size:18px;font-weight:700;margin:0 0 8px}
#__w2a_offline p{font-size:13px;line-height:1.9;color:#a1a1aa;margin:0 0 22px}
#__w2a_offline button{appearance:none;border:0;border-radius:12px;padding:12px 34px;font-size:14px;font-weight:700;font-family:inherit;color:#111;background:var(--__w2a_accent);cursor:pointer}
#__w2a_offline button:disabled{opacity:.55;cursor:default}`;
        document.head.appendChild(style);

        offlineEl = document.createElement('div');
        offlineEl.id = '__w2a_offline';
        offlineEl.setAttribute('role', 'alertdialog');
        offlineEl.setAttribute('aria-modal', 'true');
        offlineEl.style.setProperty('--__w2a_accent', ACCENT);
        offlineEl.innerHTML =
            '<div class="__w2a_box">' +
            '<div class="__w2a_icon">' +
            '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<line x1="1" y1="1" x2="23" y2="23"></line>' +
            '<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>' +
            '<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>' +
            '<path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>' +
            '<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>' +
            '<path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>' +
            '<line x1="12" y1="20" x2="12.01" y2="20"></line>' +
            '</svg>' +
            '</div>' +
            '<h2>' + cfg.texts.title + '</h2>' +
            '<p class="__w2a_hint">' + cfg.texts.hint + '</p>' +
            '<button type="button" id="__w2a_retry">' + cfg.texts.retry + '</button>' +
            '</div>';
        document.body.appendChild(offlineEl);
        offlineEl.querySelector('#__w2a_retry').addEventListener('click', onRetry);
        return offlineEl;
    }

    function probeConnection() {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const probeUrl = location.origin + location.pathname +
            '?__probe=' + Date.now();
        return fetch(probeUrl, {
            method: 'HEAD',
            cache: 'no-store',
            credentials: 'include',
            signal: ctrl.signal
        })
            .then(() => true)
            .catch(() => false)
            .finally(() => clearTimeout(timer));
    }

    function onRetry() {
        if (!offlineEl) return;
        const btn = offlineEl.querySelector('#__w2a_retry');
        const hint = offlineEl.querySelector('.__w2a_hint');
        if (!btn || btn.disabled) return;
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

    function showOffline() {
        if (!cfg.offlineOverlay || offlineShown) return;
        const el = ensureOffline();
        if (!el) return;
        offlineShown = true;
        el.classList.add('__w2a_show');
    }
    function hideOffline() {
        if (!offlineShown) return;
        offlineShown = false;
        if (offlineEl) offlineEl.classList.remove('__w2a_show');
    }

    function initNetwork() {
        if (!cfg.offlineOverlay) return;
        if (isNative && NetworkPlugin) {
            NetworkPlugin.getStatus()
                .then(st => { if (!st.connected) showOffline(); })
                .catch(() => {});
            NetworkPlugin.addListener('networkStatusChange', st => {
                if (st.connected) hideOffline(); else showOffline();
            });
            return;
        }
        window.addEventListener('online', hideOffline);
        window.addEventListener('offline', showOffline);
        if (!navigator.onLine) showOffline();
    }

    /* ================= راه‌اندازی ================= */
    if (coldStart()) return; // در حال رفرش هستیم

    function init() {
        hideSplash();
        if (cfg.killServiceWorker && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations()
                .then(list => list.forEach(r => r.unregister()))
                .catch(() => {});
        }
        initBack();
        initNavBust();
        initNetwork();
    }

    // اگر از bfcache برگشتیم (back button)، splash گیرکرده را پاک کن
    window.addEventListener('pageshow', function (e) {
        if (e.persisted) hideSplash();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();