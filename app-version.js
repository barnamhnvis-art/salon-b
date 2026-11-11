window.APP_VERSION = "1.0.1";

console.log("Salon Manager Version:", window.APP_VERSION);

var versionElement = document.getElementById("appVersion");
if (versionElement) {
    versionElement.textContent = window.APP_VERSION;
}