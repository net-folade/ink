'use strict';

const KEY = 'ink-tasks-notes-v1';

const state = {
  view: 'note',
  notes: [],
  activeId: null,
  tasks: [],
  sort: 'added',
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
    state.tasks = s.tasks || [];
    state.sort = s.sort || 'added';
  } else {
    const n = { id: uid(), text: '', createdAt: Date.now(), updatedAt: Date.now() };
    state.notes = [n];
    state.activeId = n.id;
  }
}

function save() {
  const { notes, activeId, tasks, sort } = state;
  try { localStorage.setItem(KEY, JSON.stringify({ notes, activeId, tasks, sort })); } catch (e) {}
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

function fmtDue(due) {
  if (!due) return 'no due date';
  const d = new Date(due + 'T00:00'), today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return 'due today';
  return 'due ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  $('nav-tasks').classList.toggle('active', view === 'tasks');
  $('view-note').hidden = view !== 'note';
  $('view-all').hidden = view !== 'all';
  $('view-tasks').hidden = view !== 'tasks';
  if (view === 'note') renderNote();
  else if (view === 'all') renderAll();
  else renderTasks();
}

function renderNote() {
  const active = activeNote();
  const editor = $('editor');
  const text = active ? active.text : '';
  if (editor.value !== text) editor.value = text;
  updateSavedMeta();
}

function updateSavedMeta() {
  const active = activeNote();
  $('saved-meta').textContent =
    active && active.text.trim() ? 'saved · persists until you start a new note' : '';
}

function renderAll() {
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

function renderTasks() {
  renderChips();

  let open = state.tasks.filter((t) => !t.done);
  if (state.sort === 'added') open = open.slice().sort((a, b) => a.createdAt - b.createdAt);
  else if (state.sort === 'due') {
    open = open.slice().sort(
      (a, b) =>
        (a.due ? new Date(a.due).getTime() : Infinity) -
        (b.due ? new Date(b.due).getTime() : Infinity)
    );
  }
  const manual = state.sort === 'manual';
  const todayStr = new Date().toISOString().slice(0, 10);

  const list = $('active-tasks');
  list.textContent = '';
  for (const t of open) {
    const row = el('div', 'task-row' + (manual ? ' draggable' : ''));
    row.dataset.id = t.id;
    const grip = el('span', 'grip', '⠿');
    const check = el('span', 'task-check');
    check.addEventListener('click', () =>
      set({ tasks: state.tasks.map((x) => (x.id === t.id ? { ...x, done: true } : x)) })
    );
    const due = el('span', 'task-due' + (t.due && t.due <= todayStr ? ' soon' : ''), fmtDue(t.due));
    row.append(grip, check, el('span', 'task-title', t.title), due);
    if (manual) attachDrag(grip, row);
    list.append(row);
  }
  $('no-tasks').hidden = open.length !== 0;

  const done = state.tasks.filter((t) => t.done);
  $('done-section').hidden = done.length === 0;
  $('done-count').textContent = done.length;
  const doneList = $('done-tasks');
  doneList.textContent = '';
  for (const t of done) {
    const row = el('div', 'done-row');
    const check = el('span', 'done-check', '✓');
    check.addEventListener('click', () =>
      set({ tasks: state.tasks.map((x) => (x.id === t.id ? { ...x, done: false } : x)) })
    );
    row.append(el('span', 'done-spacer'), check, el('span', 'done-title', t.title));
    doneList.append(row);
  }
}

function renderChips() {
  const chips = [['added', 'Date added'], ['due', 'Due date'], ['manual', 'Manual ⠿']];
  const box = $('sort-chips');
  box.textContent = '';
  for (const [k, label] of chips) {
    const chip = el('span', 'chip' + (state.sort === k ? ' active' : ''), label);
    chip.addEventListener('click', () => set({ sort: k }));
    box.append(chip);
  }
}

/* ---------- manual drag-reorder (pointer events: works for touch + mouse) ----------
   The dragged row follows the pointer via CSS transforms and siblings shift out of
   the way; nothing moves in the DOM until pointerup. Moving the row mid-drag would
   detach it and silently release the pointer capture (the original one-slot bug). */

function moveOpenTask(from, to) {
  if (from === to) return;
  const open = state.tasks.filter((t) => !t.done);
  const done = state.tasks.filter((t) => t.done);
  const [moved] = open.splice(from, 1);
  open.splice(to, 0, moved);
  set({ tasks: [...open, ...done] });
}

function attachDrag(grip, row) {
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { grip.setPointerCapture(e.pointerId); } catch (err) {}
    const container = row.parentElement;
    const rows = [...container.children];
    const startIdx = rows.indexOf(row);
    const rects = rows.map((r) => r.getBoundingClientRect());
    const h = rects[startIdx].height;
    let target = startIdx;
    row.classList.add('dragging');
    container.classList.add('drag-active');

    const move = (ev) => {
      const dy = ev.clientY - e.clientY;
      row.style.transform = `translateY(${dy}px)`;
      const center = rects[startIdx].top + h / 2 + dy;
      target = rows.reduce(
        (t, _, i) => t + (i !== startIdx && rects[i].top + rects[i].height / 2 < center ? 1 : 0),
        0
      );
      rows.forEach((r, i) => {
        if (i === startIdx) return;
        let shift = 0;
        if (i > startIdx && i <= target) shift = -h;
        else if (i < startIdx && i >= target) shift = h;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const up = (ev) => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      row.classList.remove('dragging');
      container.classList.remove('drag-active');
      rows.forEach((r) => (r.style.transform = ''));
      if (ev.type === 'pointercancel') render();
      else moveOpenTask(startIdx, target);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
}

/* ---------- swipe-to-delete notes (pointer events: touch swipe or mouse drag) ---------- */

const SWIPE_W = 88;
let openSwipe = null;

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

/* ---------- events ---------- */

function addTask() {
  const titleInput = $('new-task');
  const dueInput = $('new-due');
  const title = titleInput.value.trim();
  if (!title) return;
  set({
    tasks: [
      ...state.tasks,
      { id: uid(), title, due: dueInput.value || null, done: false, createdAt: Date.now() },
    ],
  });
  titleInput.value = '';
  dueInput.value = '';
}

function init() {
  load();

  $('logo').addEventListener('click', () => set({ view: 'note' }));
  $('nav-note').addEventListener('click', () => set({ view: 'note' }));
  $('nav-all').addEventListener('click', () => set({ view: 'all' }));
  $('nav-tasks').addEventListener('click', () => set({ view: 'tasks' }));

  $('editor').addEventListener('input', (e) => {
    const n = activeNote();
    if (!n) return;
    n.text = e.target.value;
    n.updatedAt = Date.now();
    save();
    updateSavedMeta();
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

  $('add-task').addEventListener('click', addTask);
  $('new-task').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTask();
  });

  $('delete-done').addEventListener('click', () =>
    set({ tasks: state.tasks.filter((t) => !t.done) })
  );

  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

init();
