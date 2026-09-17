# Changelog

All notable changes to ReactionBlocker are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- Content script loads keywords from a bundled JS file and does not call `chrome.storage` or fetch extension JSON on YouTube pages (those calls were reported as extension errors and aborted filtering).
- Filtering attaches to already-open YouTube tabs after an extension reload.
- Reaction videos opened on the watch page are blocked too, not only search/grid cards.

### Added
- Toolbar badge showing how many videos were filtered in the current browser session.
- Popup status line showing whether the content script is active on the current tab.

### Changed
- Session filter count and recent list now live in `chrome.storage.session` (reset when Chrome quits), instead of accumulating in local storage.
- Project licensed under MIT; added root `LICENSE` and README license links.

## [1.1.6] - 2026-09-16

### Added
- Japanese hard phrases (`japanese`) and romanized forms (`romaji`) in `data/keywords.json`.
- Japanese / romaji soft genre tags and compounds in `data/soft_keywords.json`.
- Popup language options for Japanese and Japanese (romaji); auto-detect for `ja*`.

### Credits
- Japanese translation help by **Aiko** — community contribution

## [1.1.5] - 2026-09-14

### Fixed
- Filtered videos now hide on full page reload / first paint without waiting for scroll.
- Content script starts its MutationObserver before async keyword load, observes title/aria-label hydration, runs a short scan burst after ready, and re-bursts on YouTube SPA navigation.

### Changed
- Content script `run_at` moved from `document_idle` to `document_end` for earlier injection.

## [1.1.4] - 2026-09-12

### Added
- `CHANGELOG.md` and a README **Helpers** section (credits for testing and translations).

### Changed
- README version badge and project layout updated for soft-keyword files.

### Credits
- Testing / bug reports: [Christian Scherlipp](https://github.com/ChristianScherlipp/)
- Translations: German, Swedish, Norwegian by [lohmibln](https://github.com/lohmibln); Finnish — community contribution

## [1.1.3] - 2026-09-12

### Changed
- Moved soft genre tags and compound phrases into `data/soft_keywords.json` (hard phrases stay in `data/keywords.json`).
- Content script loads both keyword files; manifest `web_accessible_resources` updated accordingly.

## [1.1.2] - 2026-09-12

### Added
- Soft genre-tag and compound matching for English, Finnish, Swedish, and Norwegian (same pattern as German).

### Changed
- Soft matching driven from keyword data instead of a German-only hard-coded list.

## [1.1.1] - 2026-09-12

### Added
- Safer German soft matching: multi-word compounds plus end-of-title genre labels (`Statement`, `Analyse`, `Ansage`, `Skandal`) — not bare hard-block words.
- Popup **Recently filtered** list with optional group-by-channel.
- Session filter log shared with console output.

### Fixed
- Filter count / console / popup list drifting apart (racy counter and “session” count that never reset).

## [1.1.0] - 2026-09-10

### Added
- Finnish, Swedish, and Norwegian keyword lists.
- Language options in the popup for the new locales.

## [1.0.0] - 2026-09

### Added
- Initial Manifest V3 Chrome extension.
- Title-based filtering for YouTube video cards (English and German keywords).
- Popup toggle, filter count, and language display.
- Infinite-scroll / live DOM filtering via mutation observer.

[1.1.6]: https://github.com/lohmibln/ReactionBlocker/compare/v1.1.5...v1.1.6
[1.1.5]: https://github.com/lohmibln/ReactionBlocker/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/lohmibln/ReactionBlocker/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/lohmibln/ReactionBlocker/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/lohmibln/ReactionBlocker/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/lohmibln/ReactionBlocker/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/lohmibln/ReactionBlocker/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/lohmibln/ReactionBlocker/releases/tag/v1.0.0
