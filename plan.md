# ink. — Tasks & Notes PWA

## Status
v1 works locally: notes (autosave, list view, .txt/.md download, swipe/× delete),
tasks (due dates, 3 sort modes, touch drag-reorder, completed section),
installable PWA with offline support (network-first service worker).

## v1 — ship it
1. Push to github.com/net-folade/ink (repo already created).
2. Enable GitHub Pages: repo Settings → Pages → Deploy from branch → main, / (root).
3. App URL: https://net-folade.github.io/ink/
4. Install: Safari on iPhone/iPad → Share → Add to Home Screen; Mac → any browser.
5. Verify on device: offline relaunch, touch drag-reorder, swipe-to-delete.

## v2 — cross-device sync (Supabase)
Data is localStorage per device; sync requires a backend. Not started.
- Supabase free tier: Postgres + auth + supabase-js client.
- Tables: notes(id, text, created_at, updated_at), tasks(id, title, due, done, position, created_at).
- Auth: email magic-link, single user (me), row-level security on user_id.
- Local-first: localStorage stays the source of truth; push changes when
  online, pull on launch, last-write-wins on updated_at.
- New sync.js module; render logic in app.js stays untouched.

## Conventions
- Atomic conventional commits: feat: / fix: / docs: / chore:
- No cache bumps needed after changes — service worker is network-first.
