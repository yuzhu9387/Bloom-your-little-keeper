// Weekly planner card: a Mon–Sun grid with one row per hour. Each cell holds
// any number of entries; an entry committed with a "/t " prefix becomes a
// checkable task (shared task row), everything else is plain editable text.
// The grid is a fixed weekly template — not bound to dates — with today's
// column and the current hour highlighted.
import { scheduleSave } from '../store.js';
import { renderTaskRow } from './task-row.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const plannerDefaults = () => ({
  title: 'Weekly Plan',
  // entries: { "day-hour": [ {id, text, task, done} ] }  day 0=Mon … 6=Sun
  entries: {}
});

function uid(p) {
  return p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

const cellKey = (day, hour) => day + '-' + hour;
const TASK_PREFIX = /^\/t(\s+|$)/;

export function renderPlanner(body, widget, onTitle) {
  const d = widget.data;
  if (!d.entries || typeof d.entries !== 'object') d.entries = {};
  onTitle(d.title);
  body.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'planner-grid';

  const corner = document.createElement('div');
  corner.className = 'planner-corner';
  grid.appendChild(corner);
  DAYS.forEach((name, day) => {
    const h = document.createElement('div');
    h.className = 'planner-day-head';
    h.dataset.day = day;
    h.textContent = name;
    grid.appendChild(h);
  });

  for (let hour = 0; hour < 24; hour++) {
    const t = document.createElement('div');
    t.className = 'planner-hour';
    t.dataset.hour = hour;
    t.textContent = hour + ':00';
    grid.appendChild(t);
    for (let day = 0; day < 7; day++) grid.appendChild(renderCell(day, hour));
  }

  // A thin line marking the current time, drawn over today's column at the
  // exact minute. Positioned from live layout so it stays right as cells grow.
  const nowLine = document.createElement('div');
  nowLine.className = 'planner-now-line';
  grid.appendChild(nowLine);
  body.appendChild(grid);

  applyNow();
  requestAnimationFrame(positionNowLine); // needs layout before it can measure
  // One highlight timer per card body; guard against the card being removed.
  if (body.__nowTimer) clearInterval(body.__nowTimer);
  body.__nowTimer = setInterval(() => {
    if (!body.isConnected) { clearInterval(body.__nowTimer); body.__nowTimer = null; return; }
    applyNow();
  }, 60 * 1000);

  // First open: scroll the morning into view. Rerenders keep their position.
  if (!body.dataset.scrolled) {
    body.dataset.scrolled = '1';
    requestAnimationFrame(() => {
      const row = grid.querySelector('.planner-hour[data-hour="7"]');
      if (row) body.scrollTop = row.getBoundingClientRect().top - grid.getBoundingClientRect().top - 34;
    });
  }

  function rerender() {
    const st = body.scrollTop, sl = body.scrollLeft;
    renderPlanner(body, widget, onTitle);
    body.scrollTop = st;
    body.scrollLeft = sl;
  }

  function applyNow() {
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // JS 0=Sun → 0=Mon
    const hour = now.getHours();
    grid.querySelectorAll('.today, .now').forEach((el) => el.classList.remove('today', 'now'));
    grid.querySelectorAll(`[data-day="${day}"]`).forEach((el) => el.classList.add('today'));
    grid.querySelectorAll(`[data-hour="${hour}"]`).forEach((el) => el.classList.add('now'));
    positionNowLine();
  }

  // Place the now-line at minute-precision over today's current-hour cell.
  function positionNowLine() {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    const cell = grid.querySelector(`.planner-cell[data-day="${day}"][data-hour="${now.getHours()}"]`);
    if (!cell) { nowLine.style.display = 'none'; return; }
    nowLine.style.display = 'block';
    nowLine.style.left = cell.offsetLeft + 'px';
    nowLine.style.width = cell.offsetWidth + 'px';
    nowLine.style.top = (cell.offsetTop + (now.getMinutes() / 60) * cell.offsetHeight) + 'px';
  }

  function entriesAt(day, hour) {
    const list = d.entries[cellKey(day, hour)];
    return Array.isArray(list) ? list : [];
  }

  function removeEntry(entry, day, hour) {
    const k = cellKey(day, hour);
    const list = entriesAt(day, hour);
    const i = list.indexOf(entry);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) delete d.entries[k];
    scheduleSave(); rerender();
  }

  function renderCell(day, hour) {
    const cell = document.createElement('div');
    cell.className = 'planner-cell';
    cell.dataset.day = day;
    cell.dataset.hour = hour;

    entriesAt(day, hour).forEach((entry) => {
      cell.appendChild(entry.task ? renderTaskEntry(entry, day, hour) : renderPlainEntry(entry, day, hour));
    });

    const add = document.createElement('button');
    add.className = 'planner-add';
    add.textContent = '＋';
    add.title = 'Add plan — start with "/t " to make it a task';
    add.addEventListener('click', () => openInput(cell, day, hour, add));
    cell.appendChild(add);
    return cell;
  }

  function openInput(cell, day, hour, addBtn) {
    const existing = cell.querySelector('.planner-input');
    if (existing) { existing.focus(); return; }
    const input = document.createElement('input');
    input.className = 'planner-input';
    input.placeholder = 'Plan… ("/t " = task)';
    input.spellcheck = true;
    let closed = false;
    const commit = () => {
      if (closed) return;
      closed = true;
      const raw = input.value.trim();
      input.remove();
      if (!raw) return;
      const isTask = TASK_PREFIX.test(raw);
      const text = isTask ? raw.replace(TASK_PREFIX, '') : raw;
      if (!text) return;
      const k = cellKey(day, hour);
      (d.entries[k] = d.entries[k] || []).push({ id: uid('p'), text, task: isTask, done: false });
      scheduleSave(); rerender();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      else if (e.key === 'Escape') { closed = true; input.remove(); }
    });
    input.addEventListener('blur', commit);
    cell.insertBefore(input, addBtn);
    input.focus();
  }

  function renderTaskEntry(entry, day, hour) {
    return renderTaskRow(entry, {
      extraClass: 'planner-task',
      onToggle: (done) => { entry.done = done; scheduleSave(); rerender(); },
      onEdit: (v) => { entry.text = v; scheduleSave(); },
      onDelete: () => removeEntry(entry, day, hour)
    }).row;
  }

  function renderPlainEntry(entry, day, hour) {
    const row = document.createElement('div');
    row.className = 'planner-entry';

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = entry.text;
    text.contentEditable = 'plaintext-only';
    text.spellcheck = true;
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); text.blur(); } });
    text.addEventListener('blur', () => {
      const v = text.textContent.trim();
      if (!v) return removeEntry(entry, day, hour);
      if (TASK_PREFIX.test(v)) {
        // Typing a "/t " prefix into a plain entry converts it to a task.
        const stripped = v.replace(TASK_PREFIX, '');
        if (stripped) { entry.text = stripped; entry.task = true; scheduleSave(); rerender(); }
        else { text.textContent = entry.text; } // just "/t" — keep the old text
      } else if (v !== entry.text) { entry.text = v; scheduleSave(); }
    });

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Delete';
    del.addEventListener('click', () => removeEntry(entry, day, hour));

    row.append(text, del);
    return row;
  }
}
