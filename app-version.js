/* ============================================================
   app-version.js
   فقط نسخه را در صفحه نمایش می‌دهد.
   منبع نسخه: window.APP_VERSION (که در خود HTML تعریف شده)
   ============================================================ */
(function () {
    var v = window.APP_VERSION || 'unknown';
    console.log("Salon Manager Version:", v);

    var el = document.getElementById("appVersion");
    if (el) el.textContent = v;
})();