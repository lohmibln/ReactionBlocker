(() => {
  const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/;
  const CHANNEL_ID_FIND_RE = /UC[a-zA-Z0-9_-]{22}/;
  const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be"
  ]);

  function isYouTubeHost(hostname) {
    const host = String(hostname || "")
      .trim()
      .toLowerCase()
      .replace(/\.$/, "");
    return YOUTUBE_HOSTS.has(host);
  }

  function decodeHtml(value) {
    return String(value || "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  function unescapeJson(value) {
    if (!value) return "";
    try {
      return JSON.parse('"' + value + '"');
    } catch (_err) {
      return String(value).replace(/\\u0026/g, "&").replace(/\\\//g, "/");
    }
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(String(value || ""));
    } catch (_err) {
      return String(value || "");
    }
  }

  function coerceYouTubeUrl(input) {
    let text = String(input || "").trim();
    if (!text) return null;

    if (
      text.startsWith("/@") ||
      text.startsWith("/channel/") ||
      text.startsWith("/c/") ||
      text.startsWith("/user/") ||
      text.startsWith("/playlist")
    ) {
      text = "https://www.youtube.com" + text;
    }

    if (!/^https?:\/\//i.test(text)) {
      if (
        /^(www\.)?(youtube\.com|m\.youtube\.com|music\.youtube\.com|youtu\.be)\//i.test(text)
      ) {
        text = "https://" + text;
      } else {
        return null;
      }
    }

    try {
      const url = new URL(text);
      if (!isYouTubeHost(url.hostname)) return null;
      return url;
    } catch (_err) {
      return null;
    }
  }

  function extractChannelFromPath(pathname) {
    const parts = String(pathname || "").split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (part.startsWith("@") && part.length > 1) {
        return { handle: safeDecode(part.slice(1)).toLowerCase() };
      }
      if (part === "channel" && parts[i + 1]) {
        const idMatch = parts[i + 1].match(CHANNEL_ID_FIND_RE);
        if (idMatch) return { channelId: idMatch[0] };
      }
      if (part === "c" && parts[i + 1]) {
        return { customUrl: safeDecode(parts[i + 1]).toLowerCase() };
      }
      if (part === "user" && parts[i + 1]) {
        return { user: safeDecode(parts[i + 1]).toLowerCase() };
      }
    }
    return null;
  }

  function isVideoPath(pathname) {
    const path = String(pathname || "").toLowerCase();
    if (path.startsWith("/watch")) return true;
    if (/^\/shorts\/[a-z0-9_-]+/i.test(path)) return true;
    if (/^\/embed\/[a-z0-9_-]+/i.test(path)) return true;
    if (/^\/live\/[a-z0-9_-]+/i.test(path)) return true;
    return false;
  }

  function isChannelHref(href) {
    if (!href) return false;
    const raw = String(href).trim();
    if (!raw || raw.startsWith("javascript:")) return false;
    const url = coerceYouTubeUrl(raw);
    const path = url ? url.pathname : raw;
    if (isVideoPath(path)) return false;
    return Boolean(extractChannelFromPath(path));
  }

  function parseYouTubeUrl(url) {
    const fromPath = extractChannelFromPath(url.pathname);
    if (fromPath) return fromPath;

    const parts = url.pathname.split("/").filter(Boolean);
    const first = parts[0] || "";
    const second = parts[1] || "";

    if (first === "watch") {
      const videoId = url.searchParams.get("v") || "";
      return videoId ? { videoId } : { error: "not-channel" };
    }

    if ((first === "shorts" || first === "embed" || first === "live") && second) {
      return { videoId: second.replace(/[^a-zA-Z0-9_-]/g, "") };
    }

    if (first === "playlist") {
      const list = url.searchParams.get("list") || "";
      return list ? { playlistId: list } : { error: "not-channel" };
    }

    if (url.hostname.replace(/^www\./i, "").toLowerCase() === "youtu.be" && first) {
      return { videoId: first.replace(/[^a-zA-Z0-9_-]/g, "") };
    }

    return { error: "not-channel" };
  }

  function emptyParsed() {
    return {
      handle: "",
      channelId: "",
      customUrl: "",
      user: "",
      name: "",
      videoId: "",
      playlistId: ""
    };
  }

  function canonicalChannelUrl(entry) {
    if (!entry) return "";
    if (entry.handle) return "https://www.youtube.com/@" + entry.handle;
    if (entry.channelId) return "https://www.youtube.com/channel/" + entry.channelId;
    if (entry.customUrl) return "https://www.youtube.com/c/" + entry.customUrl;
    if (entry.user) return "https://www.youtube.com/user/" + entry.user;
    return "";
  }

  function parseChannelInput(raw) {
    const input = String(raw || "").trim();
    const result = emptyParsed();
    if (!input) {
      result.error = "empty";
      return result;
    }

    if (CHANNEL_ID_RE.test(input)) {
      result.channelId = input;
      return result;
    }

    const bareHandle = input.match(/^@([^/\s?#]+)(?:[/?#].*)?$/);
    if (bareHandle) {
      result.handle = safeDecode(bareHandle[1]).toLowerCase();
      return result;
    }

    const url = coerceYouTubeUrl(input);
    if (url) {
      const parsed = parseYouTubeUrl(url);
      return { ...result, ...parsed };
    }

    if (/^https?:\/\//i.test(input)) {
      result.error = "not-youtube";
      return result;
    }

    result.name = input;
    return result;
  }

  function parseChannelHref(href) {
    if (!isChannelHref(href)) return null;
    const parsed = parseChannelInput(href);
    if (parsed.error) return null;
    if (!parsed.handle && !parsed.channelId && !parsed.customUrl && !parsed.user) {
      return null;
    }
    return parsed;
  }

  function hasChannelIdentity(entry) {
    if (!entry) return false;
    return Boolean(
      entry.handle ||
        entry.channelId ||
        entry.customUrl ||
        entry.user ||
        (entry.name && !entry.videoId)
    );
  }

  function channelKey(entry) {
    if (!entry) return "";
    if (entry.channelId) return `id:${entry.channelId}`;
    if (entry.handle) return `handle:${String(entry.handle).toLowerCase()}`;
    if (entry.customUrl) return `c:${String(entry.customUrl).toLowerCase()}`;
    if (entry.user) return `user:${String(entry.user).toLowerCase()}`;
    if (entry.name) return `name:${String(entry.name).trim().toLowerCase()}`;
    return "";
  }

  function normalizeEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    const entry = {
      key: typeof raw.key === "string" ? raw.key : "",
      input: typeof raw.input === "string" ? raw.input.trim() : "",
      handle: typeof raw.handle === "string" ? raw.handle.trim().toLowerCase() : "",
      channelId: typeof raw.channelId === "string" ? raw.channelId.trim() : "",
      customUrl: typeof raw.customUrl === "string" ? raw.customUrl.trim().toLowerCase() : "",
      user: typeof raw.user === "string" ? raw.user.trim().toLowerCase() : "",
      name: typeof raw.name === "string" ? raw.name.trim() : "",
      addedAt: Number(raw.addedAt) || Date.now()
    };
    if (entry.channelId && !CHANNEL_ID_RE.test(entry.channelId)) {
      const found = entry.channelId.match(CHANNEL_ID_FIND_RE);
      entry.channelId = found ? found[0] : "";
    }
    const canonical = canonicalChannelUrl(entry);
    if (canonical) entry.input = canonical;
    if (!entry.key) entry.key = channelKey(entry);
    if (!entry.key || !hasChannelIdentity(entry)) return null;
    return entry;
  }

  function sanitizeBlockedChannels(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const entry = normalizeEntry(item);
      if (!entry) continue;
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      out.push(entry);
    }
    return out;
  }

  function makeChannelEntry(input, extra) {
    const parsed = parseChannelInput(input);
    if (parsed.error && parsed.error !== "not-channel") return null;
    const entry = normalizeEntry({
      input: String(input || "").trim(),
      handle: (extra && extra.handle) || parsed.handle || "",
      channelId: (extra && extra.channelId) || parsed.channelId || "",
      customUrl: (extra && extra.customUrl) || parsed.customUrl || "",
      user: (extra && extra.user) || parsed.user || "",
      name: (extra && extra.name) || parsed.name || "",
      addedAt: extra && extra.addedAt
    });
    return entry;
  }

  function mergeChannelFields(...parts) {
    const merged = emptyParsed();
    merged.input = "";
    merged.key = "";
    merged.addedAt = 0;
    for (const part of parts) {
      if (!part || typeof part !== "object" || part.error) continue;
      if (part.handle && !merged.handle) merged.handle = String(part.handle).trim().toLowerCase();
      if (part.channelId && !merged.channelId) merged.channelId = String(part.channelId).trim();
      if (part.customUrl && !merged.customUrl) {
        merged.customUrl = String(part.customUrl).trim().toLowerCase();
      }
      if (part.user && !merged.user) merged.user = String(part.user).trim().toLowerCase();
      if (part.name && !merged.name) merged.name = String(part.name).trim();
      if (part.input && !merged.input) merged.input = String(part.input).trim();
      if (part.videoId && !merged.videoId) merged.videoId = String(part.videoId).trim();
      if (part.playlistId && !merged.playlistId) merged.playlistId = String(part.playlistId).trim();
      if (part.addedAt && !merged.addedAt) merged.addedAt = Number(part.addedAt) || 0;
    }
    return merged;
  }

  function sameChannel(a, b) {
    if (!a || !b) return false;
    if (a.channelId && b.channelId && a.channelId === b.channelId) return true;
    if (a.handle && b.handle && a.handle === b.handle) return true;
    if (a.customUrl && b.customUrl && a.customUrl === b.customUrl) return true;
    if (a.user && b.user && a.user === b.user) return true;
    if (
      a.name &&
      b.name &&
      !a.handle &&
      !a.channelId &&
      !a.customUrl &&
      !a.user &&
      !b.handle &&
      !b.channelId &&
      !b.customUrl &&
      !b.user &&
      a.name.trim().toLowerCase() === b.name.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  }

  function matchBlockedChannel(info, list) {
    if (!info || !Array.isArray(list) || !list.length) return null;
    const handle = String(info.handle || "").trim().toLowerCase();
    const channelId = String(info.channelId || "").trim();
    const customUrl = String(info.customUrl || "").trim().toLowerCase();
    const user = String(info.user || "").trim().toLowerCase();
    const name = String(info.name || "").trim().toLowerCase();

    for (const entry of list) {
      if (channelId && entry.channelId && channelId === entry.channelId) return entry;
      if (handle && entry.handle && handle === entry.handle) return entry;
      if (customUrl && entry.customUrl && customUrl === entry.customUrl) return entry;
      if (user && entry.user && user === entry.user) return entry;
      if (
        name &&
        entry.name &&
        !entry.handle &&
        !entry.channelId &&
        !entry.customUrl &&
        !entry.user &&
        name === entry.name.trim().toLowerCase()
      ) {
        return entry;
      }
    }
    return null;
  }

  function formatChannelLabel(entry) {
    if (!entry) return "Blocked channel";
    if (entry.handle) return "@" + entry.handle;
    if (entry.name) return entry.name;
    if (entry.customUrl) return entry.customUrl;
    if (entry.user) return entry.user;
    if (entry.channelId) return entry.channelId;
    return entry.input || "Blocked channel";
  }

  function formatChannelMeta(entry) {
    if (!entry) return "";
    const bits = [];
    if (entry.handle && entry.name) bits.push(entry.name);
    if (entry.channelId) bits.push(entry.channelId);
    if (!entry.handle && !entry.channelId && !entry.customUrl && !entry.user && entry.name) {
      bits.push("Matched by channel name");
    }
    if (!bits.length && entry.input && entry.input !== formatChannelLabel(entry)) {
      bits.push(entry.input);
    }
    return bits.join(" · ");
  }

  function channelFetchUrl(parsed, input) {
    if (!parsed) return "";
    if (parsed.videoId) return `https://www.youtube.com/watch?v=${encodeURIComponent(parsed.videoId)}`;
    if (parsed.playlistId) {
      return `https://www.youtube.com/playlist?list=${encodeURIComponent(parsed.playlistId)}`;
    }
    if (parsed.handle) return `https://www.youtube.com/@${encodeURIComponent(parsed.handle)}`;
    if (parsed.channelId) return `https://www.youtube.com/channel/${encodeURIComponent(parsed.channelId)}`;
    if (parsed.customUrl) return `https://www.youtube.com/c/${encodeURIComponent(parsed.customUrl)}`;
    if (parsed.user) return `https://www.youtube.com/user/${encodeURIComponent(parsed.user)}`;
    const url = coerceYouTubeUrl(input);
    return url ? url.toString() : "";
  }

  function firstMatch(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) return match[1];
    }
    return "";
  }

  function parseChannelFromHtml(html, sourceUrl) {
    if (!html) return emptyParsed();
    const isMediaPage = /\/watch|\/shorts\/|youtu\.be\/|\/playlist/i.test(sourceUrl || "");
    const result = emptyParsed();

    const canonical = decodeHtml(
      firstMatch(html, [
        /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/i,
        /<link\s+href=["']([^"']+)["']\s+rel=["']canonical["'][^>]*>/i
      ])
    );
    const ogUrl = decodeHtml(
      firstMatch(html, [
        /<meta\s+property=["']og:url["']\s+content=["']([^"']+)["'][^>]*>/i,
        /<meta\s+content=["']([^"']+)["']\s+property=["']og:url["'][^>]*>/i
      ])
    );
    const ogTitle = decodeHtml(
      firstMatch(html, [
        /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["'][^>]*>/i,
        /<meta\s+content=["']([^"']+)["']\s+property=["']og:title["'][^>]*>/i
      ])
    );

    const fromCanonical = canonical ? parseChannelInput(canonical) : null;
    const fromOg = ogUrl ? parseChannelInput(ogUrl) : null;
    Object.assign(result, mergeChannelFields(result, fromCanonical, fromOg));

    if (ogTitle && !isMediaPage) {
      result.name = ogTitle.replace(/\s*[·|–-]\s*YouTube\s*$/i, "").trim();
    }

    if (!result.name && !isMediaPage) {
      const pageTitle = decodeHtml(firstMatch(html, [/<title[^>]*>([^<]+)<\/title>/i]));
      if (pageTitle) {
        result.name = pageTitle.replace(/\s*[·|–-]\s*YouTube\s*$/i, "").trim();
      }
    }

    if (result.channelId) {
      const nearbyHandle = firstMatch(html, [
        new RegExp(
          `"browseId":"${result.channelId}"[\\s\\S]{0,500}?"canonicalBaseUrl":"(/@[^"]+)"`
        ),
        new RegExp(
          `"canonicalBaseUrl":"(/@[^"]+)"[\\s\\S]{0,500}?"browseId":"${result.channelId}"`
        ),
        new RegExp(
          `"vanityChannelUrl":"https?:\\\\?/\\\\?/(?:www\\.)?youtube\\.com\\\\?/@([^"]+)"`
        )
      ]);
      if (nearbyHandle) {
        const handleValue = nearbyHandle.startsWith("/@")
          ? nearbyHandle.slice(2)
          : nearbyHandle;
        if (handleValue) result.handle = decodeURIComponent(handleValue).toLowerCase();
      }
    }

    if (isMediaPage) {
      const details = html.match(/"videoDetails"\s*:\s*\{[\s\S]{0,2500}?\}/);
      if (details) {
        const chunk = details[0];
        const channelId = (chunk.match(/"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]{22})"/) || [])[1];
        const author = (chunk.match(/"author"\s*:\s*"((?:\\.|[^"\\])*)"/) || [])[1];
        if (channelId) result.channelId = channelId;
        if (author) result.name = unescapeJson(author);
      }

      const ownerUrlRaw = firstMatch(html, [
        /"ownerProfileUrl"\s*:\s*"(https?:\\\/\\\/(?:www\.)?youtube\.com\\\/@[^"]+)"/,
        /"ownerProfileUrl"\s*:\s*"(https?:\/\/(?:www\.)?youtube\.com\/@[^"]+)"/,
        /"videoOwnerRenderer"[\s\S]{0,4000}?"canonicalBaseUrl":"(\/@[^"]+)"/,
        /"playlistSidebarSecondaryInfoRenderer"[\s\S]{0,4000}?"canonicalBaseUrl":"(\/@[^"]+)"/,
        /"ownerText"[\s\S]{0,1200}?"canonicalBaseUrl":"(\/@[^"]+)"/
      ]);
      if (ownerUrlRaw) {
        const ownerParsed = parseChannelInput(
          ownerUrlRaw.startsWith("/@")
            ? "https://www.youtube.com" + ownerUrlRaw
            : ownerUrlRaw.replace(/\\\//g, "/")
        );
        Object.assign(result, mergeChannelFields(result, ownerParsed));
      }

      const ownerId = firstMatch(html, [
        /"videoOwnerRenderer"[\s\S]{0,4000}?"browseId":"(UC[a-zA-Z0-9_-]{22})"/,
        /"playlistSidebarSecondaryInfoRenderer"[\s\S]{0,4000}?"browseId":"(UC[a-zA-Z0-9_-]{22})"/
      ]);
      if (ownerId && !result.channelId) result.channelId = ownerId;
    }

    return result;
  }

  const api = {
    parseChannelInput,
    parseChannelHref,
    isChannelHref,
    hasChannelIdentity,
    channelKey,
    sanitizeBlockedChannels,
    makeChannelEntry,
    mergeChannelFields,
    sameChannel,
    matchBlockedChannel,
    formatChannelLabel,
    formatChannelMeta,
    channelFetchUrl,
    parseChannelFromHtml,
    normalizeEntry,
    canonicalChannelUrl
  };

  globalThis.RBChannelBlocklist = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
