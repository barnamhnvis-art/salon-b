/* ============================================================
   native-bridge.js
   منطق مشترک Capacitor در همه صفحات سایت
   ------------------------------------------------------------
   - فقط در محیط Capacitor اجرا می‌شود (window.Capacitor)
   - در مرورگر عادی هیچ اثری ندارد
   - شامل: مدیریت دکمه Back + Overlay آفلاین + رصد شبکه
   ============================================================ */
(function () {
    'use strict';

    /* اگر Capacitor نیست (مرورگر عادی) → خارج شو */
    if (!window.Capacitor) return;

    var Plugins = window.Capacitor.Plugins || {};
    var App = Plugins.App;
    var Network = Plugins.Network;

    /* ============================================================
       1) مدیریت دکمه Back
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
            'position:fixed',
            'top:0',
            'left:0',
            'width:100%',
            'height:100%',
            'background:#111',
            'color:#e8d9a0',
            'z-index:99999',
            'display:flex',
            'flex-direction:column',
            'align-items:center',
            'justify-content:center',
            'text-align:center',
            'padding:20px',
            'font-family:Tahoma,Vazirmatn,sans-serif'
        ].join(';');

        overlay.innerHTML =
            '<div style="font-size:48px;margin-bottom:20px;">📡</div>' +
            '<h2 style="margin:0 0 10px;">اتصال اینترنت برقرار نیست</h2>' +
            '<p style="color:#bdbdbd;margin:0 0 20px;">لطفاً اتصال خود را بررسی کنید.</p>' +
            '<button id="offline-retry-btn" style="background:#c9a227;color:#111;border:0;padding:12px 24px;border-radius:8px;font-weight:600;cursor:pointer;">تلاش مجدد</button>';

        document.body.appendChild(overlay);

        var btn = document.getElementById('offline-retry-btn');
        if (btn) {
            btn.addEventListener('click', function () {
                window.location.reload();
            });
        }
    }

    function hideOfflineOverlay() {
        var overlay = document.getElementById('offline-overlay');
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
    }

    /* ============================================================
       3) رصد شبکه
       ============================================================ */
    if (Network && typeof Network.getStatus === 'function') {
        Network.getStatus().then(function (status) {
            if (!status.connected) showOfflineOverlay();
        }).catch(function () { /* نادیده */ });

        Network.addListener('networkStatusChange', function (status) {
            if (status.connected) {
                hideOfflineOverlay();
            } else {
                showOfflineOverlay();
            }
        });
    }

    /* ============================================================
       4) پاک‌سازی احتمالی Service Worker قدیمی
       ============================================================ */
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
            regs.forEach(function (r) { r.unregister(); });
        }).catch(function () { /* نادیده */ });
    }
})();