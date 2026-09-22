'use strict';

const KEY = 'ink-tasks-notes-v1';

const state = {
  view: 'note',
  notes: [],
  activeId: null,
  deleted: { notes: {} }, // tombstones (id → deletedAt ms) so sync can propagate deletes
};

const $ = (id) => document.getElementById(id);

// Date.now() alone collides when two items are created in the same millisecond
let uidSeq = 0;
const uid = () => Date.now() * 1000 + (uidSeq = (uidSeq + 1) % 1000);

/* ---------- persistence ---------- */

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (s && s.notes && s.notes.length) {
    state.notes = s.notes;
    state.activeId = s.activeId ?? s.notes[0].id;
    if (s.deleted && s.deleted.notes) state.deleted = { notes: s.deleted.notes };
  } else {
    const n = { id: uid(), text: '', createdAt: Date.now(), updatedAt: Date.now() };
    state.notes = [n];
    state.activeId = n.id;
  }
}

let applyingRemote = false;

function save() {
  const { notes, activeId, deleted } = state;
  try { localStorage.setItem(KEY, JSON.stringify({ notes, activeId, deleted })); } catch (e) {}
  if (!applyingRemote) document.dispatchEvent(new Event('ink:change'));
}

function set(patch) {
  Object.assign(state, patch);
  save();
  render();
}

/* ---------- helpers ---------- */

function activeNote() {
  return state.notes.find((n) => n.id === state.activeId);
}

function fmtDate(ts) {
  const d = new Date(ts), today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function download(ext) {
  const active = activeNote();
  const text = active ? active.text : '';
  const first = (text.split('\n')[0] || 'note').trim().slice(0, 40) || 'note';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = first.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.' + ext;
  a.click();
  URL.revokeObjectURL(a.href);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- render ---------- */

function render() {
  const { view } = state;
  $('nav-note').classList.toggle('active', view === 'note');
  $('nav-all').classList.toggle('active', view === 'all');
  $('view-note').hidden = view !== 'note';
  $('view-all').hidden = view !== 'all';
  if (view === 'note') renderNote();
  else renderAll();
}

function renderNote() {
  const active = activeNote();
  const editor = $('editor');
  const text = active ? active.text : '';
  if (editor.value !== text) {
    // a synced update can rewrite the textarea mid-edit; keep the caret in place
    const focused = document.activeElement === editor;
    const start = editor.selectionStart, end = editor.selectionEnd;
    editor.value = text;
    if (focused) editor.setSelectionRange(Math.min(start, text.length), Math.min(end, text.length));
  }
}

function renderAll() {
  openSwipe = null; // rows are rebuilt closed; drop any handle to a detached node
  const active = activeNote();
  $('note-count').textContent = '· ' + state.notes.length;
  const list = $('notes-list');
  list.textContent = '';
  const sorted = state.notes.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  for (const n of sorted) {
    const row = el('div', 'note-row' + (n.id === state.activeId ? ' open' : ''));
    const inner = el('div', 'note-inner');
    const top = el('div', 'note-row-top');
    const x = el('span', 'note-x', '×');
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSwipe();
      inner.style.transform = `translateX(${-SWIPE_W}px)`;
      openSwipe = inner;
    });
    top.append(
      el('span', 'note-title', (n.text.split('\n')[0] || '').trim() || 'Untitled note'),
      el('span', 'note-meta', fmtDate(n.updatedAt) + (n.id === state.activeId ? ' · open' : '')),
      x
    );
    const snippet = n.text.split('\n').slice(1).join(' ').trim() || (n.text.trim() ? '' : 'Empty');
    inner.append(top, el('span', 'note-snippet', snippet));
    const del = el('span', 'note-del', 'Delete');
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(n.id);
    });
    row.append(del, inner);
    attachSwipe(row, inner, () => set({ activeId: n.id, view: 'note' }));
    list.append(row);
  }
  $('no-notes').hidden = !(state.notes.length <= 1 && (!active || !active.text.trim()));
}

/* ---------- swipe-to-delete notes (pointer events: touch swipe or mouse drag) ---------- */

const SWIPE_W = 88;
let openSwipe = null;
let uiBusy = false; // true during an active drag/swipe; sync defers applying remote data

function closeSwipe() {
  if (openSwipe) {
    openSwipe.style.transform = '';
    openSwipe = null;
  }
}

function attachSwipe(row, inner, onTap) {
  row.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.note-del, .note-x')) return;
    try { row.setPointerCapture(e.pointerId); } catch (err) {}
    const startX = e.clientX, startY = e.clientY;
    const base = openSwipe === inner ? -SWIPE_W : 0;
    let swiping = false;
    uiBusy = true;

    const move = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!swiping && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        swiping = true;
        inner.style.transition = 'none';
      }
      if (swiping) {
        const x = Math.min(0, Math.max(-SWIPE_W, base + dx));
        inner.style.transform = `translateX(${x}px)`;
      }
    };
    const up = (ev) => {
      uiBusy = false;
      row.removeEventListener('pointermove', move);
      row.removeEventListener('pointerup', up);
      row.removeEventListener('pointercancel', up);
      inner.style.transition = '';
      if (swiping) {
        const x = base + (ev.clientX - startX);
        closeSwipe();
        if (ev.type !== 'pointercancel' && x < -SWIPE_W / 2) {
          inner.style.transform = `translateX(${-SWIPE_W}px)`;
          openSwipe = inner;
        } else {
          inner.style.transform = '';
        }
      } else if (ev.type !== 'pointercancel') {
        if (openSwipe) closeSwipe();
        else onTap();
      }
    };
    row.addEventListener('pointermove', move);
    row.addEventListener('pointerup', up);
    row.addEventListener('pointercancel', up);
  });
}

function deleteNote(id) {
  state.deleted.notes[id] = Date.now();
  let notes = state.notes.filter((n) => n.id !== id);
  let activeId = state.activeId;
  if (!notes.length) {
    notes = [{ id: uid(), text: '', createdAt: Date.now(), updatedAt: Date.now() }];
  }
  if (!notes.some((n) => n.id === activeId)) {
    activeId = notes.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
  }
  openSwipe = null;
  set({ notes, activeId });
}

/* ---------- v2 sync bridge (used by sync.js) ---------- */

window.inkApp = {
  get state() { return state; },
  get busy() { return uiBusy; },
  applyRemote({ notes, deleted }) {
    if (!notes.length) {
      notes = [{ id: uid(), text: '', createdAt: Date.now(), updatedAt: Date.now() }];
    }
    let activeId = state.activeId;
    if (!notes.some((n) => n.id === activeId)) {
      activeId = notes.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
    }
    // suppress ink:change so applying pulled data doesn't re-trigger a sync
    applyingRemote = true;
    try { set({ notes, deleted, activeId }); } finally { applyingRemote = false; }
  },
};

/* ---------- viewport ---------- */

// 100dvh ignores the on-screen keyboard, which pushes the note footer out of
// sight while typing. Track the actually-visible viewport instead.
function fitToViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const fit = () => {
    if (vv.scale !== 1) return; // while pinch-zoomed vv.height is the zoomed box, not the app
    const style = document.documentElement.style;
    style.setProperty('--app-h', vv.height + 'px');
    // keyboard up: the app already ends above it, so drop the home-bar inset
    style.setProperty('--safe-bottom', window.innerHeight - vv.height > 80 ? '0px' : '');
    window.scrollTo(0, 0); // ios still scrolls the layout viewport when an input is focused
  };
  vv.addEventListener('resize', fit);
  window.addEventListener('pageshow', fit); // bfcache restore can skip the resize event
  fit();
}

/* ---------- events ---------- */

function init() {
  load();

  $('logo').addEventListener('click', () => set({ view: 'note' }));
  $('nav-note').addEventListener('click', () => set({ view: 'note' }));
  $('nav-all').addEventListener('click', () => set({ view: 'all' }));

  $('editor').addEventListener('input', (e) => {
    const n = activeNote();
    if (!n) return;
    n.text = e.target.value;
    n.updatedAt = Date.now();
    save();
  });

  $('dl-txt').addEventListener('click', () => download('txt'));
  $('dl-md').addEventListener('click', () => download('md'));

  $('new-note').addEventListener('click', () => {
    const active = activeNote();
    if (active && !active.text.trim()) return;
    const n = { id: uid(), text: '', createdAt: Date.now(), updatedAt: Date.now() };
    set({ notes: [...state.notes, n], activeId: n.id, view: 'note' });
    $('editor').focus();
  });

  fitToViewport();
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
