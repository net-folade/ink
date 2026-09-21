'use strict';

/* v2 cross-device sync (Supabase). Local-first: localStorage stays the source
   of truth. Each cycle pulls all notes, merges into local state (last-write-wins
   per note on updated_at; deletes are soft via deleted_at + local tombstones so
   an offline device can't resurrect them), applies the result, then pushes the
   merged state back. Dormant when config.js or the supabase-js CDN script is
   unavailable — the app then runs exactly as v1. */

(function () {
  const cfg = window.INK_CONFIG;
  const statusEl = document.getElementById('sync-status');
  if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase || !window.inkApp) return;

  const db = window.supabase.createClient(cfg.url, cfg.anonKey);

  let session = null;
  let syncing = false;
  let queued = false;
  let pushTimer = null;

  /* ---------- status pill + login modal ---------- */

  function setStatus(text, kind) {
    statusEl.hidden = false;
    statusEl.textContent = text;
    statusEl.className = 'sync-status' + (kind ? ' ' + kind : '');
  }

  const modal = document.getElementById('login-modal');
  const emailEl = document.getElementById('login-email');
  const passEl = document.getElementById('login-password');
  const errEl = document.getElementById('login-error');

  statusEl.addEventListener('click', async () => {
    if (session) {
      if (confirm('Log out of sync on this device? Your data stays on the device.')) {
        await db.auth.signOut();
      }
    } else {
      errEl.textContent = '';
      modal.hidden = false;
      emailEl.focus();
    }
  });

  async function doLogin() {
    errEl.textContent = '';
    const { error } = await db.auth.signInWithPassword({
      email: emailEl.value.trim(),
      password: passEl.value,
    });
    if (error) { errEl.textContent = error.message; return; }
    passEl.value = '';
    modal.hidden = true;
  }

  document.getElementById('login-submit').addEventListener('click', doLogin);
  passEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-cancel').addEventListener('click', () => { modal.hidden = true; });

  db.auth.onAuthStateChange((event, s) => {
    session = s;
    if (!session) { setStatus('sync off', 'off'); return; }
    // supabase-js can deadlock if its API is awaited inside this callback
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') setTimeout(fullSync, 0);
  });

  /* ---------- triggers ---------- */

  document.addEventListener('ink:change', () => {
    if (!session) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(fullSync, 1500);
  });
  window.addEventListener('online', () => { if (session) fullSync(); });

  /* ---------- row ↔ local item converters ---------- */

  function rowToNote(r) {
    return { id: Number(r.id), text: r.text, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) };
  }
  function noteToRow(n) {
    return { id: n.id, text: n.text, created_at: n.createdAt, updated_at: n.updatedAt ?? n.createdAt, deleted_at: null };
  }
  function tombRow(id, ts, extra) {
    return Object.assign({ id: Number(id), created_at: ts, updated_at: ts, deleted_at: ts }, extra);
  }

  /* ---------- merge (last-write-wins per item on updated_at) ---------- */

  function merge(localItems, tombs, rows, toLocal) {
    const byId = new Map(localItems.map((x) => [x.id, x]));
    const outTombs = Object.assign({}, tombs);
    let changed = false;
    for (const row of rows) {
      const id = Number(row.id);
      const local = byId.get(id);
      const localTs = local ? (local.updatedAt ?? local.createdAt) : 0;
      if (row.deleted_at) {
        if (local && Number(row.deleted_at) > localTs) {
          byId.delete(id);
          outTombs[id] = Number(row.deleted_at);
          changed = true;
        } else if (!local && !outTombs[id]) {
          outTombs[id] = Number(row.deleted_at);
          changed = true;
        }
        continue;
      }
      const ts = Number(row.updated_at);
      if (outTombs[id]) {
        if (outTombs[id] >= ts) continue; // local delete is newer — push re-deletes it
        delete outTombs[id]; // remote edit outlives our delete — restore the item
        changed = true;
      }
      if (!local || ts > localTs) {
        byId.set(id, toLocal(row));
        changed = true;
      }
    }
    return { items: [...byId.values()], tombs: outTombs, changed };
  }

  /* ---------- sync cycle: pull → merge → apply → push ---------- */

  // Supabase caps responses at 1000 rows by default; page through so pulls
  // never silently truncate as the tables grow
  async function fetchAll(table) {
    const PAGE = 1000;
    const rows = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from(table).select('*').order('id').range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) return rows;
    }
  }

  function retryWhileBusy() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(fullSync, 2000);
  }

  async function fullSync() {
    if (!session) return;
    // applying remote data re-renders the list, which would detach a row the
    // user is mid-swipe on — defer the whole cycle until the gesture ends
    if (window.inkApp.busy) { retryWhileBusy(); return; }
    if (syncing) { queued = true; return; }
    syncing = true;
    setStatus('syncing…');
    try {
      const notesRows = await fetchAll('notes');
      if (window.inkApp.busy) { retryWhileBusy(); return; }

      const s = window.inkApp.state;
      const del = s.deleted || { notes: {} };
      const n = merge(s.notes, del.notes, notesRows, rowToNote);
      if (n.changed) {
        window.inkApp.applyRemote({ notes: n.items, deleted: { notes: n.tombs } });
      }

      const cur = window.inkApp.state;
      // tombstone keys must exactly match noteToRow's — PostgREST rejects bulk
      // upserts whose objects have different key sets
      const noteRows = cur.notes.map(noteToRow)
        .concat(Object.entries(n.tombs).map(([id, ts]) => tombRow(id, ts, { text: '' })));
      if (noteRows.length) {
        const { error } = await db.from('notes').upsert(noteRows);
        if (error) throw error;
      }
      setStatus('synced', 'ok');
    } catch (e) {
      console.error('ink sync failed:', e);
      setStatus(navigator.onLine ? 'sync error' : 'offline', 'err');
    } finally {
      syncing = false;
      if (queued) { queued = false; fullSync(); }
    }
  }
})();
