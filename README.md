# ReactionBlocker

![ReactionBlocker logo](icons/logo256.png)

**Hide reaction videos on YouTube so you can actually watch the original.**

[English](#english) · [Deutsch](#deutsch)

**Supported languages:** English · German · Finnish · Swedish · Norwegian

![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-EA4335?style=flat-square)
![Vanilla JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=flat-square)
![Languages EN DE FI SV NO](https://img.shields.io/badge/Keywords-EN%20%7C%20DE%20%7C%20FI%20%7C%20SV%20%7C%20NO-00BFA5?style=flat-square)
![Version 1.1.4](https://img.shields.io/badge/Version-1.1.4-555?style=flat-square)

Search for a song, a trailer, a speech, and the first page is *someone else watching it*. ReactionBlocker is a lightweight Chrome extension that quietly removes those results from YouTube so the original content can surface again.

It runs entirely on your machine. No account, no analytics, no extra dependencies.

---

<a id="english"></a>

## English

### Why this exists

YouTube search is full of reaction content: “first time watching”, “reagiert auf”, “reaction”, family-react compilations, and the rest. That is fine if you want it. If you do not, it buries the video you actually searched for.

ReactionBlocker matches video **titles** against curated keyword lists (English, German, Finnish, Swedish, Norwegian) and hides the cards that look like reactions, including results that load as you scroll.

### Features

- Filters YouTube search results (and other video grids that use the same cards)
- English, German, Finnish, Swedish, and Norwegian phrases (`reaction`, `reagiert auf`, `reaktio`, `reagerar på`, `reagerer på`, …)
- Works with YouTube’s current layout, including lockup / rich-item cards
- Keeps filtering as infinite scroll loads more videos
- Popup to enable/disable filtering, see how many items were hidden, and review recently filtered titles
- Soft genre tags / compounds in `data/soft_keywords.json` (safer synonyms without bare-word overblocking)
- Easy to extend: add a language by editing the JSON keyword files
- Vanilla JavaScript, Manifest V3, no third-party libraries

### Install (unpacked)

The extension is not on the Chrome Web Store yet. Load it locally:

1. Clone this repository (or download the ZIP and unpack it).
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select the `reaction-blocker` folder (the one that contains `manifest.json`).
6. Pin the extension if you want the popup in the toolbar.

After you change code or `keywords.json`, click **Reload** on the extension card, then refresh YouTube (`Ctrl+Shift+R`). You do not need to “load unpacked” again unless you moved the folder.

### Usage

1. Search YouTube as usual.
2. Matching reaction titles disappear from the list.
3. Open the toolbar popup to:
   - turn filtering on or off
   - see how many videos were filtered
   - view the detected browser language
4. Optional: DevTools → Console shows `[ReactionBlocker] Filtered:` with title, channel, and the keyword that matched.

Try it with queries like [reaction](https://www.youtube.com/results?search_query=reaction), [reagiert auf](https://www.youtube.com/results?search_query=reagiert+auf), or [first time watching](https://www.youtube.com/results?search_query=first+time+watching).

### How it works

| Piece | Role |
| --- | --- |
| `content.js` | Scans video cards, matches titles, hides hits, observes new results |
| `data/keywords.json` | Hard phrase lists grouped by language |
| `data/soft_keywords.json` | Soft genre tags and compound phrases |
| `popup.html` / `popup.js` | Toggle, stats, recent filtered list, language display |
| `manifest.json` | Chrome Manifest V3 permissions and entry points |

Hidden cards get `display: none` and `data-filtered="reaction"`. Matching is case-insensitive. All language lists are applied together, because titles mix languages all the time (*Trailer Reaktion*).

> Filtering is keyword-based. A documentary titled “Chain reaction” can be hidden too. Tune `data/keywords.json` if that bothers you.

### Add keywords or a language

Hard phrases go in `data/keywords.json`. Soft genre tags and compounds go in `data/soft_keywords.json`:

```json
{
  "english": ["reaction", "reacting to"],
  "german": ["reaktion", "reagiert auf"],
  "finnish": ["reaktio", "reagoi"],
  "swedish": ["reaktion", "reagerar på"],
  "norwegian": ["reaksjon", "reagerer på"]
}
```

1. Add phrases (lowercase is fine; matching is case-insensitive).
2. For a new language, add a new array key.
3. Add a matching `<option>` in `popup.html` if you want it in the dropdown.
4. Reload the extension, then refresh YouTube.

### Roadmap

Not built yet. Hooks already exist in `content.js` and the popup.

| Feature | Planned file | Idea |
| --- | --- | --- |
| Local channel blocklist | `blockedChannels.json` | Hide a channel even without a title match |
| Community reports | `communityReports.json` | Crowdsource known reaction channels |
| Whitelist | `whitelistChannels.json` | Keep commentary / news channels visible |

Popup buttons **Settings** and **Report a channel** are placeholders for those features.

### Project layout

```
reaction-blocker/
├── manifest.json
├── content.js
├── popup.html
├── popup.css
├── popup.js
├── data/
│   ├── keywords.json
│   └── soft_keywords.json
├── icons/
├── CHANGELOG.md
└── README.md
```

No build step. No `npm install`.

### Helpers

Helpers support the project with testing, feedback, and translations. They are **not** the project author.

**Author:** [lohmibln](https://github.com/lohmibln)

| Helper | Contribution |
| --- | --- |
| [Christian Scherlipp](https://github.com/ChristianScherlipp/) | Bug reports and testing feedback (keyword false-positive risk; UI vs console filter list) |

**Translations**

| Language | Credit |
| --- | --- |
| German | [lohmibln](https://github.com/lohmibln) |
| Swedish | [lohmibln](https://github.com/lohmibln) |
| Norwegian | [lohmibln](https://github.com/lohmibln) |
| Finnish | Friend (non-coding translation help; name TBD) |

Swedish and Norwegian starter lists also had AI assistance. Native speakers: improvements welcome.

### Contributing

The easiest way to help is by expanding keyword lists for your language (`data/keywords.json` and, for soft synonyms, `data/soft_keywords.json`). Classmates and friends: send a list in the same style, and we will merge it. Code, layout fixes, and the rest of the product stay with the maintainers.

See [CHANGELOG.md](CHANGELOG.md) for release history.

### License

Not specified yet. Add a `LICENSE` file before a public release if you want a formal one.

---

<a id="deutsch"></a>

## Deutsch

### Worum es geht

Wer auf YouTube ein Lied, einen Trailer oder eine Rede sucht, landet oft zuerst bei Leuten, die das Original *angucken*. „First time watching“, „reagiert auf“, „Reaktion“. Das ist okay, wenn man es will. Wenn nicht, verschwindet das eigentliche Video unter Reaktionsmüll.

ReactionBlocker ist eine schlanke Chrome-Erweiterung, die solche Treffer anhand des **Titels** ausblendet. Phrase-Listen auf Englisch, Deutsch, Finnisch, Schwedisch und Norwegisch, direkt im Browser, ohne Konto und ohne Tracker.

### Funktionen

- Filtert YouTube-Suchergebnisse (und andere Grids mit denselben Karten)
- Englisch, Deutsch, Finnisch, Schwedisch und Norwegisch (`reaction`, `reagiert auf`, `reaktio`, `reagerar på`, `reagerer på`, …)
- Kommt mit dem aktuellen YouTube-Layout klar (inkl. Lockup- / Rich-Item-Karten)
- Filtert auch nach, wenn per Infinite Scroll neue Videos nachladen
- Popup zum An- und Ausschalten, für die Anzahl ausgeblendeter Videos und die zuletzt gefilterten Titel
- Weiche Genre-Tags / Phrasen in `data/soft_keywords.json` (sicherere Synonyme ohne Einzelwort-Overblocking)
- Neue Sprachen: einfach JSON erweitern
- Nur Vanilla-JavaScript, Manifest V3, keine Fremdbibliotheken

### Installation (entpackt)

Noch nicht im Chrome Web Store. So lädst du sie lokal:

1. Repository klonen (oder ZIP herunterladen und entpacken).
2. In Chrome `chrome://extensions` öffnen.
3. **Entwicklermodus** oben rechts einschalten.
4. **Entpackte Erweiterung laden** klicken.
5. Den Ordner `reaction-blocker` wählen (darin liegt `manifest.json`).
6. Optional an die Symbolleiste anheften.

Nach Änderungen an Code oder `keywords.json`: auf der Erweiterungskarte **Aktualisieren**, danach YouTube neu laden (`Strg+Umschalt+R`). Neu „entpackt laden“ musst du nur, wenn du den Ordner verschoben hast.

### Nutzung

1. Ganz normal auf YouTube suchen.
2. Passende Reaktionstitel verschwinden aus der Liste.
3. Im Popup kannst du:
   - den Filter an- und ausschalten
   - sehen, wie viele Videos gefiltert wurden
   - die erkannte Browsersprache ansehen
4. Optional: In der Konsole (DevTools) erscheint `[ReactionBlocker] Filtered:` mit Titel, Kanal und Trefferwort.

Zum Testen z. B. [reaction](https://www.youtube.com/results?search_query=reaction), [reagiert auf](https://www.youtube.com/results?search_query=reagiert+auf) oder [erste mal](https://www.youtube.com/results?search_query=erste+mal).

### So funktioniert’s

| Datei | Aufgabe |
| --- | --- |
| `content.js` | Karten scannen, Titel prüfen, Treffer ausblenden, neue Ergebnisse beobachten |
| `data/keywords.json` | Harte Wortlisten nach Sprache |
| `data/soft_keywords.json` | Weiche Genre-Tags und Mehrwort-Phrasen |
| `popup.html` / `popup.js` | Schalter, Zähler, zuletzt gefilterte Videos, Sprache |
| `manifest.json` | Manifest V3, Berechtigungen, Einstiegspunkte |

Ausgeblendete Karten bekommen `display: none` und `data-filtered="reaction"`. Der Abgleich ignoriert Groß/Kleinschreibung. Alle Sprachlisten gelten **gleichzeitig**, weil Titel oft gemischt sind (*Trailer Reaktion*).

> Der Filter arbeitet mit Keywords. Ein Dokumentarfilm namens „Kettenreaktion“ / „Chain reaction“ kann also ebenfalls verschwinden. Dann `data/keywords.json` anpassen.

### Keywords oder Sprache hinzufügen

Harte Phrasen in `data/keywords.json`, weiche Genre-Tags/Komposita in `data/soft_keywords.json`:

```json
{
  "english": ["reaction", "reacting to"],
  "german": ["reaktion", "reagiert auf"],
  "finnish": ["reaktio", "reagoi"],
  "swedish": ["reaktion", "reagerar på"],
  "norwegian": ["reaksjon", "reagerer på"]
}
```

1. Phrasen ergänzen (Kleinschreibung reicht).
2. Für eine neue Sprache ein neues Array-Feld anlegen.
3. Optional eine `<option>` in `popup.html` für das Dropdown.
4. Erweiterung neu laden, YouTube aktualisieren.

### Ausblick

Noch nicht gebaut. Die Stellen im Code sind schon markiert.

| Feature | Geplante Datei | Idee |
| --- | --- | --- |
| Lokale Kanalsperre | `blockedChannels.json` | Kanal ausblenden, auch ohne Titel-Treffer |
| Community-Meldungen | `communityReports.json` | Bekannte Reaktionskanäle sammeln |
| Whitelist | `whitelistChannels.json` | Kommentare / Nachrichten sichtbar lassen |

Die Popup-Buttons **Settings** und **Report a channel** sind Platzhalter dafür.

### Ordnerstruktur

```
reaction-blocker/
├── manifest.json
├── content.js
├── popup.html
├── popup.css
├── popup.js
├── data/
│   ├── keywords.json
│   └── soft_keywords.json
├── icons/
├── CHANGELOG.md
└── README.md
```

Kein Build, kein `npm install`.

### Helferinnen und Helfer

Hilfe bei Tests, Feedback und Übersetzungen. Das sind **keine** Projekt-Autor:innen.

**Autor:** [lohmibln](https://github.com/lohmibln)

| Person | Beitrag |
| --- | --- |
| [Christian Scherlipp](https://github.com/ChristianScherlipp/) | Bug-Reports und Test-Feedback (Keyword-Fehlalarme; Abweichung UI vs. Konsole) |

**Übersetzungen**

| Sprache | Credit |
| --- | --- |
| Deutsch | [lohmibln](https://github.com/lohmibln) |
| Schwedisch | [lohmibln](https://github.com/lohmibln) |
| Norwegisch | [lohmibln](https://github.com/lohmibln) |
| Finnisch | Freund:in (Übersetzungshilfe ohne Code; Name folgt) |

Schwedisch und Norwegisch starten zusätzlich mit KI-Hilfe. Muttersprachler: bitte verbessern.

### Mitmachen

Am einfachsten hilft ihr mit Keyword-Listen für eure Sprache (`data/keywords.json` und für weiche Synonyme `data/soft_keywords.json`). Mitschüler und Freunde: schickt eine Liste im gleichen Stil, wir mergen sie. Code, Layout und der Rest bleiben bei den Maintainern.

Release-Historie: [CHANGELOG.md](CHANGELOG.md).

### Lizenz

Noch nicht festgelegt. Vor einer öffentlichen Veröffentlichung eine `LICENSE`-Datei ergänzen.

---

<p align="center">
  <a href="#reactionblocker">Back to top ↑</a>
</p>
