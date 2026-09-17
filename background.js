const FILTER_LOG_LIMIT = 80;
const YOUTUBE_TAB_URLS = [
  "https://www.youtube.com/*",
  "https://youtube.com/*",
  "https://m.youtube.com/*"
];
const sessionStore = chrome.storage.session;

function recordKey(entry) {
  if (!entry) return "";
  if (entry.videoId) return `id:${entry.videoId}`;
  const title = (entry.title || "").trim().toLowerCase();
  const channel = (entry.channel || "").trim().toLowerCase();
  if (!title) return "";
  return `t:${title}|c:${channel}`;
}

function badgeText(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  if (n > 999) return "999+";
  return String(n);
}

async function setBadge(count) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#cc0000" });
    try {
      await chrome.action.setBadgeTextColor({ color: "#ffffff" });
    } catch (_err) {
      // Older Chrome has no badge text color API.
    }
    await chrome.action.setBadgeText({ text: badgeText(count) });
  } catch (_err) {
    // Ignore if the action is not available yet.
  }
}

async function appendFilterLog(entries) {
  const stored = await sessionStore.get(["filterCount", "filteredLog"]);
  let log = Array.isArray(stored.filteredLog) ? stored.filteredLog.slice() : [];
  const seen = new Set(log.map((item) => recordKey(item)).filter(Boolean));
  let added = 0;

  for (const entry of entries || []) {
    const key = recordKey(entry);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    log.unshift({
      title: entry.title || "",
      channel: entry.channel || "",
      keyword: entry.keyword || "",
      videoId: entry.videoId || "",
      at: entry.at || Date.now()
    });
    added += 1;
  }

  const current = Number(stored.filterCount) || 0;
  if (!added) {
    return { filterCount: current };
  }

  log = log.slice(0, FILTER_LOG_LIMIT);
  const next = current + added;
  await sessionStore.set({
    filterCount: next,
    filteredLog: log
  });
  await setBadge(next);
  return { filterCount: next };
}

function broadcastToYouTube(payload) {
  chrome.tabs.query({ url: YOUTUBE_TAB_URLS }, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove(["filterCount", "filteredLog"]);
  setBadge(0);
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.local.remove(["filterCount", "filteredLog"]);
  await setBadge(0);
});

sessionStore.get(["filterCount"]).then((stored) => {
  setBadge(stored.filterCount);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.filterCount) {
    setBadge(changes.filterCount.newValue);
  }
  if (area === "local") {
    broadcastToYouTube({ type: "rb-storage-changed", changes });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "rb-get-state") {
    Promise.all([
      chrome.storage.local.get(["enabled", "language"]),
      sessionStore.get(["filterCount"])
    ])
      .then(([localStored, sessionStored]) =>
        sendResponse({ ...(localStored || {}), ...(sessionStored || {}) })
      )
      .catch(() => sendResponse({}));
    return true;
  }

  if (message.type === "rb-log-filters") {
    appendFilterLog(message.entries)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ filterCount: 0 }));
    return true;
  }
});
