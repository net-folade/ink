# ink.

A minimal notes app that installs to your home screen and works offline.
I built this cause i wanted a downloadable '.txt notes app i could access from all my devices. 

Live: https://net-folade.github.io/ink/

## What it does

**Notes** — one big editor, autosaves as you type. Start a new note and the old
one moves to the All notes list. Download any note as `.txt` or `.md`.

**Offline** — installable PWA with a network-first service worker. Everything
lives in localStorage, so it works with no connection and no account.

**Sync (optional)** — log in and your notes follow you across devices.
Local-first: localStorage stays the source of truth, changes push when online,
last write wins.

## Stack

Vanilla HTML, CSS, and JavaScript — no build step, no framework. Supabase
(Postgres + auth) for sync. Hosted on GitHub Pages.

## Run it locally

```sh
git clone https://github.com/net-folade/ink.git
cd ink
python3 -m http.server 8000
```

Open http://localhost:8000. That's the whole app — sync stays off.