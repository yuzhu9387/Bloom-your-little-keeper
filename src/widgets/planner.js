// Weekly task board: seven day columns (Mon–Sun), each a plain vertical list of
// tasks. Check a task to clear it from the board (kept in the data file as
// history), or hit ✕ to delete it for good. Long text is truncated to one line;
// click it for a popup with the full, editable text. Drag a task to reorder it
// within a column or move it to another day.
import { scheduleSave } from '../store.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const plannerDefaults = () => ({
  title: 'Weekly Plan',
  // entries: day-index -> ordered tasks. Keys "0".."6" (0=Mon … 6=Sun).
  entries: {}
});

function uid(p) {
  return p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

function todayIdx() { return (new Date().getDay() + 6) % 7; } // JS 0=Sun → 0=Mon

// Collapse the old "day-hour" hourly shape into per-day lists, and strip fields
// that no longer exist. Idempotent for already-migrated (plain-integer) data.
function migrate(d) {
  delete d.view;
  delete d.selectedDay;
  if (!d.entries || typeof d.entries !== 'object') { d.entries = {}; return; }
  const legacy = Object.keys(d.entries).some((k) => k.includes('-'));
  if (legacy) {
    const byDay = {};
    Object.keys(d.entries)
      .filter((k) => Array.isArray(d.entries[k]))
      .sort((a, b) => {
        const [da, ha] = a.split('-').map(Number);
        const [db, hb] = b.split('-').map(Number);
        return da - db || ha - hb; // group by day, ordered by hour within a day
      })
      .forEach((k) => {
        const day = k.includes('-') ? k.split('-')[0] : k;
        (byDay[day] = byDay[day] || []).push(...d.entries[k]);
      });
    d.entries = byDay;
  }
  for (const k of Object.keys(d.entries)) {
    if (!Array.isArray(d.entries[k])) { delete d.entries[k]; continue; }
    d.entries[k].forEach((e) => { delete e.task; if (typeof e.done !== 'boolean') e.done = false; });
  }
}

export function renderPlanner(body, widget, onTitle) {
  const d = widget.data;
  migrate(d);
  onTitle(d.title);
  closeDetail(true); // any open popup belongs to the previous render
  body.innerHTML = '';
  body.classList.add('planner-body');

  const board = document.createElement('div');
  board.className = 'planner-board';
  for (let day = 0; day < 7; day++) board.appendChild(renderColumn(day));
  body.appendChild(board);

  function rerender() {
    const cols = [...body.querySelectorAll('.board-list')].map((c) => c.scrollTop);
    const sl = board.scrollLeft;
    renderPlanner(body, widget, onTitle);
    body.querySelectorAll('.board-list').forEach((c, i) => { if (cols[i] != null) c.scrollTop = cols[i]; });
    const nb = body.querySelector('.planner-board');
    if (nb) nb.scrollLeft = sl;
  }

  function tasksAt(day) {
    const list = d.entries[day];
    return Array.isArray(list) ? list : [];
  }

  function deleteTask(task, day) {
    const list = tasksAt(day);
    const i = list.indexOf(task);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) delete d.entries[day];
    scheduleSave(); rerender();
  }

  function renderColumn(day) {
    const col = document.createElement('div');
    col.className = 'board-col';
    col.dataset.day = day;

    const head = document.createElement('div');
    head.className = 'board-col-head';
    head.textContent = DAYS[day];
    if (day === todayIdx()) head.classList.add('today');
    col.appendChild(head);

    const list = document.createElement('div');
    list.className = 'board-list';
    list.dataset.day = day;
    tasksAt(day).forEach((task) => { if (!task.done) list.appendChild(renderTaskRow(task, day)); });

    // Drop target: reorder within this column, or accept a task from another day.
    list.addEventListener('dragover', (e) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearIndicators();
      const ref = insertRef(list, e.clientY);
      if (ref) ref.classList.add('drop-before'); else list.classList.add('drop-end');
    });
    list.addEventListener('dragleave', (e) => { if (!list.contains(e.relatedTarget)) clearIndicators(); });
    list.addEventListener('drop', (e) => {
      if (!dragging) return;
      e.preventDefault();
      const ref = insertRef(list, e.clientY);
      const beforeId = ref ? ref.dataset.taskId : null;
      clearIndicators();
      moveTask(dragging, day, beforeId);
      dragging = null;
    });

    col.appendChild(addRow(day));
    col.appendChild(list);
    return col;
  }

  // The task row to insert before within a list (null = append at the end).
  function insertRef(list, y) {
    const rows = [...list.querySelectorAll('.planner-task:not(.dragging-item)')];
    for (const r of rows) {
      const b = r.getBoundingClientRect();
      if (y < b.top + b.height / 2) return r;
    }
    return null;
  }

  function clearIndicators() {
    board.querySelectorAll('.drop-before, .drop-end')
      .forEach((e) => e.classList.remove('drop-before', 'drop-end'));
  }

  // Move a task to `day`, inserted before task `beforeId` (or appended). For a
  // same-day move, `from` and `to` are the same array — reorder in place.
  function moveTask(drag, day, beforeId) {
    const from = tasksAt(drag.day);
    const fi = from.findIndex((t) => t.id === drag.id);
    if (fi < 0) return;
    const [task] = from.splice(fi, 1);
    const to = (d.entries[day] = tasksAt(day));
    let at = to.length;
    if (beforeId) { const bi = to.findIndex((t) => t.id === beforeId); if (bi >= 0) at = bi; }
    to.splice(at, 0, task);
    // Only a cross-day move can leave the source column empty.
    if (String(drag.day) !== String(day) && from.length === 0) delete d.entries[drag.day];
    scheduleSave(); rerender();
  }

  function addRow(day) {
    const add = document.createElement('div');
    add.className = 'planner-add-row';
    const input = document.createElement('input');
    input.className = 'planner-input';
    input.placeholder = 'New task…';
    input.spellcheck = true;
    const fire = () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      (d.entries[day] = tasksAt(day)).unshift({ id: uid('p'), text, done: false });
      scheduleSave(); rerender();
      // keep focus in the same column's input after the rerender
      const col = body.querySelector(`.board-col[data-day="${day}"] .planner-input`);
      col?.focus();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });
    add.appendChild(input);
    return add;
  }

  // Reuses the todo row look (.todo-item / .striking) with board behaviour:
  // draggable, truncated text that opens a detail popup, and a ✕ that deletes.
  function renderTaskRow(task, day) {
    const row = document.createElement('div');
    row.className = 'todo-item planner-task';
    row.dataset.taskId = task.id;
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      dragging = { id: task.id, day: String(day) };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', task.text);
      row.classList.add('dragging-item');
    });
    row.addEventListener('dragend', () => {
      dragging = null;
      row.classList.remove('dragging-item');
      clearIndicators();
    });

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = false;
    cb.title = 'Mark done (clears from board, kept in history)';
    cb.addEventListener('change', () => {
      row.classList.add('striking');
      let fired = false;
      const finish = () => { if (fired) return; fired = true; task.done = true; scheduleSave(); rerender(); };
      text.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 700);
    });

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = task.text;
    text.title = task.text;
    text.addEventListener('click', () => openDetail(row, task, day));

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Delete permanently';
    del.addEventListener('click', () => deleteTask(task, day));

    row.append(cb, text, del);
    return row;
  }

  // Floating popup with the full, editable task text. Blur/Esc/outside-click
  // commits; emptying deletes the task.
  function openDetail(anchor, task, day) {
    closeDetail();
    const pop = document.createElement('div');
    pop.className = 'planner-popup';

    const area = document.createElement('textarea');
    area.value = task.text;
    area.spellcheck = true;
    area.rows = 3;
    pop.appendChild(area);
    document.body.appendChild(pop);

    const r = anchor.getBoundingClientRect();
    const w = 240;
    pop.style.width = w + 'px';
    pop.style.left = Math.min(r.left, window.innerWidth - w - 12) + 'px';
    pop.style.top = (r.bottom + 6) + 'px';

    let committed = false;
    // `render` is false when a rerender itself is tearing the popup down — persist
    // the edit but skip triggering another rerender (which is already happening).
    const commit = (render = true) => {
      if (committed) return;
      committed = true;
      document.removeEventListener('mousedown', onOutside, true);
      pop.remove();
      activeDetail = null;
      const v = area.value.trim();
      if (!v) {
        const list = tasksAt(day);
        const i = list.indexOf(task);
        if (i >= 0) list.splice(i, 1);
        if (list.length === 0) delete d.entries[day];
        scheduleSave();
        if (render) rerender();
      } else if (v !== task.text) {
        task.text = v; scheduleSave();
        if (render) rerender();
      }
    };
    const onOutside = (e) => { if (!pop.contains(e.target)) commit(); };
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); commit(); }
    });
    area.addEventListener('blur', commit);
    document.addEventListener('mousedown', onOutside, true);

    activeDetail = { commit };
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }
}

// The task currently being dragged: { id, day } of its source column.
let dragging = null;

// A single shared popup handle so a rerender or a new popup closes the old one.
// Rerender-driven closes pass render=false to avoid recursing into rerender.
let activeDetail = null;
function closeDetail(fromRender) { if (activeDetail) activeDetail.commit(!fromRender); }
