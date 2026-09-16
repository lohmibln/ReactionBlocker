const enableToggle = document.getElementById("enable-filter");
const filterCountEl = document.getElementById("filter-count");
const languageSelect = document.getElementById("language-select");
const detectedEl = document.getElementById("detected-language");
const settingsBtn = document.getElementById("settings-btn");
const reportBtn = document.getElementById("report-btn");
const versionEl = document.getElementById("version");
const placeholderNote = document.getElementById("placeholder-note");
const filteredListEl = document.getElementById("filtered-list");
const filteredEmptyEl = document.getElementById("filtered-empty");
const groupByChannelEl = document.getElementById("group-by-channel");

const LANGUAGE_LABELS = {
  english: "English",
  german: "German",
  finnish: "Finnish",
  swedish: "Swedish",
  norwegian: "Norwegian",
  japanese: "Japanese",
  romaji: "Japanese (romaji)"
};

const filterStorage = chrome.storage.session || chrome.storage.local;

let filteredLog = [];

initPopup();

async function initPopup() {
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;

  const detectedKey = detectLanguageKey();
  detectedEl.textContent = `Auto-detected: ${LANGUAGE_LABELS[detectedKey] || detectedKey} (${navigator.language})`;

  const stored = await chrome.storage.local.get([
    "enabled",
    "language",
    "groupFilteredByChannel"
  ]);
  const filterStored = await filterStorage.get(["filterCount", "filteredLog"]);

  enableToggle.checked = stored.enabled !== false;
  languageSelect.value = stored.language || "auto";
  filterCountEl.textContent = String(Number(filterStored.filterCount) || 0);
  filteredLog = Array.isArray(filterStored.filteredLog) ? filterStored.filteredLog : [];
  groupByChannelEl.checked = stored.groupFilteredByChannel === true;
  renderFilteredLog();

  if (stored.enabled === undefined) {
    await chrome.storage.local.set({ enabled: true, language: "auto" });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    const isFilterArea =
      area === "session" || (area === "local" && !chrome.storage.session);

    if (isFilterArea) {
      if (changes.filterCount) {
        filterCountEl.textContent = String(Number(changes.filterCount.newValue) || 0);
      }
      if (changes.filteredLog) {
        filteredLog = Array.isArray(changes.filteredLog.newValue)
          ? changes.filteredLog.newValue
          : [];
        renderFilteredLog();
      }
    }

    if (area !== "local") return;
    if (changes.enabled) {
      enableToggle.checked = changes.enabled.newValue !== false;
    }
    if (changes.language) {
      languageSelect.value = changes.language.newValue || "auto";
    }
    if (changes.groupFilteredByChannel) {
      groupByChannelEl.checked = changes.groupFilteredByChannel.newValue === true;
      renderFilteredLog();
    }
  });
}

enableToggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: enableToggle.checked });
});

languageSelect.addEventListener("change", async () => {
  await chrome.storage.local.set({ language: languageSelect.value });
});

groupByChannelEl.addEventListener("change", async () => {
  await chrome.storage.local.set({
    groupFilteredByChannel: groupByChannelEl.checked
  });
  renderFilteredLog();
});

settingsBtn.addEventListener("click", () => {
  showPlaceholder("Settings will land in a later version.");
});

reportBtn.addEventListener("click", () => {
  showPlaceholder("Channel reporting will land in a later version.");
});

function renderFilteredLog() {
  filteredListEl.innerHTML = "";

  if (!filteredLog.length) {
    filteredEmptyEl.hidden = false;
    filteredListEl.hidden = true;
    return;
  }

  filteredEmptyEl.hidden = true;
  filteredListEl.hidden = false;

  if (groupByChannelEl.checked) {
    renderGroupedByChannel(filteredLog);
  } else {
    filteredLog.forEach((entry) => {
      filteredListEl.appendChild(buildEntryItem(entry));
    });
  }
}

function renderGroupedByChannel(entries) {
  const groups = new Map();

  entries.forEach((entry) => {
    const channel = (entry.channel || "").trim() || "Unknown channel";
    if (!groups.has(channel)) groups.set(channel, []);
    groups.get(channel).push(entry);
  });

  const ordered = [...groups.entries()].sort((a, b) => {
    const aAt = Number(a[1][0]?.at) || 0;
    const bAt = Number(b[1][0]?.at) || 0;
    return bAt - aAt;
  });

  ordered.forEach(([channel, items]) => {
    const groupItem = document.createElement("li");
    groupItem.className = "filtered-group";

    const heading = document.createElement("div");
    heading.className = "filtered-group-title";
    heading.textContent = `${channel} (${items.length})`;
    groupItem.appendChild(heading);

    const nested = document.createElement("ul");
    nested.className = "filtered-list nested";
    items.forEach((entry) => {
      nested.appendChild(buildEntryItem(entry, { hideChannel: true }));
    });
    groupItem.appendChild(nested);
    filteredListEl.appendChild(groupItem);
  });
}

function buildEntryItem(entry, options = {}) {
  const item = document.createElement("li");
  item.className = "filtered-item";

  const title = document.createElement("div");
  title.className = "filtered-title";
  title.textContent = entry.title || "(no title)";
  item.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "filtered-meta";
  const bits = [];
  if (!options.hideChannel && entry.channel) bits.push(entry.channel);
  if (entry.keyword) bits.push(`kw: ${entry.keyword}`);
  meta.textContent = bits.join(" · ");
  if (bits.length) item.appendChild(meta);

  return item;
}

function showPlaceholder(message) {
  placeholderNote.hidden = false;
  placeholderNote.textContent = message;
}

function detectLanguageKey() {
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("de")) return "german";
  if (nav.startsWith("fi")) return "finnish";
  if (nav.startsWith("sv")) return "swedish";
  if (nav.startsWith("nb") || nav.startsWith("nn") || nav.startsWith("no")) return "norwegian";
  if (nav.startsWith("ja")) return "japanese";
  if (nav.startsWith("en")) return "english";
  return "english";
}
