const APP_VERSION = "1.0.0";

console.log("Salon Manager Version:", APP_VERSION);

const versionElement = document.getElementById("appVersion");


if (versionElement) {
    versionElement.textContent = APP_VERSION;
}