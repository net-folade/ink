# ink. — Tasks & Notes PWA

## Context

Folade has a finished Claude Design mockup (`Ink Tasks & Notes.dc.html`) for a personal tasks + notes app and wants it turned into a real, installable PWA that works on iPhone, iPad, and Mac. The design file already contains the complete component logic (a `DCLogic` class with state, localStorage persistence, notes, tasks, sorting, and drag-reorder), so this is a **port, not a redesign**: convert the `.dc.html` template + class into vanilla HTML/CSS/JS, add a PWA manifest and service worker, and prepare it for GitHub Pages hosting.

Decisions already made with the user:
- **Hosting:** GitHub Pages (HTTPS, free) — app must work under a subpath like `/ink/`, so all URLs are relative.
- **Fonts:** System fonts only — no Google Fonts, no network dependency. Map: Newsreader → `ui-serif, Georgia, serif` (italic for the "ink." logo), Montserrat → `system-ui, -apple-system, sans-serif`, Spline Sans Mono → `ui-monospace, "SF Mono", Menlo, monospace`.

## Files to create (all in `/Users/foladeakhibi/Desktop/projects/ink/`)

| File | Purpose |
|---|---|
| `index.html` | App shell: header/nav, the three views (Note / All notes / Tasks), PWA + iOS meta tags |
| `styles.css` | Design's inline styles ported to classes, plus responsive/mobile fixes |
| `app.js` | The `DCLogic` class logic ported to plain JS (state + render + event handlers) |
| `manifest.webmanifest` | Name "ink.", `display: standalone`, `background_color`/`theme_color: #0e0e10`, relative `start_url: "./"`, icons |
| `sw.js` | Versioned cache-first service worker for the app shell (all-relative paths for the GH Pages subpath) |
| `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png` (180px) | Dark rounded-square "ink." lettermark, generated with a one-off Python script via `uv run --with pillow` (ephemeral, not a project dependency) |

The original `Ink Tasks & Notes.dc.html` stays untouched as the design reference.

## Port details — keep the design's behavior exactly

State shape, localStorage key (`ink-tasks-notes-v1`), and all logic come straight from the `DCLogic` class in the design file (lines 113–244):

- **State:** `{ view, notes, activeId, tasks, sort, newTask, newDue, dragIdx }`; load on startup, save after every mutation (`set()` pattern).
- **Notes:** freeform textarea autosaving on every keystroke (`input` event, not `change`). Title = first line, snippet = remaining lines joined, relative date via `fmtDate` (Today / "Jul 19"). "+ New note" is a no-op if the current note is empty. Download `.txt`/`.md` via Blob + object URL, filename slug from the first line (`download()` logic, line 144).
- **Tasks:** add via button or Enter, optional due date (`<input type="date">`). Circular checkbox toggles `done`. Three sort chips: date added / due date / manual. Due formatting via `fmtDue` ("due today" amber `#c8a06a` when due ≤ today). Completed section: dimmed (opacity .45), strikethrough, click ✓ to un-complete, "Delete completed" bulk-removes.
- **Rendering approach:** single `render()` that rebuilds the current view from state — same mental model as the design's `renderVals()`. One exception: while typing in the textarea, only update the saved-meta text, never re-set the textarea's value (would reset the caret on iOS).

## Deviations from the design file (all necessary for real devices)

1. **Drag-reorder uses Pointer Events, not HTML5 drag-and-drop.** The design's `draggable`/`onDragStart`/`onDragOver` doesn't work with touch on iPhone/iPad. Implement: `pointerdown` on the ⠿ grip → track `pointermove` to compute the hovered row → splice-reorder (reusing the design's `reorder()` index-mapping logic, line 154) → `pointerup` ends. Add `touch-action: none` on the grip. Works identically for mouse on Mac.
2. **Responsive layout.** The design hardcodes 680px/760px content widths; change to `width: min(680px, 100% - 40px)` style so iPhone works. `height: 100vh` → `100dvh` (iOS Safari URL-bar issue), plus `env(safe-area-inset-*)` padding and `viewport-fit=cover` for notched devices and standalone mode.
3. **iOS PWA meta tags:** `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `theme-color #0e0e10`, `apple-touch-icon` link. Also `font-size: 16px` on inputs/textarea (already is) so iOS doesn't zoom on focus.
4. **`style-hover` attributes** become normal CSS `:hover` rules (media-queried to `(hover: hover)` so they don't stick on touch).

## Service worker strategy

- Precache the app shell on `install`: `./`, `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, icons.
- `activate`: delete old versioned caches (`ink-v1` → bump string on each deploy).
- `fetch`: cache-first for same-origin GETs, falling back to network. All data lives in localStorage, so offline works fully once installed.

## GitHub Pages deploy (after the app works locally)

1. `git init`, initial commit (conventional: `feat: ink tasks & notes PWA`).
2. `gh repo create ink --public --source . --push` — **will ask Folade for confirmation before creating the repo/pushing** (stop-and-confirm rule).
3. Enable Pages from the `main` branch root via `gh api`.
4. App lands at `https://<user>.github.io/ink/` — relative paths mean no config needed.
5. Install: Safari on iPhone/iPad → Share → Add to Home Screen; Mac → works in any browser, installable in Safari 17+/Chrome.

## Verification

1. `python3 -m http.server` in the project dir, open `http://localhost:8000`.
2. Notes: type → reload page → text persists; first line shows as title in All notes with snippet + "Today"; download .txt and .md and check contents/filename.
3. Tasks: add with/without due date (Enter and button), toggle complete/un-complete, check all three sorts, drag-reorder in manual mode (mouse), delete completed.
4. PWA: DevTools → Application → manifest parses, SW registered; toggle "Offline" and reload — app still loads.
5. After deploy: open on iPhone, Add to Home Screen, confirm standalone launch, offline relaunch, and touch drag-reorder.
