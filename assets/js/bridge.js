/*!
 * bridge.js — پل سایت ↔ اپ (Capacitor)
 * web-to-app-skeleton — نسخه boot-cachebust
 *
 * ۳ کار:
 *   ۱) در هر «اجرای سرد» اپ، صفحه را با URL یکتا رفرش می‌کند
 *      تا از کش CDN و WebView عبور کند (آپدیت خودکار بدون نسخه)
 *   ۲) دکمه بازگشت اندروید
 *   ۳) Overlay آفلاین + تلاش دوباره
 *
 * چرا Cold-Start؟
 *   cache:'no-store' فقط کش WebView را دور می‌زند، نه CDN.
 *   تنها راه قطعی: URL عوض شود (?__v=timestamp).
 *   sessionStorage در هر WebView زنده است و با kill شدن اپ پاک می‌شود
 *   → ابزار تشخیص قابل‌اتکای «اجرای سرد».
 */
(function () {
    'use strict';
    if (window.__W2A_BRIDGE__) return;
    window.__W2A_BRIDGE__ = true;
    if (window.top !== window.self) return;

    /* ========== تنظیمات ========== */
    const u = window.W2A_CONFIG || {};
    const baseAccent = u.accentColor || '#3b82f6';
    const cfg = {
        bootBackground: u.bootBackground || '#111111',
        bootAccent: u.bootAccent || baseAccent,
        offlineAccent: u.offlineAccent || baseAccent,
        autoUpdate: u.autoUpdate !== false,
        offlineOverlay: u.offlineOverlay !== false,
        killServiceWorker: u.killServiceWorker !== false,
        rootUrl: u.rootUrl || new URL('./', location.href).href,
        texts: Object.assign({
            boot: 'در حال بروزرسانی…',
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

    const BOOT_KEY = '__w2a_booted';

    /* ========== ۱) splash + cache-bust ========== */
    function showSplash() {
        const el = document.createElement('div');
        el.id = '__w2a_boot';
        el.style.cssText =
            'position:fixed;inset:0;z-index:2147483647;display:flex;' +
            'flex-direction:column;align-items:center;justify-content:center;' +
            'background:' + cfg.bootBackground + ';' +
            'font-family:system-ui,-apple-system,"Segoe UI",Vazirmatn,Tahoma,sans-serif;' +
            'direction:rtl;color:#a1a1aa;font-size:13px';
        el.innerHTML =
            '<style>@keyframes __w2a_spin{to{transform:rotate(360deg)}}</style>' +
            '<div style="width:36px;height:36px;margin-bottom:14px;' +
            'border:3px solid rgba(255,255,255,.12);' +
            'border-top-color:' + cfg.bootAccent + ';' +
            'border-radius:50%;animation:__w2a_spin .8s linear infinite"></div>' +
            '<div>' + cfg.texts.boot + '</div>';
        (document.body || document.documentElement).appendChild(el);
    }

    function bootCacheBust() {
        if (!cfg.autoUpdate) return false;

        // آیا در این WebView قبلاً اجرا شده‌ام؟ (اگر بله → ناوبری درون‌اپ است، نه اجرای سرد)
        let booted = false;
        try { booted = !!sessionStorage.getItem(BOOT_KEY); } catch (e) {}
        if (booted) return false;

        // نشانه را قبل از reload ثبت (ضد حلقه)
        try { sessionStorage.setItem(BOOT_KEY, '1'); } catch (e) { return false; }

        // اگر مطمئنیم آفلاینیم، اجبار به رفرش نکن (errorPath خودش handle می‌کند)
        if (navigator.onLine === false) return false;

        const fresh = new URL(location.href);
        fresh.searchParams.set(
            '__v',
            Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7)
        );

        showSplash();
        location.replace(fresh.toString());
        return true;
    }

    /* ========== ۲) دکمه بازگشت ========== */
    function initBack() {
        if (!isNative || !AppPlugin || !AppPlugin.addListener) return;
        AppPlugin.addListener('backButton', info => {
            const canGoBack = info && typeof info.canGoBack === 'boolean'
                ? info.canGoBack : window.history.length > 1;
            if (canGoBack) window.history.back();
            else AppPlugin.exitApp();
        });
    }

    /* ========== ۳) شبکه + overlay ========== */
    let overlay = null;
    let overlayShown = false;

    function ensureOverlay() {
        if (overlay) return overlay;
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

        overlay = document.createElement('div');
        overlay.id = '__w2a_offline';
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.setProperty('--__w2a_accent', cfg.offlineAccent);
        overlay.innerHTML =
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
        document.body.appendChild(overlay);
        overlay.querySelector('#__w2a_retry').addEventListener('click', onRetry);
        return overlay;
    }

    function probeConnection() {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        return fetch(cfg.rootUrl + '?__probe=' + Date.now(), {
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
        if (!overlay) return;
        const btn = overlay.querySelector('#__w2a_retry');
        const hint = overlay.querySelector('.__w2a_hint');
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
        window.addEventListener('online', hideOverlay);
        window.addEventListener('offline', showOverlay);
        if (!navigator.onLine) showOverlay();
    }

    /* ========== راه‌اندازی ========== */
    // اول cache-bust — اگر رفرش کرد، بقیه اجرا نشود
    if (bootCacheBust()) return;

    function initRest() {
        if (cfg.killServiceWorker && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations()
                .then(list => list.forEach(r => r.unregister()))
                .catch(() => {});
        }
        initBack();
        initNetwork();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRest);
    } else {
        initRest();
    }
})();