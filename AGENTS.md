# AGENTS.md — working on Diarc

Diarc is a Chromium MV3 extension (built for Dia Browser): an Arc-style command bar overlay with
search (tabs, history, bookmarks, commands) and a grid of live widgets.

## If you were asked to add or change a widget
Read **docs/WIDGETS.md** first. It is the complete contract. Short version:

1. `npm run new-widget -- <id> "<Name>"` creates `src/widgets/<id>/index.tsx`.
2. Implement `fetch` (service worker, network) and `View` (Preact, overlay). Use `ctx.http`, never raw `fetch` for authed calls.
3. `npm run typecheck && npm run build`, then reload the extension in `dia://extensions`.

Widgets are auto-registered (`import.meta.glob`); do not edit a registry.

## Commands
- `npm run build` → `dist/` (load unpacked). `npm run dev` rebuilds on change.
- `npm run typecheck` must pass.
- `npm run test:e2e` (needs Playwright) loads `dist/` into Chromium and screenshots to `test-results/`.

## Architecture (where things live)
- `src/content/index.ts` — 3 KB content script. Only creates a hidden iframe in a closed shadow root and shows/hides it. No UI, no data.
- `src/pages/overlay.html` + `src/ui/*` — the bar itself: an extension page inside that iframe; on pages without injection (Dia new tab, dia://, Web Store, PDF) it is shown as a tab (`mode=tab`), a popup window is the last resort.
- `src/background/*` — service worker: shortcut, injection/fallback, widget refresh (`chrome.alarms`), OAuth (`launchWebAuthFlow`).
- `src/shared/*` — types and helpers shared by both sides. `widget.ts` is the widget API.
- Data flow: background writes `cache:<tileId>` to `chrome.storage.local`; the overlay reads the snapshot on load and listens to `storage.onChanged`. Mutations go through `chrome.runtime.sendMessage` (`src/shared/messages.ts`).

## Rules
- MV3: no remote code, no `eval`, no CDN scripts. Everything ships in the bundle.
- Keep the content script tiny and dependency-free. Never render widget data into the page DOM (privacy: pages could read it).
- Keep bundles small: no UI libraries beyond Preact; prefer the kit in `src/ui/kit.tsx` and CSS in `src/ui/styles.css`.
- User-facing strings are Russian.
- Don't request new permissions in `public/manifest.json` without a reason; `<all_urls>` host access already covers widget APIs.
