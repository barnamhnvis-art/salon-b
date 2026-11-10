/* ============================================================
   native-bridge.js
   منطق مشترک Capacitor در همه صفحات سایت
   ------------------------------------------------------------
   - فقط در اپ Capacitor اجرا می‌شود (window.Capacitor)
   - در مرورگر عادی هیچ اثری ندارد
   ============================================================ */
(function () {
    'use strict';

    if (!window.Capacitor) return;

    var Plugins = window.Capacitor.Plugins || {};
    var App = Plugins.App;
    var Network = Plugins.Network;

    /* ============================================================
       1) دکمه Back
       ============================================================ */
    if (App && typeof App.addListener === 'function') {
        App.addListener('backButton', function (info) {
            if (info && info.canGoBack) {
                window.history.back();
            } else {
                App.exitApp();
            }
        });
    }

    /* ============================================================
       2) Overlay آفلاین
       ============================================================ */
    function showOfflineOverlay() {
        if (document.getElementById('offline-overlay')) return;

        var overlay = document.createElement('div');
        overlay.id = 'offline-overlay';
        overlay.style.cssText = [
            'position:fixed','top:0','left:0','width:100%','height:100%',
            'background:#111','color:#e8d9a0','z-index:99999',
            'display:flex','flex-direction:column','align-items:center',
            'justify-content:center','text-align:center','padding:20px',
            'font-family:Tahoma,Vazirmatn,sans-serif'
        ].join(';');

        overlay.innerHTML =
            '<div style="font-size:48px;margin-bottom:20px;">📡</div>' +
            '<h2 style="margin:0 0 10px;">اتصال اینترنت برقرار نیست</h2>' +
            '<p style="color:#bdbdbd;margin:0 0 12px;">لطفاً اتصال خود را بررسی کنید.</p>' +
            '<button id="offline-retry-btn" style="background:#c9a227;color:#111;border:0;padding:12px 24px;border-radius:8px;font-weight:600;cursor:pointer;">تلاش مجدد</button>' +
            '<p id="offline-retry-msg" style="color:#ff6b6b;margin-top:14px;font-size:14px;min-height:1em;"></p>';

        document.body.appendChild(overlay);

        var btn = document.getElementById('offline-retry-btn');
        if (btn) btn.addEventListener('click', onRetry);
    }

    function hideOfflineOverlay() {
        var overlay = document.getElementById('offline-overlay');
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    /* «تلاش مجدد» — اول دسترسی را تست می‌کند، بعد reload */
    function onRetry() {
        var btn = document.getElementById('offline-retry-btn');
        var msg = document.getElementById('offline-retry-msg');
        if (!btn) return;

        var originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'در حال بررسی...';
        if (msg) msg.textContent = '';

        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 5000);

        var testUrl = window.location.origin + window.location.pathname;

        fetch(testUrl, { method: 'HEAD', cache: 'no-store', signal: controller.signal })
            .then(function () {
                clearTimeout(timer);
                window.location.reload();
            })
            .catch(function () {
                clearTimeout(timer);
                btn.disabled = false;
                btn.textContent = originalText;
                if (msg) msg.textContent = 'هنوز به سرور دسترسی نیست — دوباره تلاش کنید';
            });
    }

    /* ============================================================
       3) رصد وضعیت شبکه
       ============================================================ */
    if (Network && typeof Network.getStatus === 'function') {
        Network.getStatus().then(function (status) {
            if (!status.connected) showOfflineOverlay();
        }).catch(function () {});

        Network.addListener('networkStatusChange', function (status) {
            if (status.connected) hideOfflineOverlay();
            else showOfflineOverlay();
        });
    }

    /* ============================================================
       4) پاک‌سازی Service Worker قدیمی (اگر وجود داشت)
       ============================================================ */
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
            regs.forEach(function (r) { r.unregister(); });
        }).catch(function () {});
    }

    /* ============================================================
       5) Version-Check + Cache-Bust
       ------------------------------------------------------------
       برای آپدیت خودکار HTML در اپ:
       - app-version.js را با cache-bust می‌خوانیم
       - اگر نسخه سرور با localStorage متفاوت بود → reload با ?_v=
       - لینک‌های داخلی هم ?_v= می‌گیرند
       ============================================================ */
    var VERSION_ENDPOINT = './app-version.js';
    var STORAGE_KEY = 'salon_app_version';
    var QUERY_KEY = '_v';
    var CHECK_THROTTLE_MS = 60 * 1000;

    function getStoredVersion() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }

    function setStoredVersion(v) {
        try { localStorage.setItem(STORAGE_KEY, v); } catch (e) {}
    }

    function rewriteInternalLinks(version) {
        var links = document.querySelectorAll('a[href]');
        for (var i = 0; i < links.length; i++) {
            var a = links[i];
            var raw = a.getAttribute('href');
            if (!raw) continue;
            if (raw.charAt(0) === '#') continue;
            if (/^(mailto:|tel:|javascript:|data:|blob:)/i.test(raw)) continue;

            var u;
            try { u = new URL(raw, window.location.href); } catch (e) { continue; }
            if (u.origin !== window.location.origin) continue;

            u.searchParams.set(QUERY_KEY, version);
            a.setAttribute('href', u.pathname + u.search + u.hash);
        }
    }

    function runVersionCheck(force) {
        /* throttle: در دقیقه فقط یک‌بار (مگر force) */
        var lastCheck = 0;
        try {
            lastCheck = parseInt(sessionStorage.getItem('salon_version_check_ts') || '0', 10);
        } catch (e) {}
        if (!force && lastCheck && (Date.now() - lastCheck < CHECK_THROTTLE_MS)) return;
        try { sessionStorage.setItem('salon_version_check_ts', String(Date.now())); } catch (e) {}

        fetch(VERSION_ENDPOINT + '?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.text(); })
            .then(function (text) {
                var m = text.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
                if (!m) return;

                var serverVersion = m[1];
                var storedVersion = getStoredVersion();

                if (storedVersion === null) {
                    setStoredVersion(serverVersion);
                } else if (storedVersion !== serverVersion) {
                    setStoredVersion(serverVersion);

                    var u = new URL(window.location.href);
                    var oldUrl = u.toString();
                    u.searchParams.set(QUERY_KEY, serverVersion);
                    if (u.toString() !== oldUrl) {
                        window.location.replace(u.toString());
                        return;
                    }
                }

                rewriteInternalLinks(serverVersion);
            })
            .catch(function () {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { runVersionCheck(false); });
    } else {
        runVersionCheck(false);
    }

    /* بیداری از background → force check */
    if (App && typeof App.addListener === 'function') {
        App.addListener('appStateChange', function (state) {
            if (state && state.isActive) runVersionCheck(true);
        });
    }
})();