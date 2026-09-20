importScripts("channel-blocklist.js");

const FILTER_LOG_LIMIT = 80;
const BLOCKLIST_LIMIT = 500;
const YOUTUBE_TAB_URLS = [
  "https://www.youtube.com/*",
  "https://youtube.com/*",
  "https://m.youtube.com/*"
];
const sessionStore = chrome.storage.session;
const RBChannels = globalThis.RBChannelBlocklist;

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

async function readBlockedChannels() {
  const stored = await chrome.storage.local.get(["blockedChannels"]);
  return RBChannels.sanitizeBlockedChannels(stored.blockedChannels);
}

async function fetchYouTubeHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/html" }
    });
    if (!response.ok) return "";
    return await response.text();
  } catch (_err) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function resolveChannelEntry(input) {
  const parsed = RBChannels.parseChannelInput(input);
  if (parsed.error === "empty") {
    return { ok: false, error: "Paste a YouTube channel link, @handle, or channel ID." };
  }
  if (parsed.error === "not-youtube") {
    return { ok: false, error: "That isn't a YouTube link." };
  }

  let fields = RBChannels.mergeChannelFields(parsed);
  const fetchUrl = RBChannels.channelFetchUrl(parsed, input);
  if (fetchUrl) {
    const html = await fetchYouTubeHtml(fetchUrl);
    if (html) {
      fields = RBChannels.mergeChannelFields(
        fields,
        RBChannels.parseChannelFromHtml(html, fetchUrl)
      );
    }
  }

  const entry = RBChannels.normalizeEntry({
    ...fields,
    input: String(input || "").trim(),
    addedAt: Date.now()
  });

  if (!entry) {
    if (parsed.videoId) {
      return {
        ok: false,
        error: "Couldn't find a channel from that video link. Use a channel URL like youtube.com/@name."
      };
    }
    if (parsed.playlistId) {
      return {
        ok: false,
        error: "Couldn't find a channel from that playlist. Use a channel URL like youtube.com/@name."
      };
    }
    if (parsed.error === "not-channel") {
      return { ok: false, error: "Use a channel link like youtube.com/@name." };
    }
    return { ok: false, error: "Couldn't recognize that channel." };
  }

  return { ok: true, entry };
}

async function addBlockedChannel(input) {
  const resolved = await resolveChannelEntry(input);
  if (!resolved.ok) return resolved;

  const list = await readBlockedChannels();
  if (list.some((item) => RBChannels.sameChannel(item, resolved.entry))) {
    return {
      ok: false,
      error: "That channel is already blocked.",
      blockedChannels: list
    };
  }
  if (list.length >= BLOCKLIST_LIMIT) {
    return {
      ok: false,
      error: "Blocklist is full (500 channels).",
      blockedChannels: list
    };
  }

  list.push(resolved.entry);
  await chrome.storage.local.set({ blockedChannels: list });
  return { ok: true, blockedChannels: list, entry: resolved.entry };
}

async function removeBlockedChannel(key) {
  const list = (await readBlockedChannels()).filter((item) => item.key !== key);
  await chrome.storage.local.set({ blockedChannels: list });
  return { ok: true, blockedChannels: list };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "rb-get-state") {
    Promise.all([
      chrome.storage.local.get(["enabled", "language", "blockedChannels"]),
      sessionStore.get(["filterCount"])
    ])
      .then(([localStored, sessionStored]) =>
        sendResponse({
          ...(localStored || {}),
          ...(sessionStored || {}),
          blockedChannels: RBChannels.sanitizeBlockedChannels(
            localStored && localStored.blockedChannels
          )
        })
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

  if (message.type === "rb-add-blocked-channel") {
    addBlockedChannel(message.input)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false, error: "Couldn't add that channel." }));
    return true;
  }

  if (message.type === "rb-remove-blocked-channel") {
    removeBlockedChannel(message.key)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok: false, error: "Couldn't remove that channel." }));
    return true;
  }
});
