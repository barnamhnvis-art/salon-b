/* ============================================================
   native-bridge.js
   منطق مشترک Capacitor در همه صفحات سایت
   فقط در اپ Capacitor اجرا می‌شود؛ در مرورگر عادی بی‌اثر است
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
            if (info && info.canGoBack) window.history.back();
            else App.exitApp();
        });
    }

    /* ============================================================
       2) Overlay آفلاین
       ============================================================ */
    function showOfflineOverlay() {
        if (document.getElementById('offline-overlay')) return;
        var ov = document.createElement('div');
        ov.id = 'offline-overlay';
        ov.style.cssText = [
            'position:fixed','top:0','left:0','width:100%','height:100%',
            'background:#111','color:#e8d9a0','z-index:99999',
            'display:flex','flex-direction:column','align-items:center',
            'justify-content:center','text-align:center','padding:20px',
            'font-family:Tahoma,Vazirmatn,sans-serif'
        ].join(';');
        ov.innerHTML =
            '<div style="font-size:48px;margin-bottom:20px;">📡</div>' +
            '<h2 style="margin:0 0 10px;">اتصال اینترنت برقرار نیست</h2>' +
            '<p style="color:#bdbdbd;margin:0 0 12px;">لطفاً اتصال خود را بررسی کنید.</p>' +
            '<button id="offline-retry-btn" style="background:#c9a227;color:#111;border:0;padding:12px 24px;border-radius:8px;font-weight:600;cursor:pointer;">تلاش مجدد</button>' +
            '<p id="offline-retry-msg" style="color:#ff6b6b;margin-top:14px;font-size:14px;min-height:1em;"></p>';
        document.body.appendChild(ov);
        var btn = document.getElementById('offline-retry-btn');
        if (btn) btn.addEventListener('click', onRetry);
    }

    function hideOfflineOverlay() {
        var ov = document.getElementById('offline-overlay');
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    }

    /* «تلاش مجدد» — اول دسترسی را تست می‌کند، بعد reload */
    function onRetry() {
        var btn = document.getElementById('offline-retry-btn');
        var msg = document.getElementById('offline-retry-msg');
        if (!btn) return;
        var orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'در حال بررسی...';
        if (msg) msg.textContent = '';
        var ctrl = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, 5000);
        fetch(window.location.origin + window.location.pathname,
            { method: 'HEAD', cache: 'no-store', signal: ctrl.signal })
            .then(function () { clearTimeout(timer); window.location.reload(); })
            .catch(function () {
                clearTimeout(timer);
                btn.disabled = false;
                btn.textContent = orig;
                if (msg) msg.textContent = 'هنوز به سرور دسترسی نیست — دوباره تلاش کنید';
            });
    }

    /* ============================================================
       3) رصد شبکه
       ============================================================ */
    if (Network && typeof Network.getStatus === 'function') {
        Network.getStatus().then(function (s) {
            if (!s.connected) showOfflineOverlay();
        }).catch(function () {});
        Network.addListener('networkStatusChange', function (s) {
            if (s.connected) hideOfflineOverlay();
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
       - window.APP_VERSION = نسخه‌ی HTMLی که الان اجرا شده (از خود HTML)
       - version.json      = نسخه‌ی واقعی روی سرور (fetch با cache-bust)
       - اگر متفاوت  → HTML قدیمی از کش آمده → reload با ?_v=<server>
       - اگر مساوی   → همه چیز تازه است → فقط لینک‌ها را آماده کن
       ============================================================ */
    var VERSION_ENDPOINT = './version.json';
    var QUERY_KEY = '_v';
    var CHECK_THROTTLE_MS = 60 * 1000;

    function getUrlVersion() {
        try { return new URL(window.location.href).searchParams.get(QUERY_KEY); }
        catch (e) { return null; }
    }

    function reloadWithVersion(version) {
        var u = new URL(window.location.href);
        u.searchParams.set(QUERY_KEY, version);
        /* محافظ ضد loop: اگر URL همین الان همین است، ریلود نکن */
        if (u.toString() === window.location.href) return false;
        window.location.replace(u.toString());
        return true;
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
        /* throttle: در هر دقیقه فقط یک‌بار (مگر force) */
        var last = 0;
        try { last = parseInt(sessionStorage.getItem('sv_ts') || '0', 10); } catch (e) {}
        if (!force && last && (Date.now() - last < CHECK_THROTTLE_MS)) return;
        try { sessionStorage.setItem('sv_ts', String(Date.now())); } catch (e) {}

        fetch(VERSION_ENDPOINT + '?t=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var serverVersion = data && data.version;
                if (!serverVersion) return;

                var displayed = window.APP_VERSION || getUrlVersion();

                if (displayed && displayed !== serverVersion) {
                    reloadWithVersion(serverVersion);
                    return;
                }
                rewriteInternalLinks(serverVersion);
            })
            .catch(function () { /* آفلاین یا خطا — رد شو */ });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { runVersionCheck(false); });
    } else {
        runVersionCheck(false);
    }

    /* بیداری اپ از background → force check */
    if (App && typeof App.addListener === 'function') {
        App.addListener('appStateChange', function (s) {
            if (s && s.isActive) runVersionCheck(true);
        });
    }
})();