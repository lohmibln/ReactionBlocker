(() => {
const RB_VERSION = "1.1.6";

if (globalThis.__reactionBlockerVersion === RB_VERSION) {
  if (typeof globalThis.__reactionBlockerRescan === "function") {
    globalThis.__reactionBlockerRescan();
  }
  return;
}
if (typeof globalThis.__reactionBlockerCleanup === "function") {
  globalThis.__reactionBlockerCleanup();
}
globalThis.__reactionBlockerVersion = RB_VERSION;

const VIDEO_SELECTORS = [
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-rich-item-renderer",
  "ytd-rich-grid-media",
  "ytd-compact-video-renderer",
  "ytd-playlist-video-renderer",
  "yt-lockup-view-model",
  "ytd-lockup-view-model",
  "ytd-reel-item-renderer",
  "ytd-shorts-lockup-view-model",
  ".ytLockupViewModelHost",
  ".ytLockupViewModelWrapper"
];

const TITLE_SELECTORS = [
  "#video-title",
  "a#video-title-link",
  "#title-wrapper h3 a",
  "h3 a#video-title",
  "h3 a[href*='/watch']",
  "h3 a[href*='/shorts']",
  "a.ytLockupMetadataViewModelTitle",
  "a.yt-lockup-metadata-view-model__title",
  ".ytLockupMetadataViewModelTitle",
  ".yt-lockup-metadata-view-model__title",
  ".yt-lockup-metadata-view-model-wiz__title",
  "h3 .yt-core-attributed-string",
  "h3 yt-formatted-string",
  "#video-title-link"
];

const WATCH_TITLE_SELECTORS = [
  "ytd-watch-metadata h1 yt-formatted-string",
  "ytd-watch-metadata h1",
  "#title h1 yt-formatted-string",
  "#title h1",
  "ytd-watch-flexy #title h1"
];

const CHANNEL_SELECTORS = [
  "ytd-channel-name #text",
  "#channel-name #text",
  "#channel-info #text",
  "ytd-channel-name a",
  ".yt-content-metadata-view-model__metadata-text",
  ".ytContentMetadataViewModelMetadataRow a",
  "yt-formatted-string.ytd-channel-name"
];

const DEFAULT_SETTINGS = {
  enabled: true,
  language: "auto",
  filterCount: 0
};

let keywordsByLanguage = {
  english: [],
  german: [],
  finnish: [],
  swedish: [],
  norwegian: [],
  japanese: [],
  romaji: []
};
let softCompoundsByLanguage = {};
let softGenreTagRegex = null;
let settings = { ...DEFAULT_SETTINGS };
let observer = null;
let scanQueued = false;
let readyToFilter = false;
let incrementCount = true;
let pendingFilterRecords = [];
let flushRecordsPromise = null;
let scanBurstTimer = null;
let heartbeatTimer = null;
let lastUrl = location.href;
const allowWatchIds = new Set();
const loggedWatchIds = new Set();
let onMessage = null;
let onNavigate = null;
let onPopState = null;

startObserver();
watchSpaNavigation();
applyBundledKeywords();
readyToFilter = true;
scheduleScanBurst();
init().catch(() => {});

function applyBundledKeywords() {
  if (globalThis.__RB_HARD_KEYWORDS) applyKeywordData(globalThis.__RB_HARD_KEYWORDS);
  if (globalThis.__RB_SOFT_KEYWORDS) applySoftKeywords(globalThis.__RB_SOFT_KEYWORDS);
}

async function init() {
  const stored = await bgRequest({ type: "rb-get-state" });
  if (!stored || typeof stored !== "object") return;

  settings.enabled = stored.enabled !== false;
  settings.language = stored.language || "auto";
  settings.filterCount = Number(stored.filterCount) || 0;

  if (!settings.enabled) {
    restoreHiddenVideos();
    removeWatchOverlay();
  } else {
    scheduleScanBurst();
  }
}

function extensionAlive() {
  try {
    return Boolean(typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id);
  } catch (_err) {
    return false;
  }
}

function bgRequest(message) {
  return new Promise((resolve) => {
    if (!extensionAlive()) {
      resolve(null);
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        void chrome.runtime.lastError;
        resolve(response || null);
      });
    } catch (_err) {
      resolve(null);
    }
  });
}

function applyKeywordData(data) {
  keywordsByLanguage = sanitizeKeywordMap(data);
}

function applySoftKeywords(soft) {
  softCompoundsByLanguage = sanitizeSoftPhraseMap(soft && soft.compounds);
  softGenreTagRegex = buildSoftGenreTagRegex(
    flattenSoftGenreTags(soft && soft.genreTags)
  );
}

function sanitizeKeywordMap(data) {
  const map = {};
  Object.keys(data || {}).forEach((key) => {
    if (key.startsWith("_") || key === "soft") return;
    if (Array.isArray(data[key])) {
      map[key] = data[key]
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.toLowerCase());
    }
  });
  return map;
}

function sanitizeSoftPhraseMap(obj) {
  const map = {};
  if (!obj || typeof obj !== "object") return map;
  Object.keys(obj).forEach((key) => {
    if (!Array.isArray(obj[key])) return;
    map[key] = obj[key]
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.toLowerCase().trim());
  });
  return map;
}

function flattenSoftGenreTags(obj) {
  const tags = [];
  const map = sanitizeSoftPhraseMap(obj);
  Object.values(map).forEach((list) => tags.push(...list));
  return [...new Set(tags)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSoftGenreTagRegex(tags) {
  if (!tags.length) return null;
  const parts = tags
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((tag) => escapeRegExp(tag).replace(/\s+/g, "\\s+"));
  return new RegExp(
    "(?:[\\-|–—|:·•/]|\\s\\/\\/\\s)\\s*(" +
      parts.join("|") +
      ")(?:\\s*[!?.…💥🔥]*)?\\s*$",
    "i"
  );
}

function onStorageChanged(changes, area) {
  if (area !== "local") return;

  if (changes.enabled) {
    settings.enabled = changes.enabled.newValue !== false;
    if (!settings.enabled) {
      restoreHiddenVideos();
      removeWatchOverlay();
    } else {
      scheduleScanBurst();
    }
  }

  if (changes.language) {
    settings.language = changes.language.newValue || "auto";
    rescanWithoutDoubleCount();
  }
}

function rescanWithoutDoubleCount() {
  incrementCount = false;
  restoreHiddenVideos();
  if (settings.enabled) scanAndFilter();
  incrementCount = true;
}

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver(() => {
    queueScan();
  });

  // Titles often land via aria-label/title after the card node already exists;
  // childList-only observation misses that and waits until scroll adds nodes.
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["title", "aria-label", "href"]
  });
}

function watchSpaNavigation() {
  onNavigate = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    scheduleScanBurst();
  };

  onPopState = onNavigate;
  window.addEventListener("yt-navigate-finish", onNavigate, true);
  window.addEventListener("popstate", onPopState);
  // Fallback when YouTube mutates history without firing yt-navigate-finish promptly.
  // Also re-scan so late title hydration is not missed after the first burst.
  heartbeatTimer = setInterval(() => {
    onNavigate();
    if (readyToFilter && settings.enabled) scanAndFilter();
  }, 1000);
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(() => {
    scanQueued = false;
    scanAndFilter();
  });
}

function scheduleScanBurst() {
  if (!readyToFilter) return;
  scanAndFilter();

  if (scanBurstTimer) {
    clearInterval(scanBurstTimer);
    scanBurstTimer = null;
  }

  let attempts = 0;
  const maxAttempts = 40; // ~4s at 100ms — covers search result hydration after reload
  scanBurstTimer = setInterval(() => {
    attempts += 1;
    scanAndFilter();
    if (attempts >= maxAttempts) {
      clearInterval(scanBurstTimer);
      scanBurstTimer = null;
    }
  }, 100);
}

function scanAndFilter() {
  if (!readyToFilter || !settings.enabled) {
    removeWatchOverlay();
    return;
  }

  const phrases = getActiveKeywords();
  if (!phrases.length) return;

  getVideoCards().forEach((videoEl) => {
    if (videoEl.dataset.filtered === "reaction") return;
    if (shouldHideVideo(videoEl, phrases)) {
      hideVideo(videoEl);
    }
  });

  scanWatchPage(phrases);
}

function getVideoCards() {
  const selector = VIDEO_SELECTORS.join(", ");
  return [...document.querySelectorAll(selector)].filter((el) => {
    const parentCard = el.parentElement && el.parentElement.closest(selector);
    return !parentCard;
  });
}

function shouldHideVideo(videoEl, phrases) {
  const title = extractTitle(videoEl);
  const channel = extractChannel(videoEl);

  if (!title) return false;

  const matched = findMatchingKeyword(title, phrases);
  if (matched) {
    videoEl.dataset.rbMatch = matched;
    videoEl.dataset.rbChannel = channel;
    return true;
  }

  return false;
}

function extractTitle(card) {
  const fromSelectors = getTextFromSelectors(card, TITLE_SELECTORS);
  if (fromSelectors) return fromSelectors;

  const links = queryAllDeep(card, "a[href*='/watch'], a[href*='/shorts/']");
  for (const link of links) {
    const labeled =
      attrText(link, "title") ||
      attrText(link, "aria-label") ||
      (link.textContent || "").trim();
    if (labeled && labeled.length > 2 && !/^(\d+:)?\d{1,2}:\d{2}$/.test(labeled)) {
      return labeled;
    }
  }

  const heading = queryFirstDeep(card, ["h3"]);
  if (heading) {
    const text =
      attrText(heading, "aria-label") ||
      attrText(heading.querySelector("a"), "title") ||
      (heading.textContent || "").trim();
    if (text) return text;
  }

  return "";
}

function extractChannel(card) {
  return getTextFromSelectors(card, CHANNEL_SELECTORS);
}

function extractVideoId(card) {
  const links = queryAllDeep(card, "a[href*='/watch'], a[href*='/shorts/']");
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const watchMatch = href.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
    if (watchMatch) return watchMatch[1];
    const shortsMatch = href.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/);
    if (shortsMatch) return shortsMatch[1];
  }
  return "";
}

function getTextFromSelectors(root, selectors) {
  for (const selector of selectors) {
    const node = queryFirstDeep(root, [selector]);
    if (!node) continue;
    const text =
      (node.textContent || "").trim() ||
      attrText(node, "title") ||
      attrText(node, "aria-label");
    if (text) return text;
  }
  return "";
}

function attrText(node, name) {
  if (!node || !node.getAttribute) return "";
  return (node.getAttribute(name) || "").trim();
}

function queryFirstDeep(root, selectors) {
  for (const selector of selectors) {
    try {
      const found = root.querySelector(selector);
      if (found) return found;
    } catch (_err) {
      // ignore
    }
  }

  const children = root.querySelectorAll("*");
  for (const el of children) {
    if (!el.shadowRoot) continue;
    const nested = queryFirstDeep(el.shadowRoot, selectors);
    if (nested) return nested;
  }
  return null;
}

function queryAllDeep(root, selector) {
  const matches = [];
  try {
    matches.push(...root.querySelectorAll(selector));
  } catch (_err) {
    return matches;
  }
  root.querySelectorAll("*").forEach((el) => {
    if (el.shadowRoot) {
      matches.push(...queryAllDeep(el.shadowRoot, selector));
    }
  });
  return matches;
}

function findMatchingKeyword(title, phrases) {
  const haystack = title.toLowerCase();
  for (const phrase of phrases) {
    if (phrase && haystack.includes(phrase)) return phrase;
  }

  const soft = matchSoftGenreTag(title);
  if (soft) return soft;

  return null;
}

function matchSoftGenreTag(title) {
  if (!softGenreTagRegex) return null;
  const match = title.trim().match(softGenreTagRegex);
  if (!match) return null;
  return `genre:${match[1].toLowerCase()}`;
}

function hideVideo(videoEl) {
  const target =
    videoEl.closest(
      "ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, yt-lockup-view-model"
    ) || videoEl;
  target.style.setProperty("display", "none", "important");
  target.dataset.filtered = "reaction";
  if (target !== videoEl) {
    videoEl.dataset.filtered = "reaction";
  }

  const title = extractTitle(videoEl);
  const channel = extractChannel(videoEl) || videoEl.dataset.rbChannel || "";
  const match = videoEl.dataset.rbMatch || "";
  const videoId = extractVideoId(videoEl);

  if (incrementCount) {
    const entry = {
      title,
      channel,
      keyword: match,
      videoId,
      at: Date.now()
    };
    console.log("[ReactionBlocker] Filtered:", {
      title: entry.title,
      channel: entry.channel,
      keyword: entry.keyword
    });
    enqueueFilterRecord(entry);
  }
}

function restoreHiddenVideos() {
  document.querySelectorAll('[data-filtered="reaction"]').forEach((el) => {
    el.style.removeProperty("display");
    delete el.dataset.filtered;
    delete el.dataset.rbMatch;
    delete el.dataset.rbChannel;
  });
}

function enqueueFilterRecord(entry) {
  pendingFilterRecords.push(entry);
  flushFilterRecords();
}

function flushFilterRecords() {
  if (flushRecordsPromise) return flushRecordsPromise;

  flushRecordsPromise = (async () => {
    while (pendingFilterRecords.length) {
      const batch = pendingFilterRecords.splice(0, pendingFilterRecords.length);
      const result = await bgRequest({
        type: "rb-log-filters",
        entries: batch
      });
      if (result && result.filterCount != null) {
        settings.filterCount = result.filterCount;
      }
    }
  })()
    .catch(() => {})
    .finally(() => {
      flushRecordsPromise = null;
      if (pendingFilterRecords.length) flushFilterRecords();
    });

  return flushRecordsPromise;
}

function recordKey(entry) {
  if (!entry) return "";
  if (entry.videoId) return `id:${entry.videoId}`;
  const title = (entry.title || "").trim().toLowerCase();
  const channel = (entry.channel || "").trim().toLowerCase();
  if (!title) return "";
  return `t:${title}|c:${channel}`;
}

function getActiveKeywords() {
  return [
    ...Object.values(keywordsByLanguage).flat(),
    ...Object.values(softCompoundsByLanguage).flat()
  ];
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

function scanWatchPage(phrases) {
  if (!location.pathname.startsWith("/watch")) {
    removeWatchOverlay();
    return;
  }

  const videoId = new URLSearchParams(location.search).get("v") || "";
  if (videoId && allowWatchIds.has(videoId)) {
    removeWatchOverlay();
    return;
  }

  const title = extractWatchTitle();
  if (!title) return;

  const matched = findMatchingKeyword(title, phrases);
  if (!matched) {
    removeWatchOverlay();
    return;
  }

  showWatchOverlay(title, matched, videoId);
}

function extractWatchTitle() {
  for (const selector of WATCH_TITLE_SELECTORS) {
    const node = document.querySelector(selector);
    const text = node && (node.textContent || "").trim();
    if (text) return text;
  }
  return "";
}

function pauseWatchPlayer() {
  document.querySelectorAll("video").forEach((video) => {
    try {
      video.pause();
    } catch (_err) {
      // ignore
    }
  });
}

function showWatchOverlay(title, matched, videoId) {
  pauseWatchPlayer();

  let overlay = document.getElementById("rb-watch-block");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "rb-watch-block";
    overlay.setAttribute("role", "dialog");
    overlay.innerHTML =
      '<div class="rb-watch-card">' +
      "<strong>ReactionBlocker hid this video</strong>" +
      '<p data-rb-title></p>' +
      '<p class="rb-watch-kw">Matched: <span data-rb-kw></span></p>' +
      '<button type="button" data-rb-allow>Show anyway</button>' +
      "</div>";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.78);font-family:Segoe UI,Arial,sans-serif;";
    const card = overlay.querySelector(".rb-watch-card");
    card.style.cssText =
      "max-width:520px;width:100%;background:#1c1c1c;color:#f1f1f1;border:1px solid #2f2f2f;border-radius:12px;padding:20px;text-align:center;";
    overlay.querySelector("strong").style.cssText = "font-size:16px;display:block;margin-bottom:10px;";
    overlay.querySelector("[data-rb-title]").style.cssText =
      "margin:0 0 8px;font-size:14px;line-height:1.4;";
    overlay.querySelector(".rb-watch-kw").style.cssText =
      "margin:0 0 16px;font-size:12px;color:#aaa;";
    const allowBtn = overlay.querySelector("[data-rb-allow]");
    allowBtn.style.cssText =
      "background:#cc0000;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;";
    allowBtn.addEventListener("click", () => {
      const id = overlay.dataset.videoId;
      if (id) allowWatchIds.add(id);
      removeWatchOverlay();
    });
    document.documentElement.appendChild(overlay);
  }

  overlay.dataset.videoId = videoId;
  overlay.querySelector("[data-rb-title]").textContent = title;
  overlay.querySelector("[data-rb-kw]").textContent = matched;
  overlay.style.display = "flex";

  if (incrementCount && videoId && !loggedWatchIds.has(videoId)) {
    loggedWatchIds.add(videoId);
    const channel =
      (
        document.querySelector("ytd-video-owner-renderer #channel-name a") ||
        document.querySelector("#owner #channel-name a") ||
        {}
      ).textContent || "";
    console.log("[ReactionBlocker] Blocked watch page:", { title, keyword: matched });
    enqueueFilterRecord({
      title,
      channel: channel.trim(),
      keyword: matched,
      videoId,
      at: Date.now()
    });
  }
}

function removeWatchOverlay() {
  const overlay = document.getElementById("rb-watch-block");
  if (overlay) overlay.remove();
}

function onRuntimeMessage(message, _sender, sendResponse) {
  if (!message || typeof message !== "object") return;

  if (message.type === "rb-ping") {
    sendResponse({
      ok: true,
      version: RB_VERSION,
      enabled: settings.enabled,
      ready: readyToFilter,
      keywordCount: getActiveKeywords().length
    });
    return true;
  }

  if (message.type === "rb-rescan") {
    scheduleScanBurst();
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "rb-storage-changed") {
    onStorageChanged(message.changes || {}, "local");
    sendResponse({ ok: true });
    return true;
  }
}

onMessage = onRuntimeMessage;
try {
  if (extensionAlive()) {
    chrome.runtime.onMessage.addListener(onMessage);
  }
} catch (_err) {
  // Ignore if this frame cannot use extension messaging.
}

globalThis.__reactionBlockerRescan = () => {
  scheduleScanBurst();
};

globalThis.__reactionBlockerCleanup = () => {
  if (observer) observer.disconnect();
  if (scanBurstTimer) clearInterval(scanBurstTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (onNavigate) window.removeEventListener("yt-navigate-finish", onNavigate, true);
  if (onPopState) window.removeEventListener("popstate", onPopState);
  if (onMessage) chrome.runtime.onMessage.removeListener(onMessage);
  removeWatchOverlay();
};
})();
