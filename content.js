const VIDEO_SELECTORS = [
  "ytd-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-rich-item-renderer",
  "ytd-rich-grid-media",
  "ytd-compact-video-renderer",
  "ytd-playlist-video-renderer",
  "yt-lockup-view-model",
  "ytd-lockup-view-model"
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

const CHANNEL_SELECTORS = [
  "ytd-channel-name #text",
  "#channel-name #text",
  "#channel-info #text",
  "ytd-channel-name a",
  ".yt-content-metadata-view-model__metadata-text",
  ".ytContentMetadataViewModelMetadataRow a",
  "yt-formatted-string.ytd-channel-name"
];

// Soft German genre tags (Statement/Analyse/Ansage/Skandal) only match when used
// like a reaction label after a separator — not as standalone topic words.
const SOFT_GENRE_TAG_RE =
  /(?:[\-|–—|:·•/]|\s\/\/\s)\s*(statement|analyse|ansage|skandal)\b(?:\s*[!?.…💥🔥]*)?\s*$/i;

const DEFAULT_SETTINGS = {
  enabled: true,
  language: "auto",
  filterCount: 0
};

const FILTER_LOG_LIMIT = 80;
const filterStorage = chrome.storage.session || chrome.storage.local;

let keywordsByLanguage = {
  english: [],
  german: [],
  finnish: [],
  swedish: [],
  norwegian: []
};
let settings = { ...DEFAULT_SETTINGS };
let observer = null;
let scanQueued = false;
let incrementCount = true;
let pendingFilterRecords = [];
let flushRecordsPromise = null;

init().catch((error) => {
  console.error("[ReactionBlocker] Failed to start", error);
});

async function init() {
  await loadKeywordsIntoStorage();
  await loadState();
  chrome.storage.onChanged.addListener(onStorageChanged);
  // Keep filterCount in sync if popup/session already has a value.
  const filterStored = await filterStorage.get(["filterCount"]);
  settings.filterCount = Number(filterStored.filterCount) || 0;
  scanAndFilter();
  startObserver();
}

async function loadKeywordsIntoStorage() {
  try {
    const url = chrome.runtime.getURL("data/keywords.json");
    const response = await fetch(url);
    const data = await response.json();
    keywordsByLanguage = sanitizeKeywordMap(data);
    await chrome.storage.local.set({ keywords: keywordsByLanguage });
  } catch (error) {
    console.warn("[ReactionBlocker] Could not load keywords.json", error);
    const stored = await chrome.storage.local.get(["keywords"]);
    if (stored.keywords) keywordsByLanguage = stored.keywords;
  }
}

function sanitizeKeywordMap(data) {
  const map = {};
  Object.keys(data).forEach((key) => {
    if (key.startsWith("_")) return;
    if (Array.isArray(data[key])) {
      map[key] = data[key]
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.toLowerCase());
    }
  });
  return map;
}

async function loadState() {
  const stored = await chrome.storage.local.get([
    "enabled",
    "language",
    "keywords"
  ]);

  settings.enabled = stored.enabled !== false;
  settings.language = stored.language || "auto";

  if (stored.keywords) {
    keywordsByLanguage = stored.keywords;
  }
}

function onStorageChanged(changes, area) {
  if (area !== "local") return;

  if (changes.enabled) {
    settings.enabled = changes.enabled.newValue !== false;
    if (!settings.enabled) {
      restoreHiddenVideos();
    } else {
      scanAndFilter();
    }
  }

  if (changes.language) {
    settings.language = changes.language.newValue || "auto";
    rescanWithoutDoubleCount();
  }

  if (changes.keywords) {
    keywordsByLanguage = changes.keywords.newValue || keywordsByLanguage;
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
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      scanAndFilter();
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function scanAndFilter() {
  if (!settings.enabled) return;

  const phrases = getActiveKeywords();
  if (!phrases.length) return;

  getVideoCards().forEach((videoEl) => {
    if (videoEl.dataset.filtered === "reaction") return;
    if (shouldHideVideo(videoEl, phrases)) {
      hideVideo(videoEl);
    }
  });
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
  const match = title.trim().match(SOFT_GENRE_TAG_RE);
  if (!match) return null;
  return `genre:${match[1].toLowerCase()}`;
}

function hideVideo(videoEl) {
  const target =
    videoEl.closest(
      "ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer"
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

  // Keep console and popup on the same event stream: only record+log when
  // this hide should count (skip silent rescans after language/keyword changes).
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
      const stored = await filterStorage.get(["filterCount", "filteredLog"]);
      let log = Array.isArray(stored.filteredLog) ? stored.filteredLog.slice() : [];
      const seen = new Set(
        log.map((item) => recordKey(item)).filter(Boolean)
      );
      let added = 0;

      for (const entry of batch) {
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

      if (!added) continue;

      log = log.slice(0, FILTER_LOG_LIMIT);
      const next = (Number(stored.filterCount) || 0) + added;
      settings.filterCount = next;
      await filterStorage.set({
        filterCount: next,
        filteredLog: log
      });
    }
  })()
    .catch((error) => {
      console.warn("[ReactionBlocker] Failed to persist filter log", error);
    })
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
  return Object.values(keywordsByLanguage).flat();
}

function detectLanguageKey() {
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("de")) return "german";
  if (nav.startsWith("fi")) return "finnish";
  if (nav.startsWith("sv")) return "swedish";
  if (nav.startsWith("nb") || nav.startsWith("nn") || nav.startsWith("no")) return "norwegian";
  if (nav.startsWith("en")) return "english";
  return "english";
}
