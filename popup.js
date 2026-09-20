const enableToggle = document.getElementById("enable-filter");
const filterCountEl = document.getElementById("filter-count");
const languageSelect = document.getElementById("language-select");
const detectedEl = document.getElementById("detected-language");
const settingsBtn = document.getElementById("settings-btn");
const settingsBackBtn = document.getElementById("settings-back");
const mainView = document.getElementById("main-view");
const settingsView = document.getElementById("settings-view");
const reportBtn = document.getElementById("report-btn");
const versionEl = document.getElementById("version");
const placeholderNote = document.getElementById("placeholder-note");
const filteredListEl = document.getElementById("filtered-list");
const filteredEmptyEl = document.getElementById("filtered-empty");
const groupByChannelEl = document.getElementById("group-by-channel");
const pageStatusEl = document.getElementById("page-status");
const blockForm = document.getElementById("block-form");
const blockInput = document.getElementById("block-input");
const blockAddBtn = document.getElementById("block-add-btn");
const blockCurrentBtn = document.getElementById("block-current-btn");
const blockStatusEl = document.getElementById("block-status");
const blockedListEl = document.getElementById("blocked-list");
const blockedEmptyEl = document.getElementById("blocked-empty");

const RBChannels = globalThis.RBChannelBlocklist;

const LANGUAGE_LABELS = {
  english: "English",
  german: "German",
  finnish: "Finnish",
  swedish: "Swedish",
  norwegian: "Norwegian",
  japanese: "Japanese",
  romaji: "Japanese (romaji)"
};

const sessionStore = chrome.storage.session;

let filteredLog = [];
let blockedChannels = [];
let pageChannel = null;

initPopup();

async function initPopup() {
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;

  const detectedKey = detectLanguageKey();
  detectedEl.textContent = `Auto-detected: ${LANGUAGE_LABELS[detectedKey] || detectedKey} (${navigator.language})`;

  const stored = await chrome.storage.local.get([
    "enabled",
    "language",
    "groupFilteredByChannel",
    "blockedChannels"
  ]);
  const filterStored = await sessionStore.get(["filterCount", "filteredLog"]);

  enableToggle.checked = stored.enabled !== false;
  languageSelect.value = stored.language || "auto";
  filterCountEl.textContent = String(Number(filterStored.filterCount) || 0);
  filteredLog = Array.isArray(filterStored.filteredLog) ? filterStored.filteredLog : [];
  groupByChannelEl.checked = stored.groupFilteredByChannel === true;
  blockedChannels = RBChannels.sanitizeBlockedChannels(stored.blockedChannels);
  renderFilteredLog();
  renderBlockedChannels();

  if (stored.enabled === undefined) {
    await chrome.storage.local.set({ enabled: true, language: "auto" });
  }

  await ensureContentScript();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session") {
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
    if (changes.blockedChannels) {
      blockedChannels = RBChannels.sanitizeBlockedChannels(changes.blockedChannels.newValue);
      renderBlockedChannels();
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
  showSettings(true);
});

settingsBackBtn.addEventListener("click", () => {
  showSettings(false);
});

reportBtn.addEventListener("click", () => {
  showPlaceholder("Channel reporting will land in a later version.");
});

blockForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addBlockedChannel(blockInput.value);
});

blockCurrentBtn.addEventListener("click", async () => {
  if (!pageChannel) return;
  const input =
    pageChannel.handle
      ? `https://www.youtube.com/@${pageChannel.handle}`
      : pageChannel.channelId
        ? `https://www.youtube.com/channel/${pageChannel.channelId}`
        : pageChannel.customUrl
          ? `https://www.youtube.com/c/${pageChannel.customUrl}`
          : pageChannel.user
            ? `https://www.youtube.com/user/${pageChannel.user}`
            : pageChannel.name;
  await addBlockedChannel(input);
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

function showSettings(open) {
  mainView.hidden = open;
  settingsView.hidden = !open;
  if (open) {
    renderBlockedChannels();
    updateBlockCurrentButton();
    blockInput.focus();
  }
}

function setBlockStatus(message, kind) {
  if (!message) {
    blockStatusEl.hidden = true;
    blockStatusEl.textContent = "";
    blockStatusEl.className = "hint";
    return;
  }
  blockStatusEl.hidden = false;
  blockStatusEl.textContent = message;
  blockStatusEl.className = `hint ${kind || ""}`.trim();
}

function renderBlockedChannels() {
  blockedListEl.innerHTML = "";
  updateBlockCurrentButton();

  if (!blockedChannels.length) {
    blockedEmptyEl.hidden = false;
    blockedListEl.hidden = true;
    return;
  }

  blockedEmptyEl.hidden = true;
  blockedListEl.hidden = false;

  blockedChannels
    .slice()
    .sort((a, b) => (Number(b.addedAt) || 0) - (Number(a.addedAt) || 0))
    .forEach((entry) => {
      blockedListEl.appendChild(buildBlockedItem(entry));
    });
}

function buildBlockedItem(entry) {
  const item = document.createElement("li");
  item.className = "filtered-item blocked-item";

  const copy = document.createElement("div");
  copy.className = "blocked-copy";

  const title = document.createElement("div");
  title.className = "blocked-title";
  title.textContent = RBChannels.formatChannelLabel(entry);
  copy.appendChild(title);

  const metaText = RBChannels.formatChannelMeta(entry);
  if (metaText) {
    const meta = document.createElement("div");
    meta.className = "filtered-meta";
    meta.textContent = metaText;
    copy.appendChild(meta);
  }

  item.appendChild(copy);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn btn-tiny";
  removeBtn.textContent = "Remove";
  removeBtn.addEventListener("click", () => removeBlockedChannel(entry.key));
  item.appendChild(removeBtn);

  return item;
}

function updateBlockCurrentButton() {
  if (
    !pageChannel ||
    !RBChannels.hasChannelIdentity(pageChannel) ||
    blockedChannels.some((item) => RBChannels.sameChannel(item, pageChannel))
  ) {
    blockCurrentBtn.hidden = true;
    return;
  }

  const label = RBChannels.formatChannelLabel(pageChannel);
  blockCurrentBtn.hidden = false;
  blockCurrentBtn.textContent = `Block ${label} on this page`;
}

async function addBlockedChannel(rawInput) {
  const input = String(rawInput || "").trim();
  if (!input) {
    setBlockStatus("Paste a YouTube channel link, @handle, or channel ID.", "warn");
    blockInput.focus();
    return;
  }

  blockAddBtn.disabled = true;
  blockCurrentBtn.disabled = true;
  setBlockStatus("Looking up channel…");

  try {
    const result = await chrome.runtime.sendMessage({
      type: "rb-add-blocked-channel",
      input
    });
    if (!result?.ok) {
      setBlockStatus(result?.error || "Couldn't add that channel.", "warn");
      if (result?.blockedChannels) {
        blockedChannels = RBChannels.sanitizeBlockedChannels(result.blockedChannels);
        renderBlockedChannels();
      }
      return;
    }

    blockedChannels = RBChannels.sanitizeBlockedChannels(result.blockedChannels);
    blockInput.value = "";
    renderBlockedChannels();
    setBlockStatus(`Blocked ${RBChannels.formatChannelLabel(result.entry)}.`, "ok");
  } catch (_err) {
    setBlockStatus("Couldn't add that channel.", "warn");
  } finally {
    blockAddBtn.disabled = false;
    blockCurrentBtn.disabled = false;
  }
}

async function removeBlockedChannel(key) {
  try {
    const result = await chrome.runtime.sendMessage({
      type: "rb-remove-blocked-channel",
      key
    });
    if (!result?.ok) {
      setBlockStatus(result?.error || "Couldn't remove that channel.", "warn");
      return;
    }
    blockedChannels = RBChannels.sanitizeBlockedChannels(result.blockedChannels);
    renderBlockedChannels();
    setBlockStatus("Channel unblocked. Its videos can show again.", "ok");
  } catch (_err) {
    setBlockStatus("Couldn't remove that channel.", "warn");
  }
}

function showPlaceholder(message) {
  placeholderNote.hidden = false;
  placeholderNote.textContent = message;
}

function setPageStatus(message, kind) {
  if (!message) {
    pageStatusEl.hidden = true;
    pageStatusEl.textContent = "";
    pageStatusEl.className = "status-note";
    return;
  }
  pageStatusEl.hidden = false;
  pageStatusEl.textContent = message;
  pageStatusEl.className = `status-note ${kind || "warn"}`;
}

function isYouTubeUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "www.youtube.com" || host === "youtube.com" || host === "m.youtube.com";
  } catch (_err) {
    return false;
  }
}

async function pingTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "rb-ping" });
  } catch (_err) {
    return null;
  }
}

async function ensureContentScript() {
  pageChannel = null;
  updateBlockCurrentButton();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    setPageStatus("Open a YouTube tab to filter reaction videos.", "warn");
    return;
  }
  if (!isYouTubeUrl(tab.url)) {
    setPageStatus("Open YouTube, then reload this popup. Filtering only runs on youtube.com.", "warn");
    return;
  }

  const info = await pingTab(tab.id);
  if (!info?.ok) {
    setPageStatus(
      "Not running on this tab yet. Hard-refresh YouTube with Ctrl+Shift+R after reloading the extension.",
      "warn"
    );
    return;
  }

  if (!info.keywordCount) {
    setPageStatus("Running, but no keywords loaded. Reload the extension, then refresh YouTube.", "warn");
  } else {
    setPageStatus(`Active on this tab · ${info.keywordCount} phrases loaded.`, "ok");
    chrome.tabs.sendMessage(tab.id, { type: "rb-rescan" }).catch(() => {});
  }

  try {
    const page = await chrome.tabs.sendMessage(tab.id, { type: "rb-get-page-channel" });
    if (page?.ok && page.channel) pageChannel = page.channel;
  } catch (_err) {
    pageChannel = null;
  }
  updateBlockCurrentButton();
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
