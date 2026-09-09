/**
 * ReactionBlocker popup
 *
 * FUTURE: Settings will open keyword / whitelist / block-list editors.
 * FUTURE: "Report a channel" will write into communityReports.json (or
 *   a remote endpoint) after local confirmation.
 */

const enableToggle = document.getElementById("enable-filter");
const filterCountEl = document.getElementById("filter-count");
const languageSelect = document.getElementById("language-select");
const detectedEl = document.getElementById("detected-language");
const settingsBtn = document.getElementById("settings-btn");
const reportBtn = document.getElementById("report-btn");
const versionEl = document.getElementById("version");
const placeholderNote = document.getElementById("placeholder-note");

const LANGUAGE_LABELS = {
  english: "English",
  german: "German"
};

initPopup();

async function initPopup() {
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;

  const detectedKey = detectLanguageKey();
  detectedEl.textContent = `Auto-detected: ${LANGUAGE_LABELS[detectedKey] || detectedKey} (${navigator.language})`;

  const stored = await chrome.storage.local.get(["enabled", "language", "filterCount"]);
  enableToggle.checked = stored.enabled !== false;
  languageSelect.value = stored.language || "auto";
  filterCountEl.textContent = String(Number(stored.filterCount) || 0);

  if (stored.enabled === undefined) {
    await chrome.storage.local.set({ enabled: true, language: "auto" });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (changes.filterCount) {
      filterCountEl.textContent = String(Number(changes.filterCount.newValue) || 0);
    }
    if (area !== "local") return;
    if (changes.enabled) {
      enableToggle.checked = changes.enabled.newValue !== false;
    }
    if (changes.language) {
      languageSelect.value = changes.language.newValue || "auto";
    }
  });
}

enableToggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: enableToggle.checked });
});

languageSelect.addEventListener("change", async () => {
  await chrome.storage.local.set({ language: languageSelect.value });
});

settingsBtn.addEventListener("click", () => {
  // FUTURE: open settings page (keywords, whitelistChannels.json, blockedChannels.json)
  showPlaceholder("Settings will land in a later version.");
});

reportBtn.addEventListener("click", () => {
  // FUTURE: collect current channel and append to communityReports.json
  showPlaceholder("Channel reporting will land in a later version.");
});

function showPlaceholder(message) {
  placeholderNote.hidden = false;
  placeholderNote.textContent = message;
}

function detectLanguageKey() {
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("de")) return "german";
  if (nav.startsWith("en")) return "english";
  return "english";
}
