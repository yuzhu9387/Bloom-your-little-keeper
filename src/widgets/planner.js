// Weekly planner card: a task board over a Mon–Sun × hourly grid with two
// views. Week shows all seven days; Day shows one day, both inside the card's
// own frame (no fullscreen — the card keeps its size and never covers others). Every entry
// is a task — check it to clear it from the board (kept in the data file as
// history), or hit ✕ to delete it for good. Long text is truncated to one line;
// click it for a popup with the full, editable text.
import { scheduleSave } from '../store.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FULL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const plannerDefaults = () => ({
  title: 'Weekly Plan',
  view: 'week',       // 'week' | 'day'
  selectedDay: todayIdx(),
  // entries: { "day-hour": [ {id, text, done} ] }  day 0=Mon … 6=Sun
  entries: {}
});

function uid(p) {
  return p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

function todayIdx() { return (new Date().getDay() + 6) % 7; } // JS 0=Sun → 0=Mon
const cellKey = (day, hour) => day + '-' + hour;

// Bring older data forward: everything is a task now, so drop the `task` flag
// and make sure the view fields exist.
function migrate(d) {
  if (d.view !== 'day') d.view = 'week';
  if (typeof d.selectedDay !== 'number') d.selectedDay = todayIdx();
  if (!d.entries || typeof d.entries !== 'object') d.entries = {};
  for (const k of Object.keys(d.entries)) {
    const list = d.entries[k];
    if (!Array.isArray(list)) { delete d.entries[k]; continue; }
    list.forEach((e) => { delete e.task; if (typeof e.done !== 'boolean') e.done = false; });
  }
}

export function renderPlanner(body, widget, onTitle) {
  const d = widget.data;
  migrate(d);
  onTitle(d.title);
  closeDetail(true); // any open popup belongs to the previous render
  body.innerHTML = '';
  body.classList.add('planner-body');

  const days = d.view === 'day' ? [d.selectedDay] : [0, 1, 2, 3, 4, 5, 6];

  body.appendChild(buildToolbar());

  const scroll = document.createElement('div');
  scroll.className = 'planner-scroll';
  body.appendChild(scroll);

  const grid = document.createElement('div');
  grid.className = 'planner-grid';
  grid.style.gridTemplateColumns = `54px repeat(${days.length}, minmax(120px, 1fr))`;

  const corner = document.createElement('div');
  corner.className = 'planner-corner';
  grid.appendChild(corner);
  days.forEach((day) => {
    const h = document.createElement('div');
    h.className = 'planner-day-head';
    h.dataset.day = day;
    h.textContent = d.view === 'day' ? FULL_DAYS[day] : DAYS[day];
    if (d.view === 'week') {
      h.classList.add('clickable');
      h.title = 'Open this day';
      h.addEventListener('click', () => { d.selectedDay = day; d.view = 'day'; scheduleSave(); rerender(); });
    }
    grid.appendChild(h);
  });

  for (let hour = 0; hour < 24; hour++) {
    const t = document.createElement('div');
    t.className = 'planner-hour';
    t.dataset.hour = hour;
    t.textContent = hour + ':00';
    grid.appendChild(t);
    days.forEach((day) => grid.appendChild(renderCell(day, hour)));
  }

  const nowLine = document.createElement('div');
  nowLine.className = 'planner-now-line';
  grid.appendChild(nowLine);
  scroll.appendChild(grid);

  applyNow();
  requestAnimationFrame(positionNowLine); // needs layout before it can measure

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
      if (row) scroll.scrollTop = row.offsetTop - 34;
    });
  }

  function rerender() {
    const st = scroll.scrollTop, sl = scroll.scrollLeft;
    renderPlanner(body, widget, onTitle);
    const ns = body.querySelector('.planner-scroll');
    if (ns) { ns.scrollTop = st; ns.scrollLeft = sl; }
  }

  function buildToolbar() {
    const bar = document.createElement('div');
    bar.className = 'planner-toolbar';

    const seg = document.createElement('div');
    seg.className = 'planner-seg';
    ['week', 'day'].forEach((v) => {
      const b = document.createElement('button');
      b.textContent = v === 'week' ? 'Week' : 'Day';
      if (d.view === v) b.classList.add('active');
      b.addEventListener('click', () => { if (d.view !== v) { d.view = v; scheduleSave(); rerender(); } });
      seg.appendChild(b);
    });
    bar.appendChild(seg);

    if (d.view === 'day') {
      const nav = document.createElement('div');
      nav.className = 'planner-daynav';
      const prev = navBtn('‹', -1);
      const label = document.createElement('span');
      label.className = 'planner-daynav-label';
      label.textContent = FULL_DAYS[d.selectedDay];
      const next = navBtn('›', 1);
      nav.append(prev, label, next);
      bar.appendChild(nav);
    }
    return bar;
  }

  function navBtn(glyph, delta) {
    const b = document.createElement('button');
    b.className = 'planner-daynav-btn';
    b.textContent = glyph;
    b.addEventListener('click', () => {
      d.selectedDay = (d.selectedDay + delta + 7) % 7;
      scheduleSave(); rerender();
    });
    return b;
  }

  function applyNow() {
    const day = todayIdx();
    const hour = new Date().getHours();
    grid?.querySelectorAll?.('.today, .now').forEach((el) => el.classList.remove('today', 'now'));
    grid.querySelectorAll(`[data-day="${day}"]`).forEach((el) => el.classList.add('today'));
    grid.querySelectorAll(`[data-hour="${hour}"]`).forEach((el) => el.classList.add('now'));
    positionNowLine();
  }

  // Place the now-line at minute-precision over today's current-hour cell — only
  // when today's column is actually on screen.
  function positionNowLine() {
    const now = new Date();
    const day = todayIdx();
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

  function deleteTask(task, day, hour) {
    const k = cellKey(day, hour);
    const list = entriesAt(day, hour);
    const i = list.indexOf(task);
    if (i >= 0) list.splice(i, 1);
    if (list.length === 0) delete d.entries[k];
    scheduleSave(); rerender();
  }

  function renderCell(day, hour) {
    const cell = document.createElement('div');
    cell.className = 'planner-cell';
    cell.dataset.day = day;
    cell.dataset.hour = hour;

    entriesAt(day, hour).forEach((task) => {
      if (!task.done) cell.appendChild(renderTaskRow(task, day, hour));
    });

    const add = document.createElement('button');
    add.className = 'planner-add';
    add.textContent = '＋';
    add.title = 'Add a task';
    add.addEventListener('click', () => openInput(cell, day, hour, add));
    cell.appendChild(add);
    return cell;
  }

  function openInput(cell, day, hour, addBtn) {
    const existing = cell.querySelector('.planner-input');
    if (existing) { existing.focus(); return; }
    const input = document.createElement('input');
    input.className = 'planner-input';
    input.placeholder = 'New task…';
    input.spellcheck = true;
    let closed = false;
    const commit = () => {
      if (closed) return;
      closed = true;
      const text = input.value.trim();
      input.remove();
      if (!text) return;
      const k = cellKey(day, hour);
      (d.entries[k] = d.entries[k] || []).push({ id: uid('p'), text, done: false });
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

  // Reuses the todo row look (.todo-item / .striking) but with planner behaviour:
  // truncated text that opens a detail popup, and a ✕ that deletes for good.
  function renderTaskRow(task, day, hour) {
    const row = document.createElement('div');
    row.className = 'todo-item planner-task';

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
    text.addEventListener('click', () => openDetail(row, task, day, hour));

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Delete permanently';
    del.addEventListener('click', () => deleteTask(task, day, hour));

    row.append(cb, text, del);
    return row;
  }

  // Floating popup with the full, editable task text. Blur/Esc/outside-click
  // commits; emptying deletes the task.
  function openDetail(anchor, task, day, hour) {
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
        const list = entriesAt(day, hour);
        const i = list.indexOf(task);
        if (i >= 0) list.splice(i, 1);
        if (list.length === 0) delete d.entries[cellKey(day, hour)];
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

// A single shared popup handle so a rerender or a new popup closes the old one.
// Rerender-driven closes pass render=false to avoid recursing into rerender.
let activeDetail = null;
function closeDetail(fromRender) { if (activeDetail) activeDetail.commit(!fromRender); }
