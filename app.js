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
    const n = { id: Date.now(), text: '', createdAt: Date.now(), updatedAt: Date.now() };
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
    const top = el('div', 'note-row-top');
    top.append(
      el('span', 'note-title', (n.text.split('\n')[0] || '').trim() || 'Untitled note'),
      el('span', 'note-meta', fmtDate(n.updatedAt) + (n.id === state.activeId ? ' · open' : ''))
    );
    const snippet = n.text.split('\n').slice(1).join(' ').trim() || (n.text.trim() ? '' : 'Empty');
    row.append(top, el('span', 'note-snippet', snippet));
    row.addEventListener('click', () => set({ activeId: n.id, view: 'note' }));
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

/* ---------- manual drag-reorder (pointer events: works for touch + mouse) ---------- */

function attachDrag(grip, row) {
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    row.classList.add('dragging');
    const container = row.parentElement;

    const move = (ev) => {
      const rows = [...container.children];
      const y = ev.clientY;
      const rowIdx = rows.indexOf(row);
      for (const other of rows) {
        if (other === row) continue;
        const r = other.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const otherIdx = rows.indexOf(other);
        if (otherIdx < rowIdx && y < mid) { container.insertBefore(row, other); break; }
        if (otherIdx > rowIdx && y > mid) { container.insertBefore(row, other.nextSibling); break; }
      }
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      row.classList.remove('dragging');
      commitOrder(container);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
}

function commitOrder(container) {
  const order = [...container.children].map((r) => Number(r.dataset.id));
  const byId = new Map(state.tasks.map((t) => [t.id, t]));
  const reordered = order.map((id) => byId.get(id)).filter(Boolean);
  const done = state.tasks.filter((t) => t.done);
  set({ tasks: [...reordered, ...done] });
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
      { id: Date.now(), title, due: dueInput.value || null, done: false, createdAt: Date.now() },
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
    const n = { id: Date.now(), text: '', createdAt: Date.now(), updatedAt: Date.now() };
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
