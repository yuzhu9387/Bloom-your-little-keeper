import {
  getState, loadState, addWidget, closeWidget, getClosed, restoreClosed, clearClosed,
  newId, scheduleSave, flushSave, undo, redo
} from './store.js';
import { makeInteractive, bringToFront } from './canvas.js';
import { renderTodo, todoDefaults } from './widgets/todo.js';
import { renderCountdown, countdownDefaults } from './widgets/countdown-date.js';
import { renderTimer, timerDefaults } from './widgets/timer.js';
import { renderNote, noteDefaults } from './widgets/note.js';
import { renderPlanner, plannerDefaults } from './widgets/planner.js';

const canvas = document.getElementById('canvas');

const REGISTRY = {
  todo: { render: renderTodo, defaults: todoDefaults, w: 280, h: 340 },
  countdown: { render: renderCountdown, defaults: countdownDefaults, w: 260, h: 230 },
  timer: { render: renderTimer, defaults: timerDefaults, w: 240, h: 220 },
  note: { render: renderNote, defaults: noteDefaults, w: 280, h: 240 },
  planner: { render: renderPlanner, defaults: plannerDefaults, w: 640, h: 480 }
};

// Build the card chrome (header + body + resize handle) and mount its widget.
function mountCard(widget) {
  const spec = REGISTRY[widget.type];
  if (!spec) return null;

  const card = document.createElement('div');
  card.className = 'card card--' + widget.type;
  card.dataset.id = widget.id;

  const head = document.createElement('div');
  head.className = 'card-head';

  const defaultName = spec.defaults().title;
  const title = document.createElement('input');
  title.className = 'title-input';
  title.spellcheck = true;
  title.setAttribute('aria-label', 'Card name');
  title.value = widget.data.title || defaultName;
  title.size = Math.max(title.value.length, 4);
  title.addEventListener('input', () => {
    title.size = Math.max(title.value.length, 4);
    widget.data.title = title.value.trim() || defaultName;
    scheduleSave();
  });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') title.blur(); });
  title.addEventListener('blur', () => {
    if (!title.value.trim()) { title.value = defaultName; title.size = defaultName.length; }
  });

  const fill = document.createElement('div');
  fill.className = 'title-fill';

  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '✕';
  close.title = 'Close (recover from History)';
  close.addEventListener('click', () => {
    card.remove();
    closeWidget(widget.id); // moves to History instead of destroying
    refreshHistory();
  });
  head.append(title, fill, close);

  const body = document.createElement('div');
  body.className = 'card-body';

  const handle = document.createElement('div');
  handle.className = 'resize-handle';

  card.append(head, body, handle);
  canvas.appendChild(card);

  card.addEventListener('mousedown', () => bringToFront(card));
  makeInteractive(card, widget.id, widget);

  const onTitle = (t) => {
    if (document.activeElement !== title) { title.value = t; title.size = Math.max(t.length, 4); }
  };
  card.__rerender = () => spec.render(body, widget, onTitle);
  card.__rerender();
  return card;
}

// Re-mount every card from the (possibly restored) state — used after undo/redo.
function rebuildAll() {
  canvas.innerHTML = '';
  getState().widgets.forEach(mountCard);
}

// ---------- Spawn ----------
let spawnOffset = 0;
function spawn(type) {
  const spec = REGISTRY[type];
  spawnOffset = (spawnOffset + 28) % 200;
  const widget = {
    id: newId(),
    type,
    x: 40 + spawnOffset + canvas.scrollLeft,
    y: 40 + spawnOffset + canvas.scrollTop,
    w: spec.w,
    h: spec.h,
    data: spec.defaults()
  };
  addWidget(widget);
  const card = mountCard(widget);
  if (card) bringToFront(card);
}

document.querySelectorAll('#toolbar button[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => spawn(btn.dataset.add));
});

// ---------- History (recently closed cards) ----------
const historyBtn = document.getElementById('history-btn');
const historyPanel = document.getElementById('history-panel');

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function describe(w) {
  const d = w.data || {};
  if (w.type === 'todo') {
    const n = Array.isArray(d.nodes) ? d.nodes : [];
    const folders = n.filter((x) => x.type === 'folder');
    const loose = n.filter((x) => x.type === 'todo').length;
    const inFolders = folders.reduce((a, x) => a + (x.items ? x.items.length : 0), 0);
    return `${folders.length} folders · ${loose + inFolders} tasks`;
  }
  if (w.type === 'note') {
    const txt = (d.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return txt ? txt.slice(0, 28) : 'empty note';
  }
  if (w.type === 'planner') {
    const all = Object.values(d.entries || {}).filter(Array.isArray).flat();
    const active = all.filter((e) => !e.done).length;
    return active === 1 ? '1 task' : `${active} tasks`;
  }
  if (w.type === 'countdown') return d.date || 'no date set';
  if (w.type === 'timer') return (d.minutes || 0) + ' min timer';
  return '';
}

function renderHistory() {
  const closed = getClosed();
  historyPanel.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'hp-head';
  head.textContent = 'Recently closed';
  historyPanel.appendChild(head);

  if (closed.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hp-empty';
    empty.textContent = 'Nothing closed yet.';
    historyPanel.appendChild(empty);
    return;
  }

  closed.forEach((w) => {
    const row = document.createElement('button');
    row.className = 'hp-item card--' + w.type;
    const name = (w.data && w.data.title) ? w.data.title : w.type;
    row.innerHTML =
      `<span class="hp-dot"></span>` +
      `<span class="hp-name">${escapeHtml(name)}</span>` +
      `<span class="hp-meta">${escapeHtml(describe(w))}</span>`;
    row.title = 'Click to reopen';
    row.addEventListener('click', () => {
      const widget = restoreClosed(w.id);
      if (widget) {
        const card = mountCard(widget);
        if (card) bringToFront(card);
      }
      renderHistory();
      if (getClosed().length === 0) hideHistory();
    });
    historyPanel.appendChild(row);
  });

  const clearBtn = document.createElement('button');
  clearBtn.className = 'hp-clear';
  clearBtn.textContent = 'Clear history';
  clearBtn.addEventListener('click', () => { clearClosed(); renderHistory(); hideHistory(); });
  historyPanel.appendChild(clearBtn);
}

function positionHistory() {
  const r = historyBtn.getBoundingClientRect();
  historyPanel.style.top = (r.bottom + 8) + 'px';
  historyPanel.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
}
function showHistory() { renderHistory(); positionHistory(); historyPanel.hidden = false; }
function hideHistory() { historyPanel.hidden = true; }
function refreshHistory() { if (!historyPanel.hidden) renderHistory(); }

historyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (historyPanel.hidden) showHistory(); else hideHistory();
});
document.addEventListener('click', (e) => {
  if (!historyPanel.hidden && !historyPanel.contains(e.target) && e.target !== historyBtn) hideHistory();
});

// ---------- Undo / redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y) ----------
function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || isEditable(e.target)) return; // let native undo run inside fields/notes
  const k = e.key.toLowerCase();
  if (k === 'z') {
    e.preventDefault();
    if (e.shiftKey ? redo() : undo()) { rebuildAll(); refreshHistory(); }
  } else if (k === 'y') {
    e.preventDefault();
    if (redo()) { rebuildAll(); refreshHistory(); }
  }
});

// ---------- Persist on quit / reload ----------
window.addEventListener('beforeunload', () => flushSave());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});

// ---------- Boot ----------
loadState().then(() => {
  getState().widgets.forEach(mountCard);
});
